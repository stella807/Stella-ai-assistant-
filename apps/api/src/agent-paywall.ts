import { timingSafeEqual } from "node:crypto";

/**
 * AI agents pay to read the blog; people do not.
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
export const PRICES = { article: 50_000, preview: 1_000 } as const;
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
  verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<{ isValid: boolean; invalidReason?: string }>;
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

export type Visitor = "owner" | "paying" | "agent" | "search" | "person";

/** Agents and crawlers that read pages for an AI product. Checked before SEARCH, because "Applebot-Extended" contains "Applebot". */
const AI_AGENTS = /gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|claude-web|anthropic-ai|perplexitybot|perplexity-user|ccbot|bytespider|amazonbot|applebot-extended|meta-externalagent|meta-externalfetcher|facebookbot|cohere-ai|cohere-training|diffbot|youbot|mistralai-user|duckassistbot|google-cloudvertexbot|googleother|petalbot|ai2bot|imagesiftbot|timpibot|omgili|firecrawl|crawl4ai|scrapy|headlesschrome|phantomjs/i;
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

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : 3)}`;

export function createAgentPaywall(config: PaywallConfig) {
  const { caip2, usdc } = SOLANA_NETWORKS[config.network];

  async function requirementsFor(kind: Priced): Promise<PaymentRequirements> {
    return {
      scheme: "exact", network: caip2, amount: String(PRICES[kind]), asset: usdc, payTo: config.payTo,
      maxTimeoutSeconds: 60, extra: { feePayer: await config.facilitator.feePayer(caip2) },
    };
  }

  function paymentRequired(req: GateRequest, accepts: PaymentRequirements, error: string): Gate {
    const required = {
      x402Version: 2, error,
      resource: { url: req.resourceUrl, description: `${req.kind === "preview" ? "Preview of" : "Article:"} ${req.title}`, mimeType: "text/html" },
      accepts: [accepts],
    };
    return {
      type: "respond", status: 402,
      headers: { "PAYMENT-REQUIRED": encodeHeader(required), "cache-control": "no-store" },
      body: {
        error,
        price: `${dollars(PRICES[req.kind])} USDC on Solana`,
        ...(req.previewUrl ? { preview: { url: req.previewUrl, price: `${dollars(PRICES.preview)} USDC on Solana` } } : {}),
        howToPay: "x402 version 2: https://x402.org",
      },
    };
  }

  const unavailable = (): Gate => ({
    type: "respond", status: 503, headers: { "retry-after": "30", "cache-control": "no-store" },
    body: { error: "Payments cannot be checked right now. Try again shortly." },
  });

  return {
    async gate(req: GateRequest): Promise<Gate> {
      const visitor = classifyVisitor(req.headers, req.url, config.accessKey);
      // A page someone paid for is theirs alone: no shared cache may hand it to the next agent.
      if (visitor === "owner") return { type: "serve", headers: { "cache-control": "private, no-store" } };
      if (visitor === "person" || visitor === "search") return { type: "serve", headers: {} };

      let accepts: PaymentRequirements;
      try {
        accepts = await requirementsFor(req.kind);
      } catch (err) {
        console.error("[safehubby] Blog paywall: the facilitator did not answer:", err instanceof Error ? err.message : err);
        return unavailable();
      }
      if (visitor === "agent") return paymentRequired(req, accepts, "Payment required to read this page.");
      if (req.head) return paymentRequired(req, accepts, "Send the payment with a GET request.");

      const raw = header(req.headers, "payment-signature") ?? header(req.headers, "x-payment") ?? "";
      const payment = decodePayment(raw);
      if (!payment) return paymentRequired(req, accepts, "The payment header could not be read.");
      if (payment.x402Version !== 2) return paymentRequired(req, accepts, "Only x402 version 2 payments are accepted.");
      if (!paysFor(payment, accepts)) return paymentRequired(req, accepts, "The payment is not for this page's price.");

      try {
        const verified = await config.facilitator.verify(payment, accepts);
        if (!verified.isValid) return paymentRequired(req, accepts, `The payment was not accepted: ${verified.invalidReason ?? "invalid"}.`);
        // Settled before the page is sent: an agent never gets the page for a payment that later fails.
        const settled = await config.facilitator.settle(payment, accepts);
        if (!settled.success) return paymentRequired(req, accepts, `The payment did not go through: ${settled.errorReason ?? "failed"}.`);
        console.log(`[safehubby] Blog: ${dollars(PRICES[req.kind])} paid for ${req.url.pathname}${req.kind === "preview" ? " (preview)" : ""}, transaction ${settled.transaction ?? "?"}`);
        return { type: "serve", headers: { "PAYMENT-RESPONSE": encodeHeader(settled), "cache-control": "private, no-store" } };
      } catch (err) {
        console.error("[safehubby] Blog paywall: payment check failed:", err instanceof Error ? err.message : err);
        return unavailable();
      }
    },
  };
}

export type AgentPaywall = ReturnType<typeof createAgentPaywall>;
