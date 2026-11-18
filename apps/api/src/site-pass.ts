import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { takePayment, x402Config, type AgentSale } from "./x402-sales.ts";
import { newId, type StoreLike } from "./store.ts";
import { sitePassInfo } from "./site-pass-info.ts";

/**
 * The site pass: an AI crawler or agent that identifies itself as one pays once (default $8.99 in USDC) for 30 days of
 * access to the website's pages. People, search engines and everyone else read the site free, and the blog, the store,
 * the API, robots.txt, the sitemap, the chat box script and files such as scripts and images are never charged.
 *
 * Honest limits: it works by the name a visitor gives itself, so a crawler that pretends to be a browser reads the
 * site free. Search engines are never in the list, so what they see is what everyone sees. Off unless paid access is on
 * (X402_ENABLED) and off with X402_SITE_PASS=off.
 */

/** Named AI crawlers and assistants. Search engines (Googlebot, bingbot, DuckDuckBot, Applebot) are deliberately not here. */
const AI_AGENTS = /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Bytespider|Meta-ExternalAgent|meta-externalfetcher|cohere-ai|Diffbot|YouBot|MistralAI-User|DuckAssistBot|Amazonbot)/i;

export function isAiAgent(userAgent: string | undefined): boolean {
  return !!userAgent && AI_AGENTS.test(userAgent);
}

/** The website's own pages: not the blog, the API, search files, the chat box script, or anything with a file extension. */
export function isGatedPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (/^\/(es\/)?blog(\/|$)/.test(p)) return false;
  if (p.startsWith("/api/") || p.startsWith("/openreceive/") || p.startsWith("/assets/")) return false;
  if (/\.[a-z0-9]{1,8}$/.test(p)) return false; // robots.txt, sitemap.xml, llms.txt, widget.js, images, fonts, scripts
  return true;
}

const DAY_MS = 86_400_000;
const sign = (secret: string, payer: string, exp: number) => createHmac("sha256", secret).update(`${payer}.${exp}`).digest("base64url");

/** `<payer>.<expiry>.<signature>`: only this server can make one, and changing any part breaks it. */
export function makePass(secret: string, payer: string, now: Date, days: number): string {
  const p = payer.toLowerCase();
  const exp = Math.floor((now.getTime() + days * DAY_MS) / 1000);
  return `${p}.${exp}.${sign(secret, p, exp)}`;
}

export function passIsValid(secret: string, pass: string | undefined, now: Date): boolean {
  const parts = (pass ?? "").split(".");
  if (parts.length !== 3) return false;
  const [payer, expText, sig] = parts as [string, string, string];
  const exp = Number(expText);
  if (!payer || !Number.isInteger(exp) || exp * 1000 <= now.getTime()) return false;
  const want = Buffer.from(sign(secret, payer, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export const PASS_HEADER = "x-safehubby-pass";
const sitePassPrice = () => sitePassInfo().price;
const passDays = () => sitePassInfo().days;

/** Whether the pass is in force at all: paid access is on, and it was not switched off. */
export const sitePassOn = (): boolean => !("error" in x402Config()) && process.env.X402_SITE_PASS?.trim().toLowerCase() !== "off";

function secretFor(store: StoreLike): string {
  let secret = store.data.sitePassSecret;
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    store.update((db) => { db.sitePassSecret = secret; });
  }
  return secret;
}

/**
 * Decides one page request. Returns true when this answered it (asked for payment, or refused), false when the page
 * should be served as usual (with the pass header already set if this request just paid for one).
 */
export async function gateSitePage(
  req: IncomingMessage, res: ServerResponse, pathname: string, store: StoreLike, now: () => Date, getOrigin: () => string,
): Promise<boolean> {
  const ua = req.headers["user-agent"];
  if (!sitePassOn() || !isGatedPath(pathname) || !isAiAgent(Array.isArray(ua) ? ua[0] : ua)) return false;
  const secret = secretFor(store);
  const held = req.headers[PASS_HEADER];
  if (passIsValid(secret, Array.isArray(held) ? held[0] : held, now())) return false;

  const price = sitePassPrice();
  const paid = await takePayment(req, res, {
    path: pathname, origin: getOrigin(), price,
    description: `Safehubby site pass: ${passDays()} days of access to safehubby.com for AI crawlers and agents. The blog, the agent store and the API are not covered and never need it. Send the pass back in an X-Safehubby-Pass header.`,
  });
  if (!paid) return true;
  const sale: AgentSale = {
    id: newId("sal"), at: now().toISOString(), product: "site-pass", network: paid.network, amount: paid.amount,
    payer: paid.payer, transaction: paid.transaction, query: pathname.slice(0, 120), results: 1,
  };
  store.update((db) => { db.agentSales = [...(db.agentSales ?? []), sale].slice(-5000); });
  for (const [k, v] of Object.entries(paid.headers)) res.setHeader(k, v);
  res.setHeader("X-Safehubby-Pass", makePass(secret, paid.payer ?? "unknown", now(), passDays()));
  res.setHeader("Access-Control-Expose-Headers", "X-Safehubby-Pass, PAYMENT-RESPONSE");
  return false;
}
