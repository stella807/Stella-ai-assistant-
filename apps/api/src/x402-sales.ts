import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { CONTACT_EMAIL, WHATSAPP_DISPLAY, buildKnowledge, lookupAirports, retrieveKnowledge, type SiteLang } from "@safehubby/core";
import { articleIndex, articleText, findArticle } from "./blog.ts";
import { newId, type StoreLike } from "./store.ts";
import { sitePassInfo, passLength, sitePassEnabled, shownDescription } from "./site-pass-info.ts";
import { buildApprovalPack } from "./approval-pack.ts";
import { checkRequest } from "./request-check.ts";
import { noticesSince, seasonOn } from "./notices.ts";
import { freshCount, searchChecks } from "./local-checks.ts";
import { answerLive, isPowerOnly } from "./live-feeds.ts";
import { noteSignal } from "./signals.ts";
import { alertOwner } from "./owner-alerts.ts";
import { NFT_COLLECTION, NFT_PIECES } from "./nfts.ts";
import { createHash } from "node:crypto";
import { keyFromSeed, newSigningKey, signResponse, type SigningKeyRecord } from "./attestation.ts";
import { checklistIndex, checklistText, findChecklist } from "./checklists.ts";
import { BOOKS, readBook } from "./books.ts";
import { looksLikePersonInBrowser } from "./visitor-kind.ts";
import { payaiAuthHeaders } from "./payai-auth.ts";
import { checkSpend } from "./spend-check.ts";
import { FreeSamples, freeSamplesOn, nextFreeAt } from "./free-sample.ts";
import { discoveryFor, llmsTxt, openApiDoc, serviceInfo, wellKnownX402, type Listed } from "./x402-discovery.ts";

/**
 * What Safehubby sells to other AI agents, paid per request with x402 (USDC).
 *
 * Off unless X402_ENABLED is "true". Test money only: the network defaults to Base Sepolia (eip155:84532),
 * and a real-money network is refused unless X402_ALLOW_MAINNET is "yes", which the owner sets only after
 * deciding to go live. The server holds a receiving address (X402_PAY_TO), never a private key: it cannot
 * send money. A product's answer is given only after the facilitator has settled the payment.
 *
 * Only what can be delivered by software is for sale. Anything that needs a person (an errand, a visit to
 * check a place, an appointment) is not here: payment is not taken for work nobody has agreed to do.
 * The human blog and the website stay free for people and for search engines; only the clean-text copy
 * made for agents is paid.
 */

export const TESTNET = "eip155:84532";
const TESTNETS = new Set([TESTNET, "eip155:11155111"]);

export type AgentSale = { id: string; at: string; product?: string; network: string; amount: string; payer?: string; transaction?: string; query: string; results: number };

type Config = { payTo: string; network: string; facilitator: string; live: boolean; facilitatorName: string };

export const PAYAI_FACILITATOR = "https://facilitator.payai.network";
export const TESTNET_FACILITATOR = "https://x402.org/facilitator";

export function x402Config(): Config | { error: string } {
  if (process.env.X402_ENABLED !== "true") return { error: "Paid agent services are switched off on this server." };
  const payTo = process.env.X402_PAY_TO?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) return { error: "X402_PAY_TO is not a valid receiving address." };
  const network = process.env.X402_NETWORK?.trim() || TESTNET;
  const live = !TESTNETS.has(network);
  if (live && process.env.X402_ALLOW_MAINNET !== "yes") return { error: "Real-money networks are refused until the owner allows them." };
  // "payai" is a name for PayAI's facilitator, which settles real USDC on Base. The default for test money is the free x402.org one.
  const named = process.env.X402_FACILITATOR?.trim().toLowerCase();
  const facilitator = process.env.X402_FACILITATOR_URL?.trim() || (named === "payai" ? PAYAI_FACILITATOR : TESTNET_FACILITATOR);
  // x402.org's service is for test money only: pointing real money at it would never settle, so it is refused up front.
  if (live && /(^|\/\/)(www\.)?x402\.org\b/.test(facilitator)) return { error: "Real money needs a facilitator that settles on the real network: set X402_FACILITATOR=payai." };
  return { payTo, network, facilitator, live, facilitatorName: facilitator === PAYAI_FACILITATOR ? "PayAI" : new URL(facilitator).hostname };
}

export type ProductAnswer = { status: 200 | 400 | 404; body: unknown; results: number; summary: string; words?: string; file?: { data: Buffer; filename: string } };

/** A paid product: its price, what it is, and what it returns for a request (or nothing, for a request it cannot answer). */
export interface Product {
  id: string;
  title: string;
  description: string;
  /** Where it is sold, and what to put in the query. */
  path: string;
  usage: string;
  defaultPrice: string;
  /** Sold only to someone who already holds a site pass, and charged for even then: the pass is the access, not the price. */
  requiresPass?: boolean;
  /** What an answer contains, and what it does not: shown in the catalog, in ?info and in every paid answer, so nobody pays for something they did not expect. */
  includes?: string[];
  limits?: string[];
  /** Charged even to a holder of a site pass, and the pass is not needed: for what is made for each asker by a person, not copied from a page. */
  alwaysPaid?: boolean;
  /** A price for this particular request when it differs from the product's usual one (one book costs more than the rest). */
  priceFor?(u: URL): string | undefined;
  /** `words` is what was searched for, in plain words, for the owner's numbers; empty when there is nothing to keep. */
  respond(url: URL, origin: string, store: StoreLike, now?: Date): ProductAnswer | Promise<ProductAnswer>;
}

const langOf = (u: URL): SiteLang => (u.searchParams.get("lang") === "es" ? "es" : "en");

export const PRODUCTS: Product[] = [
  {
    id: "facts", title: "Safehubby plans and prices",
    description: "The facts that answer a question about Safehubby's plans, prices, the Wingman Club, secure transport and safety rules, as structured text. The prices are read from the same list the app charges from.",
    path: "/api/agent/facts", usage: "GET ?q=your question", defaultPrice: "$0.01",
    respond(u) {
      const q = (u.searchParams.get("q") ?? "").slice(0, 300);
      if (q.trim().length < 2) return { status: 400, body: { error: "Add ?q= with your question." }, results: 0, summary: "" };
      const facts = retrieveKnowledge(q, 3).map((k) => ({ title: k.title, text: k.text }));
      return { status: 200, body: { facts }, results: facts.length, summary: q.slice(0, 120), words: q };
    },
  },
  {
    id: "blog", title: "Blog article, clean text",
    description: "One Safehubby blog article as plain text with its sources and the month each fact was read. The same article is free for people to read at safehubby.com/blog; this copy is made for software. Choose a slug from /api/agent/blog (free).",
    path: "/api/agent/blog/{slug}", usage: "GET /api/agent/blog/{slug}?lang=en|es", defaultPrice: "$0.01",
    respond(u) {
      const slug = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      const a = findArticle(slug, langOf(u));
      if (!a) return { status: 404, body: { error: "No article has that slug. See /api/agent/blog for the list." }, results: 0, summary: slug.slice(0, 80) };
      return { status: 200, body: { slug, lang: langOf(u), publishedOn: a.publishedOn, updatedOn: a.updatedOn, text: articleText(a, langOf(u)) }, results: 1, summary: `blog/${slug}`, words: `blog/${slug}` };
    },
  },
  {
    id: "digest", title: "Weekly digest",
    description: "What is new from Safehubby, in one answer: the newest blog articles and the ones updated lately (each with its date), and the current plans and prices. Built only from what Safehubby has published. Free with a site pass.",
    path: "/api/agent/digest", usage: "GET", defaultPrice: "$0.05",
    respond(_u, origin) {
      const lang: SiteLang = "en";
      const all = articleIndex(lang);
      const soon = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
      const item = (a: (typeof all)[number]) => ({ ...a, endpoint: `${origin}/api/agent/blog/${a.slug}?lang=${lang}` });
      const plans = buildKnowledge().find((k) => k.id === "plans-overview")?.text ?? "";
      return {
        status: 200, results: all.length, summary: "digest", words: "",
        body: {
          about: "Only what Safehubby has published, with its dates. It is not a promise of availability.",
          newest: all.slice(0, 8).map(item), updatedLately: all.filter((a) => (a.updatedOn ?? "") >= soon).slice(0, 8).map(item),
          plans, contact: { email: CONTACT_EMAIL, whatsapp: WHATSAPP_DISPLAY },
        },
      };
    },
  },
  {
    id: "brief", title: "Brief to forward to a person",
    description: "One plain-text page about Safehubby (what it does, the plans and prices, the safety rules, how to reach a person) written for an agent to forward to the person it works for. Free with a site pass.",
    path: "/api/agent/brief", usage: "GET", defaultPrice: "$0.05",
    respond(_u, origin) {
      const facts = buildKnowledge().map((k) => `${k.title}\n${k.text}`).join("\n\n");
      const forward = `Safehubby: concierge, assistants, errands and rides in Puerto Rico\n\n${facts}\n\nTo talk to a person: email ${CONTACT_EMAIL} or message ${WHATSAPP_DISPLAY} on WhatsApp.\nMore: ${origin}`;
      return { status: 200, body: { forward }, results: 1, summary: "brief", words: "" };
    },
  },
  {
    id: "airports", title: "Airport directory",
    description: "Airports in the cities Safehubby covers: name, three-letter code, city and country. Names and codes only. Free with a site pass.",
    path: "/api/agent/airports", usage: "GET ?q=city, country, airport name or code&country=&limit= (limit up to 100)", defaultPrice: "$0.01",
    respond(u) {
      const query = { q: u.searchParams.get("q") ?? "", country: u.searchParams.get("country") ?? "", limit: Number(u.searchParams.get("limit")) || 25 };
      const found = lookupAirports(query);
      return { status: 200, body: found, results: found.results.length, summary: JSON.stringify(query).slice(0, 200), words: [query.q, query.country].filter(Boolean).join(" ") };
    },
  },
  {
    id: "checklists", title: "Checklists to hand to a person",
    description: "Practical checklists in English and Spanish for the person an agent works for: a day at the hospital with a parent, arriving at an airport with an older relative, and questions to ask any concierge before hiring one. Plain text with empty boxes, ready to forward. General information, not medical or legal advice. Free with a site pass.",
    path: "/api/agent/checklists/{slug}", usage: "GET /api/agent/checklists/{slug}?lang=en|es (list them free at /api/agent/checklists)", defaultPrice: "$0.02",
    respond(u) {
      const lang: "en" | "es" = u.searchParams.get("lang") === "es" ? "es" : "en";
      const slug = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      const c = findChecklist(slug, lang);
      if (!c) return { status: 404, body: { error: "No checklist has that slug. See /api/agent/checklists for the list (add ?lang=es for Spanish)." }, results: 0, summary: slug.slice(0, 80) };
      return {
        status: 200, results: 1, summary: `checklist/${c.slug.en}`, words: `checklist/${c.slug.en}`,
        body: { slug: c.slug[lang], lang, title: c.title[lang], description: c.description[lang], groups: c.groups.map((g) => ({ heading: g.heading[lang], items: g.items.map((i) => i[lang]) })), forPerson: checklistText(c, lang) },
      };
    },
  },
  {
    id: "books", title: "Books (PDF)",
    description: "Practical guides as PDF files, written by Safehubby for AI agents (they are not shown to people in a browser): traveling with an older parent, hiring and working with a concierge, and visiting Puerto Rico. General information, not medical, legal or financial advice. List them free at /api/agent/books. Needs a site pass first (the pass is the access), then each book costs extra.",
    path: "/api/agent/books/{slug}", usage: "GET /api/agent/books/{slug} returns the PDF (list free at /api/agent/books)", defaultPrice: "$0.50", requiresPass: true,
    priceFor: (u) => BOOKS.find((b) => b.slug === decodeURIComponent(u.pathname.split("/").pop() ?? ""))?.price,
    respond(u) {
      const slug = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      const data = readBook(slug);
      if (!data) return { status: 404, body: { error: "No book has that slug. See /api/agent/books for the list." }, results: 0, summary: slug.slice(0, 80) };
      return { status: 200, body: null, results: 1, summary: `book/${slug}`, words: `book/${slug}`, file: { data, filename: `${slug}.pdf` } };
    },
  },
  {
    id: "currency", title: "Currency check",
    description: "Is an answer you hold still current? Give the SHA-256 (hex) of the exact bytes you were sent, from any signed answer, and get a signed reply: current if the same request would give the same answer today, changed if not. The signature on the answer proves where it came from; this says whether it is still true to what we publish. Never charged for an answer we did not issue. Free with a site pass.",
    path: "/api/agent/currency/{sha256}", usage: "GET /api/agent/currency/{sha256 of the response body, 64 hex characters}", defaultPrice: "$0.02",
    async respond(u, origin, store, at) {
      const hash = decodeURIComponent(u.pathname.split("/").pop() ?? "").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) return { status: 404, body: { error: "Give the 64-character SHA-256 (hex) of the response body you hold." }, results: 0, summary: "currency/invalid" };
      const receipt = store.data.receipts?.find((r) => r.sha256 === hash);
      if (!receipt) return { status: 404, body: { error: "This answer was not issued by this store, or is too old to be checked. You are not charged." }, results: 0, summary: `currency/${hash.slice(0, 12)}` };
      const product = PRODUCTS.find((p) => p.id === receipt.product && p.id !== "currency");
      let status: "current" | "changed" | "unknown" = "unknown";
      if (product) {
        try {
          const again = await product.respond(new URL(`${origin}${receipt.target}`), origin, store, at);
          const bytes: string | Buffer = again.file ? again.file.data : JSON.stringify(again.body);
          status = again.status === 200 && createHash("sha256").update(bytes).digest("hex") === hash ? "current" : "changed";
        } catch { status = "unknown"; }
      }
      return {
        status: 200, results: 1, summary: `currency/${receipt.product}`, words: "",
        body: { sha256: hash, found: true, product: receipt.product, issuedAt: receipt.at, keyId: receipt.keyId, status, checkedAt: (at ?? new Date()).toISOString() },
      };
    },
  },
  {
    id: "check", title: "Request check",
    description: "Before you hand a task to a person, send the request as JSON (task, needed_by, from, to, spend_cap, if_unavailable, proof_wanted, contact, private_details_shared). You get back what is missing, stop signs (gift cards, crypto, card numbers, no spending cap), what only the person may decide (a key, a door code, a health detail), warnings, and the request as plain text. Rules from the book Delegating Real-World Tasks. Nothing you send is kept. A request that cannot be read is refused before any payment. Free with a site pass.",
    path: "/api/agent/check", usage: "GET ?request={url-encoded JSON, under 2,000 characters}", defaultPrice: "$0.03",
    respond(u) {
      const raw = u.searchParams.get("request") ?? "";
      let parsed: unknown;
      try { parsed = raw.length > 0 && raw.length <= 2000 ? JSON.parse(raw) : undefined; } catch { parsed = undefined; }
      const result = checkRequest(parsed);
      if ("error" in result) return { status: 400, body: result, results: 0, summary: "check/unreadable" };
      // The request itself is the person's business: only that a check happened is counted.
      return { status: 200, body: result, results: 1, summary: "check", words: "" };
    },
  },
  {
    id: "spend", title: "Spending check",
    description: "Before you pay for something, send your person's spending rule and the purchase you are about to make, both as JSON. You get back allow, ask_person or deny, with the reasons and what is left of today's cap: over the per-request cap is refused, over the daily cap or not on the allowed list or a new kind of purchase goes to the person, and a retry is allowed only when the source was down and the rule permits it. A rule with no cap pre-approves nothing. Nothing you send is kept. The rule's shape is the one in the book Building for Agents. Charged for each check, even with a site pass.",
    path: "/api/agent/spend", usage: "GET ?rule={url-encoded JSON}&purchase={url-encoded JSON}, each under 2,000 characters. rule: max_per_request_usd, max_per_day_usd, allowed[], retry_if_source_down, ask_first_for[]. purchase: item, price_usd, spent_today_usd, seen_before, retry {count, because}", defaultPrice: "$0.05", alwaysPaid: true,
    respond(u) {
      const read = (k: string) => { const raw = u.searchParams.get(k) ?? ""; try { return raw.length > 0 && raw.length <= 2000 ? JSON.parse(raw) : undefined; } catch { return undefined; } };
      const result = checkSpend(read("rule"), read("purchase"));
      if ("error" in result) return { status: 400, body: result, results: 0, summary: "spend/unreadable" };
      return { status: 200, body: result, results: 1, summary: `spend/${result.decision}`, words: "" };
    },
  },
  {
    id: "alerts", title: "Alerts feed",
    description: "What changed at Safehubby since the time you last asked (new books and products), and where the Atlantic hurricane-season calendar stands. Every agent keeps its own place: pass the asOf from your last answer as since. Not a weather forecast and not an official warning. English or Spanish. Free with a site pass.",
    path: "/api/agent/alerts", usage: "GET ?since=ISO time&lang=en|es (leave since out to get everything)", defaultPrice: "$0.02",
    respond(u, _origin, _store, at) {
      const rawSince = u.searchParams.get("since");
      const since = rawSince ? new Date(rawSince) : undefined;
      if (since && Number.isNaN(since.getTime())) return { status: 400, body: { error: "since must be a time such as 2026-11-19T00:00:00Z." }, results: 0, summary: "alerts/invalid" };
      const lang = langOf(u);
      const now = at ?? new Date();
      const notices = noticesSince(now, since).map((n) => ({ id: n.id, at: n.at, kind: n.kind, title: n.title[lang], text: n.text[lang] }));
      return {
        status: 200, results: notices.length, summary: "alerts", words: "",
        body: { lang, asOf: now.toISOString(), since: since?.toISOString() ?? null, season: seasonOn(now), notices, note: "Notices about what Safehubby publishes and the hurricane-season calendar. Not a weather forecast and not an official warning: for storms, follow the National Weather Service and local officials." },
      };
    },
  },
  {
    id: "checked", title: "Checked today",
    description: "What a person from Safehubby saw on the ground in Puerto Rico, dated and attributed: whether a place is open, whether something is in stock, how long a line was. Each answer says when it was seen, who saw it, whether there is a photo or receipt, and until when it can be trusted. An expired check is never sold. Nothing is guessed: with no fresh check for your question, the answer says found: false, and the search is still charged. Charged for each answer, even with a site pass.",
    path: "/api/agent/checked", usage: "GET ?q=place, thing or question in a few words&limit= (up to 25)", defaultPrice: "$0.10", alwaysPaid: true,
    respond(u, _origin, store, at) {
      const q = (u.searchParams.get("q") ?? "").trim().slice(0, 100);
      const now = at ?? new Date();
      const found = searchChecks(store.data.localChecks ?? [], q, now, Number(u.searchParams.get("limit")) || 10);
      if (!found.fresh.length) {
        const stale = found.newestStaleMinutes === undefined ? "" : ` The newest check on this was ${found.newestStaleMinutes} minutes old and no longer fresh.`;
        // The words are kept as an unmet want, so the owner can see what agents ask for that nobody has checked.
        return { status: 200, body: { found: false, message: `No fresh check matches this.${stale} The search was made, so this answer is charged.` }, results: 0, summary: "checked/none", words: q };
      }
      return {
        status: 200, results: found.fresh.length, summary: "checked", words: q,
        body: { q, asOf: now.toISOString(), results: found.fresh, note: "Each result was seen by the person named, at the time shown. It can be out of date after validUntil. A check says what was seen then, not what is true now." },
      };
    },
  },
  {
    id: "live", title: "Live answers",
    description: "Right-now answers from official public sources, read when you ask and dated. A weather question gets the Puerto Rico weather bundle for one price: active storm and flood alerts for Puerto Rico (National Weather Service) with the time and official address of the GOES-East weather satellite's latest pictures of Puerto Rico (NOAA) and any active tropical storms with their distance from Puerto Rico (National Hurricane Center), plus power outages across the island and the status and delay outlook for SJU, BQN and PSE. Airport questions get delays, ground programs and closures at US and Puerto Rico airports (FAA), for example SJU delays, with an outlook of signs that often come before delays: lightning or low cloud at the field right now from its latest observation (lightning stops ground crews before any delay is posted), the arrival rate the FAA has set, the airport's official forecast for the next 24 hours (thunderstorms, low cloud, poor visibility, strong wind), what the FAA's plan for the day calls possible, big airports delayed now, and for Puerto Rico the hurricane center's chances of a storm forming and a year of on-time history by hour and day from the US DOT (how often each hour runs late, taxi times, the busiest departure hours, when security lines usually build). Also power outages across Puerto Rico by region, with load shedding, from the power company's public outage map, and pharmacies near any town, city or hospital in Puerto Rico or the United States (nearest first, with phone numbers and hours where the map has them, and whether each is open now) from OpenStreetMap and the federal NPI registry. A weather question that names a US place after the word in or near (for example: flood warning in Houston) gets the National Weather Service's active alerts for that exact point instead of the Puerto Rico bundle. Each answer names its source and the time it was read. Nothing is guessed: if the source cannot be reached or no source covers your question, there is no answer and you are not charged. A search that is made and finds nothing (for example no pharmacy on the map near the place you name) is charged, and the answer says found: false. Not a forecast. Limits: security-line hours use scheduled departures as a stand-in for TSA checkpoint counts, which could not be read; cruise ships in San Juan are left out until the port operator gives permission to use its schedule; history covers only carriers that report to the US DOT. Charged for each answer, even with a site pass.",
    includes: [
      "Weather alerts for Puerto Rico, or for any named place in the United States (National Weather Service)",
      "GOES-East satellite: when its latest pictures of Puerto Rico were made, and their official addresses (NOAA)",
      "Active tropical storms and their distance from Puerto Rico, and the chances of one forming in 2 and 7 days (National Hurricane Center)",
      "Power outages across Puerto Rico by region, with load shedding (LUMA's public outage map)",
      "Airport status now: delays, ground programs, closures (FAA)",
      "Signs of delays before they are posted: lightning or low cloud at the field, the FAA arrival rate, the 24-hour airport forecast, the FAA's plan for the day, big airports delayed now",
      "For SJU, BQN and PSE: a year of on-time history by hour and day, busiest departure hours, when security lines usually build, and the causes of delay (US DOT)",
      "For SJU, cruise ships in San Juan today and the next two days, once the port operator allows it",
      "Pharmacies near a town, city or hospital in Puerto Rico or the United States: nearest first, phone numbers and hours where the map has them, and whether each is open now (OpenStreetMap)",
    ],
    limits: [
      "Not a forecast and not a prediction about any flight: it shows official data and signs that often come before delays.",
      "Security-line hours use scheduled departures as a stand-in for TSA checkpoint counts, which could not be read.",
      "Cruise ships in San Juan are added to SJU answers only once San Juan Cruise Port gives written permission to use its schedule; until then they are left out.",
      "History covers October 2025 to September 2026 and only the carriers that report to the US DOT.",
      "Pharmacy stock is not included: pharmacies do not publish it in a form that may be read automatically. Call the pharmacy, or buy a Checked today answer. Map phone numbers and hours are recorded by volunteers and can be out of date.",
      "A part is null when its source could not be reached; with no weather service or FAA status, there is no answer and no charge.",
    ],
    path: "/api/agent/live", usage: "GET ?q=storm warnings puerto rico | satellite puerto rico | hurricane | SJU delays | power outage puerto rico | pharmacy near Hospital Auxilio Mutuo (a few words). $0.25 for weather and airport answers, $0.10 for power alone.", defaultPrice: "$0.25", alwaysPaid: true,
    // A power question reads one source; weather and airport answers read up to ten, so they cost more.
    priceFor: (u) => (isPowerOnly(u.searchParams.get("q") ?? "") ? "$0.10" : undefined),
    async respond(u, _origin, _store, at) {
      const answer = await answerLive(u.searchParams.get("q") ?? "", at ?? new Date());
      const self = PRODUCTS.find((p) => p.id === "live")!;
      return answer.status === 200 ? { ...answer, body: { ...(answer.body as object), whatYouGet: { includes: self.includes, limits: self.limits } } } : answer;
    },
  },
];

/** The products as the discovery files list them (/openapi.json, /.well-known/x402, /llms.txt), with today's prices. */
export function listing(): Listed[] {
  const books = PRODUCTS.find((p) => p.id === "books")!;
  const bookPrices = BOOKS.map((b) => Number((b.price ?? priceOf(books)).replace(/^\$/, "")));
  const money = (n: number) => `$${n.toFixed(2)}`;
  const article = articleIndex("en")[0];
  const checklist = checklistIndex("en")[0];
  const examples: Record<string, string | undefined> = {
    blog: article && `/api/agent/blog/${article.slug}`,
    checklists: checklist && `/api/agent/checklists/${checklist.slug}`,
  };
  const minPrices: Record<string, string | undefined> = { live: "$0.10", books: bookPrices.length ? money(Math.min(...bookPrices)) : undefined };
  return PRODUCTS.map((p) => {
    const price = p.id === "books" && bookPrices.length ? money(Math.max(...bookPrices)) : priceOf(p);
    const min = minPrices[p.id];
    const example = examples[p.id];
    return {
      id: p.id, title: p.title, description: shownDescription(p.description), path: p.path, usage: p.usage, price,
      ...(min && min !== price ? { minPrice: min } : {}),
      ...(example ? { example } : {}),
      ...(p.requiresPass && sitePassEnabled() ? { requiresPass: true } : {}),
    };
  });
}

/** The discovery files, built from today's prices; null for any other address, or while the store is switched off. */
export function discoveryFile(pathname: string, getOrigin: () => string): { type: string; body: string } | null {
  if (!["/.well-known/x402", "/.well-known/x402.json", "/openapi.json", "/llms.txt"].includes(pathname)) return null;
  if ("error" in x402Config()) return null;
  const items = listing();
  const origin = getOrigin();
  if (pathname === "/llms.txt") return { type: "text/plain; charset=utf-8", body: llmsTxt(origin, items, { freeSample: freeSamplesOn() }) };
  const doc = pathname === "/openapi.json" ? openApiDoc(origin, items, { freeSample: freeSamplesOn() }) : wellKnownX402(origin, items);
  return { type: "application/json", body: JSON.stringify(doc) };
}

export const priceOf = (p: Product, u?: URL) => (u && p.priceFor?.(u)) || process.env[`X402_PRICE_${p.id.toUpperCase()}`]?.trim() || p.defaultPrice;

let cached: { key: string; server: Promise<x402ResourceServer> } | null = null;
function serverFor(c: Config): Promise<x402ResourceServer> {
  const key = `${c.network}|${c.facilitator}|${process.env.PAYAI_API_KEY_ID ?? ""}`;
  if (cached?.key !== key) {
    // A PayAI key is optional: the first 1,000 payments per wallet settle without one. When it is set, it signs in.
    const id = process.env.PAYAI_API_KEY_ID?.trim();
    const secret = process.env.PAYAI_API_KEY_SECRET?.trim();
    const auth = id && secret && c.facilitator === PAYAI_FACILITATOR ? payaiAuthHeaders(id, secret) : undefined;
    const s = new x402ResourceServer(new HTTPFacilitatorClient({ url: c.facilitator, ...(auth ? { createAuthHeaders: async () => auth() } : {}) }))
      .register(c.network as `${string}:${string}`, new ExactEvmScheme());
    const ready = s.initialize().then(() => s);
    ready.catch(() => { if (cached?.key === key) cached = null; });
    cached = { key, server: ready };
  }
  return cached.server;
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
};

// Found by address, not by position, so adding a product can never send a request to the wrong one. A path with
// {name} in it matches any non-empty item at that place.
const productFor = (pathname: string): Product | undefined =>
  PRODUCTS.find((p) => {
    const at = p.path.indexOf("{");
    if (at < 0) return pathname === p.path;
    const head = p.path.slice(0, at);
    return pathname.startsWith(head) && pathname.length > head.length && !pathname.slice(head.length).includes("/");
  });

/** Whether a path belongs to the agent store, so the server can route it here. */
export const isAgentPath = (pathname: string): boolean => pathname === "/api/agent/catalog" || pathname === "/api/agent/blog" || pathname === "/api/agent/nfts" || pathname === "/api/agent/key" || pathname === "/api/agent/approval" || pathname === "/api/agent/checklists" || pathname === "/api/agent/books" || pathname === "/api/agent/sample" || productFor(pathname) !== undefined;

/** The free catalog: what is for sale, at what price, and how to ask. Nothing here costs anything. */
/**
 * The signing key. With SIGNING_SEED set (a secret of at least 32 characters in Railway's variables) the key comes from it, so
 * it survives a rebuilt database; otherwise one is made the first time it is needed and kept in the database. If the key ever
 * changes, the old public half is kept (never the private one) so older signatures still verify. Only public halves are shown.
 */
export function signingKeyFor(store: StoreLike): SigningKeyRecord {
  const seed = process.env.SIGNING_SEED?.trim();
  const current = store.data.signingKey;
  if (seed && seed.length >= 32) {
    const key = keyFromSeed(seed);
    if (current?.keyId !== key.keyId) {
      store.update((db) => {
        if (current) db.signingKeyHistory = [...(db.signingKeyHistory ?? []), { keyId: current.keyId, publicKeyPem: current.publicKeyPem, retiredAt: new Date().toISOString() }];
        db.signingKey = key;
      });
    }
    return key;
  }
  if (current) return current;
  const made = newSigningKey();
  store.update((db) => { db.signingKey = made; });
  return made;
}

/** Sends a product's answer with a signature over the exact bytes and the address that was asked. */
const RECEIPT_LIMIT = 20_000;

function sendSigned(res: ServerResponse, body: unknown, headers: Record<string, string>, store: StoreLike, now: Date, target: string, file?: { data: Buffer; filename: string }, productId?: string) {
  const text: string | Buffer = file ? file.data : JSON.stringify(body);
  // Only a fingerprint, what it was, the address asked and when: so the answer can later be checked for currency. Never a payer.
  if (productId && productId !== "currency") {
    const sha256 = createHash("sha256").update(text).digest("hex");
    const keyId = signingKeyFor(store).keyId;
    if (!store.data.receipts?.some((r) => r.sha256 === sha256)) {
      store.update((db) => { db.receipts = [...(db.receipts ?? []), { sha256, product: productId, target: target.slice(0, 300), at: now.toISOString(), keyId }].slice(-RECEIPT_LIMIT); });
    }
  }
  const expose = [headers["access-control-expose-headers"], "X-Safehubby-Signature"].filter(Boolean).join(", ");
  res.writeHead(200, {
    "content-type": file ? "application/pdf" : "application/json", "cache-control": "no-store", ...(file ? { "x-robots-tag": "noindex, nofollow", "content-disposition": `attachment; filename="${file.filename}"`, "content-length": String(file.data.length) } : {}),
    ...headers, "access-control-expose-headers": expose, "X-Safehubby-Signature": signResponse(signingKeyFor(store), text, target, now),
  });
  res.end(text);
}

function catalog(origin: string, store: StoreLike) {
  const config = x402Config();
  const on = !("error" in config);
  return {
    seller: "Safehubby", site: origin, payment: on ? { protocol: "x402", version: 2, network: config.network, testMoneyOnly: !config.live, currency: "USDC" } : null,
    available: on, note: on ? undefined : config.error,
    checkedNow: freshCount(store.data.localChecks ?? [], new Date()),
    products: PRODUCTS.map((p) => ({ id: p.id, title: p.title, description: shownDescription(p.description), ...(p.includes ? { includes: p.includes } : {}), ...(p.limits ? { limits: p.limits } : {}), endpoint: `${origin}${p.path}`, usage: p.usage, price: priceOf(p), info: `${origin}${p.path.replace("{slug}", "example")}?info` })),
    freeSample: freeSamplesOn() ? {
      endpoint: `${origin}/api/agent/sample?q=`, perDay: 1, covers: "live answers",
      how: "Ask your own question once a day free, signed like a paid answer, to see what you would be paying for. A question with no answer does not use it up. After that, the same answers are paid at the live answers address.",
    } : undefined,
    sitePass: sitePassEnabled() ? {
      price: sitePassInfo().price, perVisit: true, minutesPerVisit: sitePassInfo().minutes,
      includes: "During the visit: the website's pages, plus plans and prices facts, blog articles as clean text, the weekly digest, the brief to forward to a person, the airport directory, the checklists (English and Spanish), the request check and the alerts feed, all with no further payment, and every answer is signed. The books (PDF) are sold separately: the pass is the access to buy them, and each book costs extra. Checked-today answers (what a person saw on the ground) and live answers (official storm and airport status, read when you ask) are charged for each answer, with or without a pass. Not included: errands, visits and other work that needs a person.",
      appliesTo: "The website's pages, to visitors that identify themselves as AI crawlers or agents (for example GPTBot, ClaudeBot, PerplexityBot). People and search engines read the site free.",
      excludes: "The blog, this store, the API, robots.txt, the sitemap and files such as scripts and images are never charged.",
      how: "Request a page, pay the amount the 402 response asks for, and keep the X-Safehubby-Pass header from the answer. Send it back on every request during the visit. After the visit ends you pay again.",
    } : undefined,
    // The owner's NFT collection on Rarible. Sold there, never through this server: it holds no wallet and moves no money.
    nfts: {
      url: NFT_COLLECTION.soldAt, gallery: `${origin}/api/agent/nfts`,
      note: "The owner's NFT collection, sold on Rarible, not through this site. The pieces are made with AI and edited by the artist; check the page for what is listed and what each costs. This is art, not an investment: nothing here suggests a piece will keep or gain value, and Safehubby gives no financial advice. Email "+CONTACT_EMAIL+" with questions.",
    },
    signing: {
      alg: "ed25519", keyId: signingKeyFor(store).keyId, key: `${origin}/api/agent/key`,
      afterExpiry: "A signature is still valid after your pass ends. Keep the answer and its X-Safehubby-Signature header, and check them any time with the public key, which stays free. Old keys stay listed at the key address. To ask whether an answer you hold is still current, use the currency check.",
      how: "Every answer from the paid items has an X-Safehubby-Signature header. Check it with the public key at the key address: the signed message is the text 'safehubby-v1', the path and query you asked, the created time and the SHA-256 of the exact response body, each on its own line. If it checks, the answer is unchanged and was made at the created time.",
    },
    notForSale: `Errands, visits to check a place, appointments and other work that needs a person are not sold here. Email ${CONTACT_EMAIL} or message Safehubby on WhatsApp at ${WHATSAPP_DISPLAY} for those.`,
    contact: {
      email: CONTACT_EMAIL, whatsapp: WHATSAPP_DISPLAY,
      note: "AI agents and the people they work for can email this address: a question, a request for a quote on work that needs a person, a partnership idea, or a problem with a payment. It goes to a person. Emailing is free.",
    },
  };
}

/**
 * Asks for payment, or takes it. Sends the 402 itself and returns null when there is no valid payment yet. When there
 * is one, it is verified, then `beforeSettle` may refuse (nothing is charged), then it is settled; only then is the
 * result returned and the caller sends what was bought. Shared by every paid thing, so each has the same checks.
 */
export async function takePayment(
  req: IncomingMessage, res: ServerResponse, opts: {
    path: string; origin: string; price: string; description: string; beforeSettle?: () => { status: number; body: unknown } | null;
    /** How to call this endpoint, for the x402 directories (see x402-discovery). */
    discovery?: Record<string, unknown>;
    /** Called when the price is shown to someone who has not paid yet, and when a payment is settled. For the owner's numbers only. */
    onAsk?: () => void; onPaid?: () => void;
  },
): Promise<{ amount: string; payer?: string; transaction?: string; network: string; headers: Record<string, string> } | null> {
  const config = x402Config();
  if ("error" in config) { json(res, 503, { error: config.error }); return null; }
  const expose = { "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE" };
  let server: x402ResourceServer;
  try { server = await serverFor(config); } catch {
    json(res, 503, { error: "The payment service could not be reached. Try again later." });
    return null;
  }
  const requirements = await server.buildPaymentRequirementsFromOptions(
    [{ scheme: "exact", price: opts.price, network: config.network as `${string}:${string}`, payTo: config.payTo }], {},
  );
  // Agents can send email but not WhatsApp, so every request for payment says where to write.
  const resource = { url: `${opts.origin}${opts.path}`, description: `${opts.description} Questions: ${CONTACT_EMAIL}.`, mimeType: "application/json", ...serviceInfo(opts.origin) };
  const ask = async (error?: string) => {
    const required = await server.createPaymentRequiredResponse(requirements, resource, error, opts.discovery);
    json(res, 402, required, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required), ...expose });
    return null;
  };

  const header = req.headers["payment-signature"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature) { opts.onAsk?.(); return ask(); }
  let payload;
  try { payload = decodePaymentSignatureHeader(signature); } catch { return ask("The payment header could not be read."); }
  const match = server.findMatchingRequirements(requirements, payload);
  if (!match) return ask("That payment does not match the price, network or address asked for.");
  const verified = await server.verifyPayment(payload, match);
  if (!verified.isValid) return ask(`Payment not valid: ${verified.invalidReason ?? "unknown reason"}`);

  // A request that cannot be answered (an unknown article, a missing question) is refused before any money moves.
  const refusal = opts.beforeSettle?.();
  if (refusal) { json(res, refusal.status, refusal.body); return null; }
  // Settled before anything is given, so nothing is given away on a payment that fails.
  const settled = await server.settlePayment(payload, match);
  if (!settled.success) return ask(`Payment could not be settled: ${settled.errorReason ?? "unknown reason"}`);
  opts.onPaid?.();
  return { amount: match.amount, payer: settled.payer, transaction: settled.transaction, network: config.network, headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled), ...expose } };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The books are for AI agents. A person opening one in a browser is told so and given somewhere to go; nothing is shown or charged. */
export function refuseBrowser(req: IncomingMessage, res: ServerResponse): boolean {
  const h = req.headers;
  if (!looksLikePersonInBrowser({ "sec-fetch-mode": first(h["sec-fetch-mode"]), "sec-fetch-dest": first(h["sec-fetch-dest"]), accept: first(h.accept), "accept-language": first(h["accept-language"]) })) return false;
  res.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
  res.end(`These books are for AI agents, so they are not shown in a browser.\n\nIf you are a person, read the blog at https://safehubby.com/blog or write to ${CONTACT_EMAIL}.\n`);
  return true;
}

/** A request a person could go and fulfil is worth telling the owner about right away: a Checked today question, or pharmacies. */
function alertIfPersonCould(store: StoreLike, now: Date, productId: string, answer: ProductAnswer) {
  const words = (answer.words ?? "").trim();
  const pharmacy = productId === "live" && (answer.summary.startsWith("live/pharmacy") || /pharmac|farmacia|walgreens|cvs/i.test(words));
  if (!words || (productId !== "checked" && !pharmacy)) return;
  alertOwner(store, now, `request:${productId}:${words.toLowerCase()}`, { kind: "request", product: productId === "checked" ? "Checked today" : "pharmacies (live answers)", words, answered: answer.status === 200 });
}

// One ledger per store, so each running server (and each test server) keeps its own day.
const samplesByStore = new WeakMap<StoreLike, FreeSamples>();
const samplesFor = (store: StoreLike) => {
  let s = samplesByStore.get(store);
  if (!s) { s = new FreeSamples(Number(process.env.FREE_SAMPLES_PER_DAY) || 100); samplesByStore.set(store, s); }
  return s;
};

/**
 * One free live answer a day for each asker, at its own address so the paid one keeps asking for payment (directories
 * probe it). Signed like a paid answer. A question with no answer does not use up the try.
 */
async function freeSample(req: IncomingMessage, res: ServerResponse, url: URL, store: StoreLike, now: () => Date, origin: string, asker: string): Promise<void> {
  const live = PRODUCTS.find((p) => p.id === "live")!;
  const q = (url.searchParams.get("q") ?? "").trim();
  const paidUrl = new URL(`/api/agent/live?q=${encodeURIComponent(q)}`, origin);
  const price = priceOf(live, paidUrl);
  if (!freeSamplesOn()) return json(res, 410, { error: `The free daily answer has ended: every live answer is now paid. The same answer is ${price} at the paid address, signed, and nothing is charged when there is no answer.`, paid: paidUrl.toString(), price });
  if (!q) return json(res, 400, { error: "Ask with ?q= and a few words, for example ?q=SJU delays or ?q=storm warnings puerto rico. One free answer a day; after that each answer is paid at /api/agent/live." });
  const samples = samplesFor(store);
  const verdict = samples.take(asker, now());
  if (!verdict.ok) {
    const why = verdict.reason === "used" ? "Your free answer for today is used." : "Today's free answers are all given out.";
    return json(res, 429, { error: `${why} The same answer is ${price} at the paid address.`, paid: paidUrl.toString(), price, nextFreeAt: verdict.nextFreeAt }, { "retry-after": String(Math.max(60, Math.round((Date.parse(verdict.nextFreeAt) - now().getTime()) / 1000))) });
  }
  const answer = await live.respond(paidUrl, origin, store, now());
  alertIfPersonCould(store, now(), "live", answer);
  if (answer.status !== 200) {
    samples.release(asker, now());
    if (answer.status === 404 && answer.words) noteSignal(store, now(), { kind: "unanswered", text: answer.words });
    return json(res, answer.status, answer.body);
  }
  noteSignal(store, now(), { kind: "ask", product: "sample" });
  if (answer.words) noteSignal(store, now(), { kind: "query", product: "sample", text: answer.words });
  const body = {
    ...(answer.body as object),
    freeSample: {
      free: true, paidPrice: price, paid: paidUrl.toString(),
      nextFreeAt: nextFreeAt(now()),
      note: "This answer was free: one a day to try. The same question and any other cost the price above at the paid address, signed the same way, and nothing is charged when there is no answer.",
    },
  };
  return sendSigned(res, body, {}, store, now(), req.url ?? url.pathname + url.search);
}

/** GET handler for everything under /api/agent: the free catalog and blog list, and the paid products. */
export async function handleAgentStore(req: IncomingMessage, res: ServerResponse, url: URL, store: StoreLike, now: () => Date, origin: string, holdsPass = false, asker = "unknown"): Promise<void> {
  if (url.pathname === "/api/agent/catalog") return json(res, 200, catalog(origin, store));
  if (url.pathname === "/api/agent/sample") {
    if ("error" in x402Config()) return json(res, 503, { error: (x402Config() as { error: string }).error });
    return freeSample(req, res, url, store, now, origin, asker);
  }
  // The public key, free, so an agent can check an answer without trusting anything else.
  if (url.pathname === "/api/agent/key") { const k = signingKeyFor(store); return json(res, 200, {
      alg: "ed25519", keyId: k.keyId, publicKeyPem: k.publicKeyPem, howToCheck: catalog(origin, store).signing.how,
      // Earlier keys stay public so an old answer still verifies after the key changes.
      retired: (store.data.signingKeyHistory ?? []).map((r) => ({ keyId: r.keyId, publicKeyPem: r.publicKeyPem, retiredAt: r.retiredAt })),
    }); }
  // For the person an agent works for: free, and built from the live prices.
  if (url.pathname === "/api/agent/approval") {
    const info = sitePassInfo();
    return json(res, 200, buildApprovalPack({ origin, lang: langOf(url), ...(sitePassEnabled() ? { pass: { price: info.price, length: passLength(info.minutes) } } : {}), items: PRODUCTS.filter((p) => !p.requiresPass || !sitePassEnabled()).map((p) => ({ id: p.id, title: p.id === "live" ? `${p.title} (power alone $0.10)` : p.title, price: priceOf(p) })) }));
  }
  if ((url.pathname === "/api/agent/books" || url.pathname.startsWith("/api/agent/books/")) && refuseBrowser(req, res)) return;
  if (url.pathname === "/api/agent/books") {
    return json(res, 200, {
      price: priceOf(PRODUCTS.find((p) => p.id === "books")!), requires: "A site pass first (the pass is the access to buy), then this price for each book. Ask for a book without a pass and you are asked to buy the pass.",
      note: "PDF files. Each answer is signed over the exact file; the sha256 here lets you check you got the whole book.",
      books: BOOKS.map((b) => ({ slug: b.slug, price: b.price ?? priceOf(PRODUCTS.find((p) => p.id === "books")!), title: b.title, subtitle: b.subtitle, description: b.description, language: b.language, pages: b.pages, bytes: b.bytes, sha256: b.sha256, endpoint: `${origin}/api/agent/books/${b.slug}` })),
    });
  }
  if (url.pathname === "/api/agent/checklists") {
    const lang = langOf(url);
    return json(res, 200, { lang, price: "see /api/agent/catalog (free with a site pass)", checklists: checklistIndex(lang).map((c) => ({ ...c, endpoint: `${origin}/api/agent/checklists/${c.slug}?lang=${lang}` })) });
  }
  // The NFT gallery is free to look at. The pieces are sold on Rarible, never here.
  if (url.pathname === "/api/agent/nfts") {
    return json(res, 200, {
      collection: NFT_COLLECTION.name, soldAt: NFT_COLLECTION.soldAt, note: NFT_COLLECTION.note,
      pieces: NFT_PIECES.map((p) => ({ title: p.title, description: p.description, attributes: p.attributes, image: `${origin}/nft/${p.file}` })),
    });
  }
  if (url.pathname === "/api/agent/blog") return json(res, 200, { lang: langOf(url), price: "per article, see /api/agent/catalog", articles: articleIndex(langOf(url)).map((a) => ({ ...a, endpoint: `${origin}/api/agent/blog/${a.slug}?lang=${langOf(url)}` })) });

  const product = productFor(url.pathname)!;
  const config = x402Config();
  if ("error" in config) return json(res, 503, { error: config.error });
  const price = priceOf(product, url);
  if (url.searchParams.has("info")) return json(res, 200, { id: product.id, description: shownDescription(product.description), ...(product.includes ? { includes: product.includes } : {}), ...(product.limits ? { limits: product.limits } : {}), usage: product.usage, price, network: config.network, testMoneyOnly: !config.live });

  const answer = await product.respond(url, origin, store, now());
  // A visitor with a valid site pass already paid for the visit: the store is part of it.
  if (holdsPass && answer.status === 200 && !product.requiresPass && !product.alwaysPaid) return sendSigned(res, answer.body, {}, store, now(), req.url ?? url.pathname, answer.file, product.id);
  const paid = await takePayment(req, res, {
    path: url.pathname, origin, price, description: shownDescription(product.description), discovery: discoveryFor(product, url.pathname),
    beforeSettle: () => (answer.status !== 200 ? { status: answer.status, body: answer.body } : null),
    // A request that can never be answered (no question, no such article) says nothing about demand, so it is not counted.
    onAsk: () => {
      alertIfPersonCould(store, now(), product.id, answer);
      // A question nobody could answer is still a want: keep its words, so the owner sees what agents ask for.
      if (answer.status === 404 && answer.words) { noteSignal(store, now(), { kind: "unanswered", text: answer.words }); return; }
      if (answer.status !== 200) return;
      noteSignal(store, now(), { kind: "ask", product: product.id });
      if (!answer.words) return;
      noteSignal(store, now(), answer.results === 0 ? { kind: "unanswered", text: answer.words } : { kind: "query", product: product.id, text: answer.words });
    },
    onPaid: () => {
      noteSignal(store, now(), { kind: "paid", product: product.id });
      alertOwner(store, now(), `sale:${newId("alert")}`, { kind: "sale", product: product.title, amount: price, words: (answer.words ?? "").slice(0, 100) });
    },
  });
  if (!paid) return;
  const sale: AgentSale = {
    id: newId("sal"), at: now().toISOString(), product: product.id, network: paid.network, amount: paid.amount,
    payer: paid.payer, transaction: paid.transaction, query: answer.summary.slice(0, 300), results: answer.results,
  };
  store.update((db) => { db.agentSales = [...(db.agentSales ?? []), sale].slice(-5000); });
  return sendSigned(res, answer.body, paid.headers, store, now(), req.url ?? url.pathname, answer.file, product.id);
}
