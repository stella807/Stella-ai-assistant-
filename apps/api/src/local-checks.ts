/**
 * "Checked today": things a person from Safehubby saw on the ground (is it open, is it in stock, how long is the line),
 * each with when it was seen, by whom, and how long it can be trusted. Agents say they would pay for what is true today
 * and cannot be guessed, so this is built to be dated, attributed and short-lived. A stale check is never handed out.
 * No links, email addresses or phone numbers are kept, and nothing is invented: with no check, there is no answer.
 */
export type CheckKind = "open" | "stock" | "line" | "other";
export type Evidence = "photo" | "receipt" | "call" | "none";
export interface LocalCheck {
  id: string; kind: CheckKind; place: string; subject: string; statement: string;
  observedAt: string; validUntil: string; checkedBy: string; evidence: Evidence; recordedAt: string;
}

/** How long each kind can be trusted when the person recording does not say. A line changes in minutes; opening hours hold for hours. */
const TRUST_MINUTES: Record<CheckKind, number> = { open: 360, stock: 180, line: 45, other: 360 };
const MAX_TRUST_MINUTES = 1440;
const MAX_AGE_DAYS = 7;
export const KEEP_DAYS = 14;
const KEEP_MAX = 2000;
const FUTURE_SLACK_MS = 5 * 60_000;
const KINDS = new Set<string>(["open", "stock", "line", "other"]);
const EVIDENCE = new Set<string>(["photo", "receipt", "call", "none"]);
const CONTACT = /https?:|www\.|@|\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b/i;
const STOP = new Set(["the", "and", "for", "are", "was", "has", "have", "does", "this", "that", "with", "from", "now", "today", "right", "any", "there", "its"]);

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function buildCheck(input: unknown, now: Date, id: string): LocalCheck | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Send the check as an object." };
  const b = input as Record<string, unknown>;
  const kind = clip(b.kind, 10);
  if (!KINDS.has(kind)) return { error: "kind must be open, stock, line or other." };
  const place = clip(b.place, 80), subject = clip(b.subject, 120), statement = clip(b.statement, 300), checkedBy = clip(b.checkedBy, 40);
  if (place.length < 2) return { error: "Say the place." };
  if (subject.length < 2) return { error: "Say what was checked." };
  if (statement.length < 2) return { error: "Say what you saw." };
  if (!checkedBy) return { error: "Say who was there. A check nobody stood behind is not sold." };
  if ([place, subject, statement, checkedBy].some((t) => CONTACT.test(t))) return { error: "Leave links, email addresses and phone numbers out of a check." };
  const evidence = clip(b.evidence, 10) || "none";
  if (!EVIDENCE.has(evidence)) return { error: "evidence must be photo, receipt, call or none." };
  const seen = new Date(typeof b.observedAt === "string" ? b.observedAt : "");
  if (Number.isNaN(seen.getTime())) return { error: "observedAt must be a time, such as 2026-11-19T14:30:00Z." };
  if (seen.getTime() > now.getTime() + FUTURE_SLACK_MS) return { error: "observedAt is in the future." };
  if (now.getTime() - seen.getTime() > MAX_AGE_DAYS * 86_400_000) return { error: `A check older than ${MAX_AGE_DAYS} days is not worth selling.` };
  const asked = Number(b.validForMinutes);
  const minutes = Math.min(MAX_TRUST_MINUTES, Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : TRUST_MINUTES[kind as CheckKind]);
  return {
    id, kind: kind as CheckKind, place, subject, statement, checkedBy, evidence: evidence as Evidence,
    observedAt: seen.toISOString(), validUntil: new Date(seen.getTime() + minutes * 60_000).toISOString(), recordedAt: now.toISOString(),
  };
}

/** Words that say what kind of fact it is, not which one. A match on these alone is not an answer: "clinic open" must not return a pharmacy. */
const GENERIC = new Set(["open", "closed", "hours", "stock", "stocked", "line", "wait", "long", "available", "close", "opens", "check"]);
/** Spanish names the same places; both sides are folded to one word so a question in either language finds the check. */
const FOLD: [RegExp, string][] = [[/farmacia/g, "pharmacy"], [/aeropuerto/g, "airport"], [/clinica/g, "clinic"], [/supermercado/g, "supermarket"], [/abierto|abierta/g, "open"]];
const fold = (t: string) => FOLD.reduce((acc, [re, to]) => acc.replace(re, to), t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const words = (q: string) => [...new Set(fold(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
const haystack = (c: LocalCheck) => fold(`${c.place} ${c.subject} ${c.statement}`);

export interface CheckResult { id: string; kind: CheckKind; place: string; subject: string; statement: string; observedAt: string; validUntil: string; ageMinutes: number; fresh: true; checkedBy: string; evidence: Evidence }

/** Fresh matches, best match first and then newest. `newestStaleMinutes` is only set when something matched but had expired. */
export function searchChecks(all: LocalCheck[], q: string, now: Date, limit = 10): { fresh: CheckResult[]; newestStaleMinutes?: number } {
  const terms = words(q);
  if (!terms.length) return { fresh: [] };
  // Enough of the words must match, and at least one must name the place or thing, not just the kind of fact.
  const need = Math.ceil(terms.length / 2);
  const scored = all.map((c) => ({ c, hit: terms.filter((t) => haystack(c).includes(t)) })).filter((x) => x.hit.length >= need && x.hit.some((t) => !GENERIC.has(t))).map((x) => ({ c: x.c, score: x.hit.length }));
  const live = scored.filter((x) => new Date(x.c.validUntil) > now);
  live.sort((a, b) => b.score - a.score || b.c.observedAt.localeCompare(a.c.observedAt));
  const fresh = live.slice(0, Math.max(1, Math.min(25, limit))).map(({ c }): CheckResult => ({
    id: c.id, kind: c.kind, place: c.place, subject: c.subject, statement: c.statement, observedAt: c.observedAt, validUntil: c.validUntil,
    ageMinutes: Math.max(0, Math.round((now.getTime() - new Date(c.observedAt).getTime()) / 60_000)), fresh: true, checkedBy: c.checkedBy, evidence: c.evidence,
  }));
  const stale = scored.filter((x) => new Date(x.c.validUntil) <= now).sort((a, b) => b.c.observedAt.localeCompare(a.c.observedAt))[0];
  if (fresh.length || !stale) return { fresh };
  return { fresh, newestStaleMinutes: Math.round((now.getTime() - new Date(stale.c.observedAt).getTime()) / 60_000) };
}

export const freshCount = (all: LocalCheck[], now: Date) => all.filter((c) => new Date(c.validUntil) > now).length;

/** Old checks are forgotten, and the list is capped, so it cannot grow without end. */
export function prune(all: LocalCheck[], now: Date): LocalCheck[] {
  return all.filter((c) => now.getTime() - new Date(c.observedAt).getTime() < KEEP_DAYS * 86_400_000).slice(-KEEP_MAX);
}
