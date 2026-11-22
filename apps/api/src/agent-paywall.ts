import { timingSafeEqual } from "node:crypto";

/**
 * AI agents pay to read the site's pages, the blog's above all; people do not.
 *
 * Only pages are charged: the files a page loads (scripts, pictures), robots.txt,
 * the sitemap and the app's API stay free, so the site and the apps keep working
 * and an agent can still find what there is to buy.
 *
 * It uses x402 (https://x402.org), version 2. An agent asking for an article
 * gets `402 Payment Required` with a `PAYMENT-REQUIRED` header: the price, in
 * USDC on Solana, and the wallet to pay. The agent signs a USDC transfer and
 * asks again with it in a `PAYMENT-SIGNATURE` header. A facilitator (Coinbase's,
 * see adapters/x402-facilitator.ts) checks the transfer and puts it on chain,
 * and only then is the page sent. The money goes straight to the owner's
 * wallet; this server never holds it.
 *
 * Who pays is decided by what the visitor says it is (its User-Agent), so this
 * stops honest agents, not ones that pretend to be a browser. That is the same
 * line robots.txt draws, and it keeps every person on the site free.
 *
 * - The owner's key (`?access=` or the `x-safehubby-access` header) reads free,
 *   so the owner, or Claude working for them, can check a post as it is live.
 * - Search engines and link previews read free: charging them would take the
 *   blog out of search and break shared links.
 * - Claude, all of Anthropic's agents and crawlers, reads free: the owner's
 *   choice, so Claude can read and check the blog it helps write. Anyone can
 *   claim to be Claude, so this is a door left open on purpose, not a check.
 * - Named AI crawlers and agents, and plain HTTP tools (curl, python-requests,
 *   headless browsers and the like), are asked to pay.
 * - Everyone else is taken to be a person and reads free.
 */

export type Network = "solana" | "solana-devnet";

/** x402 v2 names networks by CAIP-2 id; Solana's is its genesis hash. */
export const SOLANA_NETWORKS: Record<Network, { caip2: string; usdc: string }> = {
  solana: { caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  "solana-devnet": { caip2: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" },
};

/** USDC has 6 decimals: these are millionths of a dollar. */
/** An article, its preview, and any other page of the site (home, services, careers). */
export const PRICES = { article: 50_000, preview: 1_000, page: 10_000 } as const;
export type Priced = keyof typeof PRICES;

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { feePayer: string };
}

export interface PaymentPayload {
  x402Version: number;
  accepted?: Partial<PaymentRequirements> & { extra?: Record<string, unknown> };
  payload?: unknown;
  [key: string]: unknown;
}

export interface SettleResult { success: boolean; errorReason?: string; transaction?: string; network?: string; payer?: string }

/** The facilitator: the service that checks an agent's signed transfer and puts it on chain. */
export interface Facilitator {
  /** The facilitator's own address, which pays Solana's network fee and so has to be named in the price. */
  feePayer(network: string): Promise<string>;
  verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<{ isValid: boolean; invalidReason?: string; payer?: string }>;
  settle(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResult>;
}

export interface PaywallConfig {
  network: Network;
  /** The owner's Solana wallet. USDC is sent to its token account. */
  payTo: string;
  facilitator: Facilitator;
  /** A key that reads free. Shorter than 24 characters, it is ignored: a guessable key would be a free pass for anyone. */
  accessKey?: string | null;
}

export type Visitor = "owner" | "paying" | "claude" | "agent" | "search" | "person";

/** Anthropic's agents and crawlers, which read free (see above). */
const CLAUDE = /claudebot|claude-user|claude-searchbot|claude-web|anthropic-ai/i;
/** Agents and crawlers that read pages for an AI product. Checked before SEARCH, because "Applebot-Extended" contains "Applebot". */
const AI_AGENTS = /gptbot|chatgpt-user|oai-searchbot|perplexitybot|perplexity-user|ccbot|bytespider|amazonbot|applebot-extended|meta-externalagent|meta-externalfetcher|facebookbot|cohere-ai|cohere-training|diffbot|youbot|mistralai-user|duckassistbot|google-cloudvertexbot|googleother|petalbot|ai2bot|imagesiftbot|timpibot|omgili|firecrawl|crawl4ai|scrapy|headlesschrome|phantomjs/i;
/** Search engines and the bots that draw a link's preview when someone shares it. */
const SEARCH = /googlebot|google-inspectiontool|storebot-google|adsbot-google|bingbot|bingpreview|duckduckbot|applebot|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|pinterestbot/i;
/** Plain HTTP tools: a person reading the blog uses a browser, so these are programs. */
const TOOLS = /^(curl|wget|python-requests|python-urllib|python-httpx|aiohttp|httpx|go-http-client|axios|node-fetch|node|undici|okhttp|java|libwww-perl|ruby|php|guzzlehttp|deno|bun)\b/i;

const MAX_PAYMENT_HEADER = 16_384;

const header = (headers: Record<string, string | string[] | undefined>, name: string): string | undefined => {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
};

function sameKey(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected || expected.length < 24) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function classifyVisitor(headers: Record<string, string | string[] | undefined>, url: URL, accessKey?: string | null): Visitor {
  if (sameKey(url.searchParams.get("access") ?? header(headers, "x-safehubby-access"), accessKey)) return "owner";
  if (header(headers, "payment-signature") || header(headers, "x-payment")) return "paying";
  const ua = (header(headers, "user-agent") ?? "").trim();
  if (!ua) return "agent";
  if (CLAUDE.test(ua)) return "claude";
  if (AI_AGENTS.test(ua)) return "agent";
  if (SEARCH.test(ua)) return "search";
  if (TOOLS.test(ua)) return "agent";
  return "person";
}

export const encodeHeader = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

export function decodePayment(value: string): PaymentPayload | null {
  if (value.length > MAX_PAYMENT_HEADER || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as PaymentPayload : null;
  } catch {
    return null;
  }
}

/** Whether a payment is for exactly this price: same chain, coin, amount, wallet and fee payer. */
export function paysFor(payment: PaymentPayload, req: PaymentRequirements): boolean {
  const a = payment.accepted;
  return payment.x402Version === 2 && !!a
    && a.scheme === req.scheme && a.network === req.network && a.amount === req.amount
    && a.asset === req.asset && a.payTo === req.payTo && a.extra?.feePayer === req.extra.feePayer;
}

/** What the server does with a blog request: send the page (with these extra headers), or send this answer instead. */
export type Gate =
  | { type: "serve"; headers: Record<string, string> }
  | { type: "respond"; status: number; headers: Record<string, string>; body: unknown };

export interface GateRequest {
  headers: Record<string, string | string[] | undefined>;
  url: URL;
  /** The page's own address, as an agent should be told it. */
  resourceUrl: string;
  /** The same article's preview address, offered to an agent that does not want the whole of it. */
  previewUrl?: string;
  kind: Priced;
  title: string;
  /** A HEAD request: told the price, but never charged, since it would get no page for the money. */
  head?: boolean;
}

const DESCRIBE: Record<Priced, string> = { article: "Article:", preview: "Preview of", page: "Page:" };

export const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : 3)}`;

export type Respond = Extract<Gate, { type: "respond" }>;

export interface ChargerConfig { network: Network; payTo: string; facilitator: Facilitator }

/** What a payment is for, as an agent is told it: the address it pays at, and in words. */
export interface Resource { url: string; description: string; mimeType: string }

/**
 * The x402 exchange itself, for any price: the 402 that asks, the checks on
 * what comes back, and the facilitator's verify and settle. The paywall and
 * the agent shop both charge through this, so there is one place that decides
 * whether a payment is good.
 *
 * Verify and settle are separate steps on purpose: the shop reserves stock
 * between them, so a settled payment always has its goods set aside.
 */
export function createX402Charger(config: ChargerConfig) {
  const { caip2, usdc } = SOLANA_NETWORKS[config.network];

  const paymentRequired = (resource: Resource, accepts: PaymentRequirements, error: string, body: Record<string, unknown> = {}): Respond => ({
    type: "respond", status: 402,
    headers: { "PAYMENT-REQUIRED": encodeHeader({ x402Version: 2, error, resource, accepts: [accepts] }), "cache-control": "no-store" },
    body: { error, price: `${dollars(Number(accepts.amount))} USDC on Solana`, ...body, howToPay: "x402 version 2: https://x402.org" },
  });

  const unavailable = (): Respond => ({
    type: "respond", status: 503, headers: { "retry-after": "30", "cache-control": "no-store" },
    body: { error: "Payments cannot be checked right now. Try again shortly." },
  });

  return {
    network: caip2,
    paymentRequired,
    unavailable,

    /** The price in USDC millionths. Throws when the facilitator cannot be reached, since its fee payer is part of the price. */
    async requirements(micros: number): Promise<PaymentRequirements> {
      return {
        scheme: "exact", network: caip2, amount: String(micros), asset: usdc, payTo: config.payTo,
        maxTimeoutSeconds: 60, extra: { feePayer: await config.facilitator.feePayer(caip2) },
      };
    },

    /** Reads the payment a request carries and has the facilitator verify it is good for exactly this price. Nothing is moved yet. */
    async verify(headers: Record<string, string | string[] | undefined>, accepts: PaymentRequirements, resource: Resource):
      Promise<{ ok: true; payment: PaymentPayload; payer?: string } | { ok: false; response: Respond }> {
      const refuse = (error: string) => ({ ok: false as const, response: paymentRequired(resource, accepts, error) });
      const payment = decodePayment(header(headers, "payment-signature") ?? header(headers, "x-payment") ?? "");
      if (!payment) return refuse("The payment header could not be read.");
      if (payment.x402Version !== 2) return refuse("Only x402 version 2 payments are accepted.");
      if (!paysFor(payment, accepts)) return refuse("The payment is not for this price.");
      // A v2 client says which address it is paying for; a payment meant for another page or order is not good here.
      const said = (payment.resource as { url?: unknown } | undefined)?.url;
      if (typeof said === "string" && said !== resource.url) return refuse("The payment is for a different address.");
      try {
        const verified = await config.facilitator.verify(payment, accepts);
        if (!verified.isValid) return refuse(`The payment was not accepted: ${verified.invalidReason ?? "invalid"}.`);
        return { ok: true, payment, payer: verified.payer };
      } catch (err) {
        console.error("[safehubby] x402: verify failed:", err instanceof Error ? err.message : err);
        return { ok: false, response: unavailable() };
      }
    },

    /** Puts a verified payment on chain. Only after this has the money moved. */
    async settle(payment: PaymentPayload, accepts: PaymentRequirements, resource: Resource):
      Promise<{ ok: true; settled: SettleResult } | { ok: false; response: Respond; failed: "refused" | "unreachable" }> {
      try {
        const settled = await config.facilitator.settle(payment, accepts);
        if (!settled.success) {
          return { ok: false, failed: "refused", response: paymentRequired(resource, accepts, `The payment did not go through: ${settled.errorReason ?? "failed"}.`) };
        }
        return { ok: true, settled };
      } catch (err) {
        console.error("[safehubby] x402: settle failed:", err instanceof Error ? err.message : err);
        return { ok: false, failed: "unreachable", response: unavailable() };
      }
    },
  };
}

export type X402Charger = ReturnType<typeof createX402Charger>;

export function createAgentPaywall(config: PaywallConfig, charger: X402Charger = createX402Charger(config)) {
  return {
    async gate(req: GateRequest): Promise<Gate> {
      const visitor = classifyVisitor(req.headers, req.url, config.accessKey);
      // A page someone paid for is theirs alone: no shared cache may hand it to the next agent.
      if (visitor === "owner") return { type: "serve", headers: { "cache-control": "private, no-store" } };
      if (visitor === "person" || visitor === "search" || visitor === "claude") return { type: "serve", headers: {} };

      let accepts: PaymentRequirements;
      try {
        accepts = await charger.requirements(PRICES[req.kind]);
      } catch (err) {
        console.error("[safehubby] Paywall: the facilitator did not answer:", err instanceof Error ? err.message : err);
        return charger.unavailable();
      }
      const resource: Resource = { url: req.resourceUrl, description: `${DESCRIBE[req.kind]} ${req.title}`, mimeType: "text/html" };
      const extra = req.previewUrl ? { preview: { url: req.previewUrl, price: `${dollars(PRICES.preview)} USDC on Solana` } } : {};
      if (visitor === "agent") return charger.paymentRequired(resource, accepts, "Payment required to read this page.", extra);
      if (req.head) return charger.paymentRequired(resource, accepts, "Send the payment with a GET request.", extra);

      const verified = await charger.verify(req.headers, accepts, resource);
      if (!verified.ok) return verified.response;
      // Settled before the page is sent: an agent never gets the page for a payment that later fails.
      const done = await charger.settle(verified.payment, accepts, resource);
      if (!done.ok) return done.response;
      console.log(`[safehubby] Agent paid ${dollars(PRICES[req.kind])} for ${req.url.pathname}${req.kind === "preview" ? " (preview)" : ""}, transaction ${done.settled.transaction ?? "?"}`);
      return { type: "serve", headers: { "PAYMENT-RESPONSE": encodeHeader(done.settled), "cache-control": "private, no-store" } };
    },
  };
}

export type AgentPaywall = ReturnType<typeof createAgentPaywall>;
