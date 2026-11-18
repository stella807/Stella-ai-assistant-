import type { IncomingMessage, ServerResponse } from "node:http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { lookupVendorsForAgents, retrieveKnowledge, type SiteLang } from "@safehubby/core";
import { articleIndex, articleText, findArticle } from "./blog.ts";
import { newId, type StoreLike } from "./store.ts";
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
  respond(url: URL): { status: 200 | 400 | 404; body: unknown; results: number; summary: string };
}

const langOf = (u: URL): SiteLang => (u.searchParams.get("lang") === "es" ? "es" : "en");

export const PRODUCTS: Product[] = [
  {
    id: "vendors", title: "Vendor lookup",
    description: "Safehubby's research on event vendors, hotel programs and airport VIP / meet-and-greet services in Puerto Rico, the US and worldwide, with where each was found. A phone or email only where the business publishes it.",
    path: "/api/agent/vendors", usage: "GET ?q=&category=&place=&limit= (limit up to 25)", defaultPrice: "$0.05",
    respond(u) {
      const query = { q: u.searchParams.get("q") ?? "", category: u.searchParams.get("category") ?? "", place: u.searchParams.get("place") ?? "", limit: Number(u.searchParams.get("limit")) || 10 };
      const found = lookupVendorsForAgents(query);
      return { status: 200, body: found, results: found.results.length, summary: JSON.stringify(query) };
    },
  },
  {
    id: "facts", title: "Safehubby plans and prices",
    description: "The facts that answer a question about Safehubby's plans, prices, the Wingman Club, secure transport and safety rules, as structured text. The prices are read from the same list the app charges from.",
    path: "/api/agent/facts", usage: "GET ?q=your question", defaultPrice: "$0.01",
    respond(u) {
      const q = (u.searchParams.get("q") ?? "").slice(0, 300);
      if (q.trim().length < 2) return { status: 400, body: { error: "Add ?q= with your question." }, results: 0, summary: "" };
      const facts = retrieveKnowledge(q, 3).map((k) => ({ title: k.title, text: k.text }));
      return { status: 200, body: { facts }, results: facts.length, summary: q.slice(0, 120) };
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
      return { status: 200, body: { slug, lang: langOf(u), publishedOn: a.publishedOn, updatedOn: a.updatedOn, text: articleText(a, langOf(u)) }, results: 1, summary: `blog/${slug}` };
    },
  },
];

const priceOf = (p: Product) => process.env[`X402_PRICE_${p.id.toUpperCase()}`]?.trim() || (p.id === "vendors" ? process.env.X402_PRICE?.trim() : "") || p.defaultPrice;

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
  pathname === "/api/agent/vendors" ? PRODUCTS[0]
    : pathname === "/api/agent/facts" ? PRODUCTS[1]
      : pathname.startsWith("/api/agent/blog/") && pathname.length > "/api/agent/blog/".length ? PRODUCTS[2]
        : undefined;

/** Whether a path belongs to the agent store, so the server can route it here. */
export const isAgentPath = (pathname: string): boolean => pathname === "/api/agent/catalog" || pathname === "/api/agent/blog" || productFor(pathname) !== undefined;

/** The free catalog: what is for sale, at what price, and how to ask. Nothing here costs anything. */
function catalog(origin: string) {
  const config = x402Config();
  const on = !("error" in config);
  return {
    seller: "Safehubby", site: origin, payment: on ? { protocol: "x402", version: 2, network: config.network, testMoneyOnly: !config.live, currency: "USDC" } : null,
    available: on, note: on ? undefined : config.error,
    products: PRODUCTS.map((p) => ({ id: p.id, title: p.title, description: p.description, endpoint: `${origin}${p.path}`, usage: p.usage, price: priceOf(p), info: `${origin}${p.path.replace("{slug}", "example")}?info` })),
    notForSale: "Errands, visits to check a place, appointments and other work that needs a person are not sold here. Message Safehubby on WhatsApp at +1 (939) 245-0171 for those.",
  };
}

/** GET handler for everything under /api/agent: the free catalog and blog list, and the paid products. */
export async function handleAgentStore(req: IncomingMessage, res: ServerResponse, url: URL, store: StoreLike, now: () => Date, origin: string): Promise<void> {
  if (url.pathname === "/api/agent/catalog") return json(res, 200, catalog(origin));
  if (url.pathname === "/api/agent/blog") return json(res, 200, { lang: langOf(url), price: "per article, see /api/agent/catalog", articles: articleIndex(langOf(url)).map((a) => ({ ...a, endpoint: `${origin}/api/agent/blog/${a.slug}?lang=${langOf(url)}` })) });

  const product = productFor(url.pathname)!;
  const config = x402Config();
  if ("error" in config) return json(res, 503, { error: config.error });
  const price = priceOf(product);
  if (url.searchParams.has("info")) return json(res, 200, { id: product.id, description: product.description, usage: product.usage, price, network: config.network, testMoneyOnly: !config.live });

  const expose = { "access-control-expose-headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE" };
  let server: x402ResourceServer;
  try { server = await serverFor(config); } catch {
    return json(res, 503, { error: "The payment service could not be reached. Try again later." });
  }
  const requirements = await server.buildPaymentRequirementsFromOptions(
    [{ scheme: "exact", price, network: config.network as `${string}:${string}`, payTo: config.payTo }], {},
  );
  const resource = { url: `${origin}${url.pathname}`, description: product.description, mimeType: "application/json" };
  const ask = async (error?: string) => {
    const required = await server.createPaymentRequiredResponse(requirements, resource, error);
    return json(res, 402, required, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required), ...expose });
  };

  const header = req.headers["payment-signature"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature) return ask();
  let payload;
  try { payload = decodePaymentSignatureHeader(signature); } catch { return ask("The payment header could not be read."); }
  const match = server.findMatchingRequirements(requirements, payload);
  if (!match) return ask("That payment does not match the price, network or address asked for.");
  const verified = await server.verifyPayment(payload, match);
  if (!verified.isValid) return ask(`Payment not valid: ${verified.invalidReason ?? "unknown reason"}`);

  // A request that cannot be answered (an unknown article, a missing question) is refused before any money moves.
  const answer = product.respond(url);
  if (answer.status !== 200) return json(res, answer.status, answer.body);
  // Settled before the answer goes out, so nothing is given away on a payment that fails.
  const settled = await server.settlePayment(payload, match);
  if (!settled.success) return ask(`Payment could not be settled: ${settled.errorReason ?? "unknown reason"}`);
  const sale: AgentSale = {
    id: newId("sal"), at: now().toISOString(), product: product.id, network: config.network, amount: match.amount,
    payer: settled.payer, transaction: settled.transaction, query: answer.summary.slice(0, 300), results: answer.results,
  };
  store.update((db) => { db.agentSales = [...(db.agentSales ?? []), sale].slice(-5000); });
  return json(res, 200, answer.body, { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settled), ...expose });
}
