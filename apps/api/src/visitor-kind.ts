import { promises as nodeDns } from "node:dns";

/**
 * Telling who is reading the site. Used only to decide who is asked to pay the site pass, so it errs toward letting
 * people in: a real person is never asked to pay because of a guess. Three honest tools:
 *  - the names AI crawlers give themselves, and the names scripts and headless browsers do not bother to hide;
 *  - a visitor that says it is a browser but sends none of what every real browser sends (a language);
 *  - a visitor that says it is Google or Bing, checked against the address it really comes from.
 * Nothing here can catch a crawler that copies a real browser perfectly. That one reads the site free.
 */

/** Named AI crawlers and assistants. Search engines (Googlebot, bingbot, DuckDuckBot, Applebot) are deliberately not here. */
const AI_AGENTS = /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Bytespider|Meta-ExternalAgent|meta-externalfetcher|cohere-ai|Diffbot|YouBot|MistralAI-User|DuckAssistBot|Amazonbot)/i;

/** Scripting libraries and headless browsers. Plain curl and wget are left out: people and health checks use them. */
const AUTOMATION = /(python-requests|python-httpx|httpx\/|aiohttp|Go-http-client|axios\/|node-fetch|undici\/|Scrapy|okhttp|HeadlessChrome|PhantomJS|puppeteer|playwright|libwww-perl|Apache-HttpClient|colly|mechanize|Faraday|RestSharp)/i;

export const isAiAgent = (userAgent: string | undefined): boolean => !!userAgent && AI_AGENTS.test(userAgent);

export type VisitorKind = "ai" | "automation" | "browser-lookalike" | "search-claim" | "normal";

type Headers = Record<string, string | undefined>;

export function classifyVisitor(userAgent: string | undefined, headers: Headers): VisitorKind {
  const ua = userAgent ?? "";
  if (!ua) return "normal";
  if (AI_AGENTS.test(ua)) return "ai";
  if (/Googlebot|bingbot/i.test(ua)) return "search-claim";
  if (AUTOMATION.test(ua)) return "automation";
  // A browser name, no bot-like word in it, and neither a language nor a Sec-Fetch header: a script dressed as a browser.
  // Old phones lack Sec-Fetch and every real browser sends a language, so one of the two is enough to be let in.
  const claimsBrowser = ua.startsWith("Mozilla/5.0") && /(Chrome|Firefox|Safari|Edg\/|OPR\/)/.test(ua) && !/(bot|spider|crawl|preview|facebookexternalhit|slurp|whatsapp)/i.test(ua);
  if (claimsBrowser && !headers["accept-language"] && !headers["sec-fetch-mode"]) return "browser-lookalike";
  return "normal";
}

/** What a reverse-and-forward address check needs, so tests can supply their own. */
export interface Dns { reverse(ip: string): Promise<string[]>; lookup(host: string): Promise<string[]> }
const realDns: Dns = {
  reverse: (ip) => nodeDns.reverse(ip),
  lookup: async (host) => [...(await nodeDns.resolve4(host).catch(() => [])), ...(await nodeDns.resolve6(host).catch(() => []))],
};
export const dnsFor = { current: realDns as Dns };

const ENGINES: { test: RegExp; suffixes: string[] }[] = [
  { test: /Googlebot/i, suffixes: [".googlebot.com", ".google.com"] },
  { test: /bingbot/i, suffixes: [".search.msn.com"] },
];
const cache = new Map<string, { result: "real" | "fake"; until: number }>();
const DAY_MS = 86_400_000;

/**
 * A visitor that says it is Googlebot or bingbot is real if its address's name ends with the engine's domain and that name
 * points back to the same address (the check the engines themselves publish). If the check cannot be made at all (a DNS
 * outage), the visitor is treated as real: the site's ranking matters more than a missed charge.
 */
export async function verifySearchEngine(ip: string, userAgent: string, dns: Dns = dnsFor.current, now = Date.now()): Promise<"real" | "fake"> {
  const engine = ENGINES.find((e) => e.test.test(userAgent));
  if (!engine) return "real";
  const key = `${ip}|${engine.suffixes[0]}`;
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.result;
  let result: "real" | "fake";
  try {
    const names = await dns.reverse(ip);
    let ok = false;
    for (const name of names) {
      const n = name.toLowerCase().replace(/\.$/, "");
      if (!engine.suffixes.some((s) => n.endsWith(s))) continue;
      if ((await dns.lookup(n)).includes(ip)) { ok = true; break; }
    }
    result = ok ? "real" : "fake";
  } catch (err) {
    const code = (err as { code?: string }).code;
    // No name at all for the address is an answer (not Google); anything else is a failed check.
    result = code === "ENOTFOUND" || code === "ENODATA" ? "fake" : "real";
    if (result === "real") return result; // not cached: try again next time
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, { result, until: now + DAY_MS });
  return result;
}

/** Counts page requests per address over a sliding window. Off by default: a limit of 0 never flags anyone. */
export class PageRateTracker {
  #hits = new Map<string, number[]>();
  limit: number;
  windowMinutes: number;
  // Plain fields, not constructor shorthand: the server runs under Node's type-stripping, which does not allow it.
  constructor(limit: number, windowMinutes: number) { this.limit = limit; this.windowMinutes = windowMinutes; }
  /** Records one request and says whether the address is now over the limit. */
  hit(key: string, now: Date): boolean {
    if (this.limit <= 0) return false;
    const cutoff = now.getTime() - this.windowMinutes * 60_000;
    const mine = (this.#hits.get(key) ?? []).filter((t) => t > cutoff);
    mine.push(now.getTime());
    this.#hits.set(key, mine);
    if (this.#hits.size > 10_000) this.#hits.clear();
    return mine.length > this.limit;
  }
}
