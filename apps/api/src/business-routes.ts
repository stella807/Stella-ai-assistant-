import {
  DEFAULT_MESSAGE_LIMIT, EMPTY_ASSISTANT, businessHandoff, businessPrompt, retrieveBusinessFacts, validateAssistant,
  type Business, type BusinessConversation,
} from "@safehubby/core";
import { hashPassword, newSessionToken, sweepExpiredSessions, verifyPassword } from "./auth.ts";
import { llmComplete, llmConfigured } from "./adapters/llm.ts";
import { newId } from "./store.ts";
import type { Ctx, HttpError as HttpErrorClass, MasterScopeName } from "./routes.ts";

/**
 * Safehubby Business, stage 1: another company's AI employee on its own website.
 *
 * Three separate identities meet here and never mix: the Safehubby owner (creates and suspends businesses), a
 * business (signs in with its own key, sees only its own assistant and conversations), and an anonymous visitor
 * of that business's website (the chat box). The assistant answers only from what the business typed in, never from
 * Safehubby's own members or another business. The visitor's words travel as the question, never as the rules.
 */

type Handler = (ctx: Ctx, params: Record<string, string>, body: any) => unknown | Promise<unknown>;
interface Deps {
  HttpError: typeof HttpErrorClass;
  requireAdmin: (ctx: Ctx, scope?: MasterScopeName) => void;
  cleanText: (value: unknown, max: number) => string;
  notFound: (what: string) => Error;
  req: (params: Record<string, string>, name: string) => string;
}

export const BIZ_SESSION_COOKIE = "sh_biz_session";
export const BIZ_SESSION_TTL_MS = 12 * 3_600_000;

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const isSpanish = (q: string) => /[¿¡áéíóúñ]|\b(hola|cu[aá]nto|d[oó]nde|horario|precio|gracias|tienen|hay|buenas)\b/i.test(q);

/** An origin the owner may list as allowed to show the chat box: https, or http for local testing. */
export function cleanOrigin(value: unknown): string | null {
  try {
    const u = new URL(String(value ?? "").trim());
    if (u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return u.origin;
  } catch { /* not an address */ }
  return null;
}

export function businessRoutes(d: Deps): Record<string, Handler> {
  const { HttpError, requireAdmin, cleanText, notFound } = d;
  const businessesOf = (ctx: Ctx): Business[] => ctx.store.data.businesses ?? [];
  const find = (ctx: Ctx, id: string) => businessesOf(ctx).find((b) => b.id === id);
  const usedThisMonth = (ctx: Ctx, id: string) => ctx.store.data.bizUsage?.[`${id}:${monthKey(ctx.now())}`] ?? 0;

  /** The signed-in business, or a refusal. */
  const bizOf = (ctx: Ctx): Business => {
    const found = ctx.bizActorId ? find(ctx, ctx.bizActorId) : undefined;
    if (!found) throw new HttpError(401, "Sign in to your business account.");
    return found;
  };

  const publicView = (ctx: Ctx, b: Business) => ({
    id: b.id, name: b.name, contactEmail: b.contactEmail, status: b.status, messageLimit: b.messageLimit, allowedOrigins: b.allowedOrigins,
    assistant: b.assistant, usage: { month: monthKey(ctx.now()), used: usedThisMonth(ctx, b.id) },
  });

  const newKeyFor = async (ctx: Ctx, b: Business): Promise<string> => {
    // The id is part of the key so a sign-in finds its business directly and checks one secret, not every business's.
    const key = `${b.id}.${newSessionToken()}`;
    const keyHash = await hashPassword(key.slice(b.id.length + 1));
    ctx.store.update((db) => { db.bizCredentials = { ...db.bizCredentials, [b.id]: { keyHash, createdAt: ctx.now().toISOString() } }; });
    return key;
  };

  /**
   * One answer for a business. Counts and logs only when asked: the owner's own test question is neither, and a
   * visitor's question that no fact covers goes to a person without asking the model at all.
   */
  const answer = async (ctx: Ctx, b: Business, question: string, opts: { count: boolean; log: boolean }) => {
    const lang: "en" | "es" = b.assistant.language === "es" ? "es" : b.assistant.language === "en" ? "en" : isSpanish(question) ? "es" : "en";
    const handoff = businessHandoff(b, lang);
    let text = handoff;
    let source: "ai" | "handoff" = "handoff";
    const hasFact = retrieveBusinessFacts(b, question, 1).length > 0;
    const overLimit = usedThisMonth(ctx, b.id) >= b.messageLimit;
    if (hasFact && !overLimit && llmConfigured("SITE_CHAT") && !(opts.count && ctx.limiters.widgetAll.hit("all"))) {
      const prompt = businessPrompt(b, question);
      try {
        text = await llmComplete("SITE_CHAT", { system: prompt.system, messages: [{ role: "user", content: prompt.question }], maxTokens: 250, temperature: 0.1 });
        source = "ai";
      } catch (err) {
        console.warn("[safehubby] business assistant could not answer:", err instanceof Error ? err.message.slice(0, 120) : "unknown error");
      }
    }
    const at = ctx.now().toISOString();
    ctx.store.update((db) => {
      if (source === "ai" && opts.count) db.bizUsage = { ...db.bizUsage, [`${b.id}:${monthKey(ctx.now())}`]: usedThisMonth(ctx, b.id) + 1 };
      if (opts.log) {
        const entry: BusinessConversation = { id: newId("bcv"), businessId: b.id, at, question: question.slice(0, 500), answer: text.slice(0, 1500), source };
        // Each business keeps its newest 1,000; the whole store keeps its newest 20,000.
        const mine = (db.bizConversations ?? []).filter((c) => c.businessId === b.id);
        const rest = (db.bizConversations ?? []).filter((c) => c.businessId !== b.id);
        db.bizConversations = [...rest, ...mine.slice(-999), entry].slice(-20_000);
      }
    });
    return { answer: text, source };
  };

  const widgetBusiness = (ctx: Ctx, id: string): Business => {
    const b = find(ctx, id);
    if (!b) throw notFound("Assistant");
    return b;
  };

  /** A site that is not on the business's list may not use its assistant, so nobody else can run up its allowance. */
  const originAllowed = (ctx: Ctx, b: Business) =>
    b.allowedOrigins.length === 0 || (ctx.requestOrigin != null && b.allowedOrigins.includes(ctx.requestOrigin));

  return {
    /* ---- the Safehubby owner ---- */
    "GET /api/master/businesses": (ctx) => {
      requireAdmin(ctx, "money");
      return {
        businesses: businessesOf(ctx).map((b) => ({
          id: b.id, name: b.name, contactEmail: b.contactEmail, status: b.status, messageLimit: b.messageLimit, assistantName: b.assistant.name,
          used: usedThisMonth(ctx, b.id), conversations: (ctx.store.data.bizConversations ?? []).filter((c) => c.businessId === b.id).length, createdAt: b.createdAt,
        })),
        month: monthKey(ctx.now()),
      };
    },

    "POST /api/master/businesses": async (ctx, _p, body) => {
      requireAdmin(ctx, "write");
      const name = cleanText(body?.name, 80);
      const contactEmail = cleanText(body?.contactEmail, 160).toLowerCase();
      if (!name) throw new HttpError(400, "Name the business.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new HttpError(400, "Enter the business's email address.");
      const limit = Math.floor(Number(body?.messageLimit) || DEFAULT_MESSAGE_LIMIT);
      const at = ctx.now().toISOString();
      const b: Business = {
        id: newId("biz"), name, contactEmail, status: "active", messageLimit: Math.min(100_000, Math.max(1, limit)), allowedOrigins: [],
        assistant: { ...EMPTY_ASSISTANT, name: "Assistant", welcome: `Hi! I'm an AI assistant for ${name}. How can I help?` }, createdAt: at, updatedAt: at,
      };
      ctx.store.update((db) => { db.businesses = [...(db.businesses ?? []), b]; });
      // Shown once. Only a hash is kept, so it cannot be looked up later, only replaced.
      return { business: { id: b.id, name: b.name }, key: await newKeyFor(ctx, b) };
    },

    "POST /api/master/businesses/:id": (ctx, p, body) => {
      requireAdmin(ctx, "write");
      const id = d.req(p, "id");
      if (!find(ctx, id)) throw notFound("Business");
      const status = body?.status === undefined ? undefined : String(body.status);
      if (status !== undefined && status !== "active" && status !== "suspended") throw new HttpError(400, "Status is active or suspended.");
      const limit = body?.messageLimit === undefined ? undefined : Math.floor(Number(body.messageLimit));
      if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 100_000)) throw new HttpError(400, "The monthly limit must be between 1 and 100,000.");
      ctx.store.update((db) => {
        const b = (db.businesses ?? []).find((x) => x.id === id)!;
        if (status) b.status = status;
        if (limit !== undefined) b.messageLimit = limit;
        b.updatedAt = ctx.now().toISOString();
        // A suspended business is signed out everywhere.
        if (status === "suspended") db.bizSessions = (db.bizSessions ?? []).filter((s) => s.businessId !== id);
      });
      return { ok: true };
    },

    "POST /api/master/businesses/:id/new-key": async (ctx, p) => {
      requireAdmin(ctx, "write");
      const b = find(ctx, d.req(p, "id"));
      if (!b) throw notFound("Business");
      const key = await newKeyFor(ctx, b);
      ctx.store.update((db) => { db.bizSessions = (db.bizSessions ?? []).filter((s) => s.businessId !== b.id); });
      return { key };
    },

    /* ---- a business signing in to its own account ---- */
    "POST /api/biz/login": async (ctx, _p, body) => {
      if (ctx.limiters.bizLogin.hit(ctx.clientKey)) throw new HttpError(429, "Too many sign-in attempts. Try again later.");
      const key = String(body?.key ?? "").trim();
      const dot = key.indexOf(".");
      const b = dot > 0 ? find(ctx, key.slice(0, dot)) : undefined;
      const cred = b ? ctx.store.data.bizCredentials?.[b.id] : undefined;
      // The same answer for every reason, so a guess learns nothing.
      if (!b || !cred || !(await verifyPassword(key.slice(dot + 1), cred.keyHash)) || b.status !== "active") throw new HttpError(401, "That key is not valid.");
      const token = newSessionToken();
      const now = ctx.now();
      ctx.store.update((db) => {
        db.bizSessions = sweepExpiredSessions(db.bizSessions ?? [], now);
        db.bizSessions.push({ token, businessId: b.id, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + BIZ_SESSION_TTL_MS).toISOString() });
      });
      ctx.limiters.bizLogin.reset(ctx.clientKey);
      ctx.setBizSession?.(token);
      return { name: b.name };
    },

    "POST /api/biz/logout": (ctx) => {
      const token = ctx.bizSessionToken;
      if (token) ctx.store.update((db) => { db.bizSessions = (db.bizSessions ?? []).filter((s) => s.token !== token); });
      ctx.setBizSession?.(null);
      return { ok: true };
    },

    "GET /api/biz/me": (ctx) => ({ business: publicView(ctx, bizOf(ctx)) }),

    "POST /api/biz/assistant": (ctx, _p, body) => {
      const b = bizOf(ctx);
      const { value, errors } = validateAssistant(body?.assistant);
      if (errors.length) throw new HttpError(400, errors.join(" "));
      const origins: string[] = [];
      for (const raw of Array.isArray(body?.allowedOrigins) ? body.allowedOrigins : []) {
        if (!String(raw ?? "").trim()) continue;
        const o = cleanOrigin(raw);
        if (!o) throw new HttpError(400, `"${cleanText(raw, 80)}" is not a website address. Use the full address, like https://example.com.`);
        if (!origins.includes(o)) origins.push(o);
      }
      ctx.store.update((db) => {
        const x = (db.businesses ?? []).find((y) => y.id === b.id)!;
        x.assistant = value; x.allowedOrigins = origins.slice(0, 10); x.updatedAt = ctx.now().toISOString();
      });
      return { business: publicView(ctx, find(ctx, b.id)!) };
    },

    "GET /api/biz/conversations": (ctx) => {
      const b = bizOf(ctx);
      return { conversations: (ctx.store.data.bizConversations ?? []).filter((c) => c.businessId === b.id).slice(-200).reverse() };
    },

    /** The business trying its own assistant: not counted, not saved, but limited so it cannot be used as a free model. */
    "POST /api/biz/test": async (ctx, _p, body) => {
      const b = bizOf(ctx);
      const question = cleanText(body?.question, 500);
      if (question.length < 2) throw new HttpError(400, "Type a question.");
      if (ctx.limiters.bizTest.hit(b.id)) throw new HttpError(429, "That is a lot of tests for now. Try again in an hour.");
      return answer(ctx, b, question, { count: false, log: false });
    },

    /* ---- a visitor of the business's website (no sign-in, no cookie) ---- */
    "GET /api/widget/:id/config": (ctx, p) => {
      const b = widgetBusiness(ctx, d.req(p, "id"));
      if (b.status !== "active" || !originAllowed(ctx, b)) throw notFound("Assistant");
      const a = b.assistant;
      return { name: a.name, business: b.name, welcome: a.welcome || `Hi! I'm ${a.name}, an AI assistant for ${b.name}.`, language: a.language };
    },

    "POST /api/widget/:id/ask": async (ctx, p, body) => {
      const b = widgetBusiness(ctx, d.req(p, "id"));
      if (b.status !== "active" || !originAllowed(ctx, b)) throw notFound("Assistant");
      const question = cleanText(body?.question, 500);
      if (question.length < 2) throw new HttpError(400, "Type a question.");
      if (ctx.limiters.widget.hit(`${b.id}|${ctx.clientKey}`)) throw new HttpError(429, "You have asked a lot of questions. Please contact the business directly.");
      return answer(ctx, b, question, { count: true, log: true });
    },
  };
}
