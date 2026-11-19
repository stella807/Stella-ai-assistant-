import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { CONTACT_EMAIL, WHATSAPP_DISPLAY, buildKnowledge, lookupAirports, retrieveKnowledge, type SiteLang } from "@safehubby/core";
import { articleIndex, articleText, findArticle } from "./blog.ts";
import { newId, type StoreLike } from "./store.ts";
import { sitePassInfo } from "./site-pass-info.ts";
import { noteSignal } from "./signals.ts";
import { NFT_COLLECTION, NFT_PIECES } from "./nfts.ts";
import { newSigningKey, signResponse, type SigningKeyRecord } from "./attestation.ts";
import { checklistIndex, checklistText, findChecklist } from "./checklists.ts";
import { BOOKS, readBook } from "./books.ts";
import { looksLikePersonInBrowser } from "./visitor-kind.ts";
import { payaiAuthHeaders } from "./payai-auth.ts";

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
  /** `words` is what was searched for, in plain words, for the owner's numbers; empty when there is nothing to keep. */
  respond(url: URL, origin: string): { status: 200 | 400 | 404; body: unknown; results: number; summary: string; words?: string; file?: { data: Buffer; filename: string } };
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
    respond(u) {
      const slug = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      const data = readBook(slug);
      if (!data) return { status: 404, body: { error: "No book has that slug. See /api/agent/books for the list." }, results: 0, summary: slug.slice(0, 80) };
      return { status: 200, body: null, results: 1, summary: `book/${slug}`, words: `book/${slug}`, file: { data, filename: `${slug}.pdf` } };
    },
  },
];

export const priceOf = (p: Product) => process.env[`X402_PRICE_${p.id.toUpperCase()}`]?.trim() || p.defaultPrice;

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

const productFor = (pathname: string): Product | undefined =>
  pathname === "/api/agent/facts" ? PRODUCTS[0]
    : pathname.startsWith("/api/agent/blog/") && pathname.length > "/api/agent/blog/".length ? PRODUCTS[1]
      : pathname === "/api/agent/digest" ? PRODUCTS[2]
        : pathname === "/api/agent/brief" ? PRODUCTS[3]
          : pathname === "/api/agent/airports" ? PRODUCTS[4]
            : pathname.startsWith("/api/agent/checklists/") && pathname.length > "/api/agent/checklists/".length ? PRODUCTS[5]
              : pathname.startsWith("/api/agent/books/") && pathname.length > "/api/agent/books/".length ? PRODUCTS[6]
                : undefined;

/** Whether a path belongs to the agent store, so the server can route it here. */
export const isAgentPath = (pathname: string): boolean => pathname === "/api/agent/catalog" || pathname === "/api/agent/blog" || pathname === "/api/agent/nfts" || pathname === "/api/agent/key" || pathname === "/api/agent/checklists" || pathname === "/api/agent/books" || productFor(pathname) !== undefined;

/** The free catalog: what is for sale, at what price, and how to ask. Nothing here costs anything. */
/** The signing key, made the first time it is needed. Only the public half is ever shown. */
export function signingKeyFor(store: StoreLike): SigningKeyRecord {
  let key = store.data.signingKey;
  if (!key) { key = newSigningKey(); store.update((db) => { db.signingKey = key; }); }
  return key;
}

/** Sends a product's answer with a signature over the exact bytes and the address that was asked. */
function sendSigned(res: ServerResponse, body: unknown, headers: Record<string, string>, store: StoreLike, now: Date, target: string, file?: { data: Buffer; filename: string }) {
  const text: string | Buffer = file ? file.data : JSON.stringify(body);
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
    products: PRODUCTS.map((p) => ({ id: p.id, title: p.title, description: p.description, endpoint: `${origin}${p.path}`, usage: p.usage, price: priceOf(p), info: `${origin}${p.path.replace("{slug}", "example")}?info` })),
    sitePass: {
      price: sitePassInfo().price, perVisit: true, minutesPerVisit: sitePassInfo().minutes,
      includes: "During the visit: the website's pages, plus plans and prices facts, blog articles as clean text, the weekly digest, the brief to forward to a person, the airport directory and the checklists (English and Spanish), all with no further payment, and every answer is signed. The books (PDF) are sold separately: the pass is the access to buy them, and each book costs extra. Not included: anything that needs a person.",
      appliesTo: "The website's pages, to visitors that identify themselves as AI crawlers or agents (for example GPTBot, ClaudeBot, PerplexityBot). People and search engines read the site free.",
      excludes: "The blog, this store, the API, robots.txt, the sitemap and files such as scripts and images are never charged.",
      how: "Request a page, pay the amount the 402 response asks for, and keep the X-Safehubby-Pass header from the answer. Send it back on every request during the visit. After the visit ends you pay again.",
    },
    // The owner's NFT collection on Rarible. Sold there, never through this server: it holds no wallet and moves no money.
    nfts: {
      url: NFT_COLLECTION.soldAt, gallery: `${origin}/api/agent/nfts`,
      note: "The owner's NFT collection, sold on Rarible, not through this site. The pieces are made with AI and edited by the artist; check the page for what is listed and what each costs. This is art, not an investment: nothing here suggests a piece will keep or gain value, and Safehubby gives no financial advice. Email "+CONTACT_EMAIL+" with questions.",
    },
    signing: {
      alg: "ed25519", keyId: signingKeyFor(store).keyId, key: `${origin}/api/agent/key`,
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
  const resource = { url: `${opts.origin}${opts.path}`, description: `${opts.description} Questions: ${CONTACT_EMAIL}.`, mimeType: "application/json" };
  const ask = async (error?: string) => {
    const required = await server.createPaymentRequiredResponse(requirements, resource, error);
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

/** GET handler for everything under /api/agent: the free catalog and blog list, and the paid products. */
export async function handleAgentStore(req: IncomingMessage, res: ServerResponse, url: URL, store: StoreLike, now: () => Date, origin: string, holdsPass = false): Promise<void> {
  if (url.pathname === "/api/agent/catalog") return json(res, 200, catalog(origin, store));
  // The public key, free, so an agent can check an answer without trusting anything else.
  if (url.pathname === "/api/agent/key") { const k = signingKeyFor(store); return json(res, 200, { alg: "ed25519", keyId: k.keyId, publicKeyPem: k.publicKeyPem, howToCheck: catalog(origin, store).signing.how }); }
  if ((url.pathname === "/api/agent/books" || url.pathname.startsWith("/api/agent/books/")) && refuseBrowser(req, res)) return;
  if (url.pathname === "/api/agent/books") {
    return json(res, 200, {
      price: priceOf(PRODUCTS.find((p) => p.id === "books")!), requires: "A site pass first (the pass is the access to buy), then this price for each book. Ask for a book without a pass and you are asked to buy the pass.",
      note: "PDF files. Each answer is signed over the exact file; the sha256 here lets you check you got the whole book.",
      books: BOOKS.map((b) => ({ slug: b.slug, title: b.title, subtitle: b.subtitle, description: b.description, language: b.language, pages: b.pages, bytes: b.bytes, sha256: b.sha256, endpoint: `${origin}/api/agent/books/${b.slug}` })),
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
  const price = priceOf(product);
  if (url.searchParams.has("info")) return json(res, 200, { id: product.id, description: product.description, usage: product.usage, price, network: config.network, testMoneyOnly: !config.live });

  const answer = product.respond(url, origin);
  // A visitor with a valid site pass already paid for the visit: the store is part of it.
  if (holdsPass && answer.status === 200 && !product.requiresPass) return sendSigned(res, answer.body, {}, store, now(), req.url ?? url.pathname, answer.file);
  const paid = await takePayment(req, res, {
    path: url.pathname, origin, price, description: product.description,
    beforeSettle: () => (answer.status !== 200 ? { status: answer.status, body: answer.body } : null),
    // A request that can never be answered (no question, no such article) says nothing about demand, so it is not counted.
    onAsk: () => {
      if (answer.status !== 200) return;
      noteSignal(store, now(), { kind: "ask", product: product.id });
      if (!answer.words) return;
      noteSignal(store, now(), answer.results === 0 ? { kind: "unanswered", text: answer.words } : { kind: "query", product: product.id, text: answer.words });
    },
    onPaid: () => noteSignal(store, now(), { kind: "paid", product: product.id }),
  });
  if (!paid) return;
  const sale: AgentSale = {
    id: newId("sal"), at: now().toISOString(), product: product.id, network: paid.network, amount: paid.amount,
    payer: paid.payer, transaction: paid.transaction, query: answer.summary.slice(0, 300), results: answer.results,
  };
  store.update((db) => { db.agentSales = [...(db.agentSales ?? []), sale].slice(-5000); });
  return sendSigned(res, answer.body, paid.headers, store, now(), req.url ?? url.pathname, answer.file);
}
