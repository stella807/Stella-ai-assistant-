import { createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";
import type { Facilitator, PaymentPayload, PaymentRequirements, SettleResult } from "../agent-paywall.ts";

/**
 * An x402 facilitator over HTTP: Coinbase's (CDP), or any other that speaks
 * the same three calls, /supported, /verify and /settle.
 *
 * Coinbase's needs a CDP API key (portal.cdp.coinbase.com): each call carries
 * a two-minute JWT signed with it, naming the exact method and address. The
 * key is signed here with Node's own crypto rather than through Coinbase's SDK,
 * which would add a few hundred packages to sign one token.
 *
 * Nothing here can move money. The facilitator only puts on chain a transfer
 * the agent has already signed, to the wallet in the price.
 */

export const COINBASE_FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

export interface CdpKey { id: string; secret: string }

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** The CDP key as a signing key: a PEM EC key (ES256), or the base64 Ed25519 key the portal hands out (EdDSA). */
function signingKey(secret: string): { key: KeyObject; alg: "ES256" | "EdDSA" } {
  const text = secret.replace(/\\n/g, "\n").trim();
  if (text.includes("-----BEGIN")) return { key: createPrivateKey(text), alg: "ES256" };
  const raw = Buffer.from(text, "base64");
  if (raw.length !== 64) throw new Error("CDP_API_KEY_SECRET is neither a PEM key nor a 64-byte base64 Ed25519 key");
  return {
    key: createPrivateKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519", d: b64url(raw.subarray(0, 32)), x: b64url(raw.subarray(32)) } }),
    alg: "EdDSA",
  };
}

/** A JWT for one CDP REST call, the same claims Coinbase's own SDK writes. */
export function cdpJwt(key: CdpKey, method: string, url: string, now = Math.floor(Date.now() / 1000)): string {
  const { key: privateKey, alg } = signingKey(key.secret);
  const { host, pathname } = new URL(url);
  const head = { alg, kid: key.id, typ: "JWT", nonce: randomBytes(16).toString("hex") };
  const claims = { sub: key.id, iss: "cdp", uris: [`${method} ${host}${pathname}`], iat: now, nbf: now, exp: now + 120 };
  const input = `${b64url(JSON.stringify(head))}.${b64url(JSON.stringify(claims))}`;
  const signature = alg === "ES256"
    ? sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" })
    : sign(null, Buffer.from(input), privateKey);
  return `${input}.${b64url(signature)}`;
}

export interface HttpFacilitatorOptions {
  url: string;
  cdpKey?: CdpKey | null;
  fetch?: typeof fetch;
  now?: () => number;
}

/** How long the facilitator's fee payer is trusted before it is asked again. It changes rarely, and asking on every 402 would double the calls. */
const SUPPORTED_TTL_MS = 60 * 60_000;
const TIMEOUT_MS = 15_000;

export function createHttpFacilitator(options: HttpFacilitatorOptions): Facilitator {
  const base = options.url.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let supported: { at: number; feePayers: Map<string, string> } | null = null;

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const url = `${base}${path}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.cdpKey) headers.authorization = `Bearer ${cdpJwt(options.cdpKey, method, url)}`;
    const res = await doFetch(url, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = null; }
    // A refused payment comes back as a 4xx with the usual answer in it; anything else is the facilitator failing.
    if (!res.ok && !(data && typeof data === "object" && ("isValid" in data || "success" in data))) {
      throw new Error(`facilitator ${path} answered ${res.status}: ${text.slice(0, 200)}`);
    }
    return data;
  }

  const send = (payment: PaymentPayload, requirements: PaymentRequirements) =>
    ({ x402Version: payment.x402Version, paymentPayload: payment, paymentRequirements: requirements });

  return {
    async feePayer(network) {
      if (!supported || now() - supported.at > SUPPORTED_TTL_MS) {
        const data = await call("GET", "/supported") as { kinds?: { x402Version?: number; scheme?: string; network?: string; extra?: { feePayer?: unknown } }[] };
        const feePayers = new Map<string, string>();
        for (const k of data?.kinds ?? []) {
          if (k.x402Version === 2 && k.scheme === "exact" && k.network && typeof k.extra?.feePayer === "string") feePayers.set(k.network, k.extra.feePayer);
        }
        supported = { at: now(), feePayers };
      }
      const payer = supported.feePayers.get(network);
      if (!payer) throw new Error(`the facilitator does not take x402 v2 "exact" payments on ${network}`);
      return payer;
    },
    async verify(payment, requirements) {
      const data = await call("POST", "/verify", send(payment, requirements)) as { isValid?: unknown; invalidReason?: unknown };
      return { isValid: data?.isValid === true, invalidReason: typeof data?.invalidReason === "string" ? data.invalidReason : undefined };
    },
    async settle(payment, requirements) {
      const data = await call("POST", "/settle", send(payment, requirements)) as Record<string, unknown> | null;
      const str = (k: string) => (typeof data?.[k] === "string" ? data[k] as string : undefined);
      const result: SettleResult = { success: data?.success === true, errorReason: str("errorReason"), transaction: str("transaction"), network: str("network"), payer: str("payer") };
      return result;
    },
  };
}

/** The owner's Solana wallet, where agents' USDC goes. It is a public address, safe to keep in the code; X402_PAY_TO replaces it. */
export const OWNER_SOLANA_WALLET = "HCuw5TGE98YKdATjDaqVGKou9HPt1htiZVMQdiqYyaut";

/**
 * The blog's paywall as the environment sets it up, or null to leave the blog
 * free for everyone. It is on once a facilitator is set: a CDP API key
 * (CDP_API_KEY_ID and CDP_API_KEY_SECRET) for Coinbase's, or X402_FACILITATOR_URL
 * for another, such as https://x402.org/facilitator to test on Solana devnet.
 */
export function agentPaywallConfigFromEnv(env: Record<string, string | undefined> = process.env):
  { network: "solana" | "solana-devnet"; payTo: string; facilitator: Facilitator; accessKey: string | null; describe: string } | null {
  const id = env.CDP_API_KEY_ID?.trim(), secret = env.CDP_API_KEY_SECRET?.trim();
  const url = env.X402_FACILITATOR_URL?.trim() || (id && secret ? COINBASE_FACILITATOR_URL : "");
  if (!url) return null;
  const network = env.X402_NETWORK?.trim() === "solana-devnet" ? "solana-devnet" : "solana";
  const payTo = env.X402_PAY_TO?.trim() || OWNER_SOLANA_WALLET;
  const accessKey = env.BLOG_ACCESS_KEY?.trim() || null;
  const cdpKey = id && secret ? { id, secret } : null;
  if (cdpKey) signingKey(cdpKey.secret); // A bad key fails here, at start, not on an agent's first payment.
  return {
    network, payTo, accessKey,
    facilitator: createHttpFacilitator({ url, cdpKey }),
    describe: `on, ${network === "solana" ? "Solana mainnet" : "Solana devnet (test money)"}, paid to ${payTo}, through ${new URL(url).host}`
      + `${cdpKey ? " with a CDP key" : ""}; BLOG_ACCESS_KEY ${accessKey && accessKey.length >= 24 ? "set" : accessKey ? "TOO SHORT (24+ characters), ignored" : "not set"}`,
  };
}
