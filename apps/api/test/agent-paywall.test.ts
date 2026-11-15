import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify as verifySignature, createPublicKey } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  PRICES, SOLANA_NETWORKS, classifyVisitor, createAgentPaywall, decodePayment, encodeHeader,
  type Facilitator, type GateRequest, type PaymentPayload, type PaymentRequirements,
} from "../src/agent-paywall.ts";
import { OWNER_SOLANA_WALLET, agentPaywallConfigFromEnv, cdpJwt, createHttpFacilitator } from "../src/adapters/x402-facilitator.ts";
import { blogPageFor } from "../src/blog.ts";
import { ARTICLES } from "../src/blog/index.ts";
import type { SeoFacts } from "../src/seo.ts";

const KEY = "owner-key-0123456789abcdefghij";
const FEE_PAYER = "FacilitatorFeePayer1111111111111111111111111";
const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAINNET = SOLANA_NETWORKS.solana;

function fakeFacilitator(overrides: Partial<Facilitator> = {}) {
  return {
    feePayer: vi.fn(async () => FEE_PAYER),
    verify: vi.fn(async () => ({ isValid: true })),
    settle: vi.fn(async () => ({ success: true, transaction: "5txSig", network: MAINNET.caip2, payer: "AgentWallet" })),
    ...overrides,
  } satisfies Facilitator;
}

const paywallWith = (facilitator: Facilitator) =>
  createAgentPaywall({ network: "solana", payTo: OWNER_SOLANA_WALLET, facilitator, accessKey: KEY });

const request = (headers: Record<string, string>, extra: Partial<GateRequest> = {}): GateRequest => ({
  headers, url: new URL("https://safehubby.com/blog/a-post"), resourceUrl: "https://safehubby.com/blog/a-post",
  previewUrl: "https://safehubby.com/blog/a-post?preview=1", kind: "article", title: "A post", ...extra,
});

const decode = (value: string) => JSON.parse(Buffer.from(value, "base64").toString("utf8"));

/** What an x402 v2 client sends back: the price it accepted, and its signed transfer. */
const paymentFor = (accepted: PaymentRequirements): PaymentPayload => ({ x402Version: 2, accepted, payload: { transaction: "base64tx" } });

describe("who pays", () => {
  const who = (ua: string | undefined, url = "https://safehubby.com/blog/x", more: Record<string, string> = {}) =>
    classifyVisitor({ ...(ua === undefined ? {} : { "user-agent": ua }), ...more }, new URL(url), KEY);

  it("lets people read free", () => {
    expect(who(BROWSER)).toBe("person");
    expect(who("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36")).toBe("person");
  });

  it("asks AI crawlers and agents to pay, OpenAI's included", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot-Extended/0.1)",
    ]) expect(who(ua), ua).toBe("agent");
  });

  it("lets every one of Claude's agents and crawlers read free", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
      "anthropic-ai",
    ]) expect(who(ua), ua).toBe("claude");
  });

  it("asks plain HTTP tools and headless browsers to pay, and a visitor with no User-Agent", () => {
    for (const ua of ["curl/8.5.0", "python-requests/2.32.3", "Go-http-client/2.0", "node", "axios/1.7.2",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36"]) {
      expect(who(ua), ua).toBe("agent");
    }
    expect(who(undefined)).toBe("agent");
    expect(who("   ")).toBe("agent");
  });

  it("lets search engines and link previews read free, so the blog stays in search and shared links work", () => {
    expect(who("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("search");
    expect(who("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe("search");
    expect(who("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1)")).toBe("search");
    expect(who("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe("search");
    expect(who("WhatsApp/2.23.20.0")).toBe("search");
  });

  it("lets the owner's key read free, by address or by header, whatever the visitor says it is", () => {
    expect(who("curl/8.5.0", `https://safehubby.com/blog/x?access=${KEY}`)).toBe("owner");
    expect(who("ClaudeBot/1.0", "https://safehubby.com/blog/x", { "x-safehubby-access": KEY })).toBe("owner");
    expect(who("curl/8.5.0", "https://safehubby.com/blog/x?access=wrong")).toBe("agent");
    expect(who("curl/8.5.0", `https://safehubby.com/blog/x?access=${KEY}x`)).toBe("agent");
  });

  it("ignores a key too short to be safe, so it is never a free pass", () => {
    const short = "short-key";
    expect(classifyVisitor({ "user-agent": "curl/8" }, new URL(`https://safehubby.com/blog/x?access=${short}`), short)).toBe("agent");
    expect(classifyVisitor({ "user-agent": "curl/8" }, new URL("https://safehubby.com/blog/x?access="), "")).toBe("agent");
  });

  it("takes any request carrying a payment as a payment", () => {
    expect(who(BROWSER, undefined, { "payment-signature": "abc" })).toBe("paying");
    expect(who("curl/8", undefined, { "x-payment": "abc" })).toBe("paying");
  });
});

describe("the payment header", () => {
  it("reads a base64 JSON object and nothing else", () => {
    expect(decodePayment(encodeHeader({ x402Version: 2 }))).toEqual({ x402Version: 2 });
    expect(decodePayment("not base64!")).toBeNull();
    expect(decodePayment(encodeHeader([1, 2]))).toBeNull();
    expect(decodePayment(Buffer.from("{oops").toString("base64"))).toBeNull();
    expect(decodePayment("A".repeat(20_000))).toBeNull();
  });
});

describe("the paywall", () => {
  it("serves people and search engines without asking the facilitator anything", async () => {
    const f = fakeFacilitator();
    const paywall = paywallWith(f);
    expect(await paywall.gate(request({ "user-agent": BROWSER }))).toEqual({ type: "serve", headers: {} });
    expect((await paywall.gate(request({ "user-agent": "Googlebot/2.1" }))).type).toBe("serve");
    expect(f.feePayer).not.toHaveBeenCalled();
  });

  it("serves Claude free, article and preview, without asking the facilitator anything", async () => {
    const f = fakeFacilitator();
    const paywall = paywallWith(f);
    expect(await paywall.gate(request({ "user-agent": "Claude-User/1.0" }))).toEqual({ type: "serve", headers: {} });
    expect((await paywall.gate(request({ "user-agent": "ClaudeBot/1.0" }, { kind: "preview" }))).type).toBe("serve");
    expect(f.feePayer).not.toHaveBeenCalled();
  });

  it("serves the owner's key free and keeps the page out of shared caches", async () => {
    const gate = await paywallWith(fakeFacilitator()).gate(request({ "user-agent": "curl/8", "x-safehubby-access": KEY }));
    expect(gate).toEqual({ type: "serve", headers: { "cache-control": "private, no-store" } });
  });

  it("asks an agent for $0.05 in USDC on Solana, to the owner's wallet, and offers the $0.001 preview", async () => {
    const gate = await paywallWith(fakeFacilitator()).gate(request({ "user-agent": "GPTBot/1.2" }));
    if (gate.type !== "respond") throw new Error("expected a 402");
    expect(gate.status).toBe(402);
    expect(gate.headers["cache-control"]).toBe("no-store");
    const required = decode(gate.headers["PAYMENT-REQUIRED"]!);
    expect(required).toEqual({
      x402Version: 2, error: "Payment required to read this page.",
      resource: { url: "https://safehubby.com/blog/a-post", description: "Article: A post", mimeType: "text/html" },
      accepts: [{
        scheme: "exact", network: MAINNET.caip2, amount: "50000", asset: MAINNET.usdc, payTo: OWNER_SOLANA_WALLET,
        maxTimeoutSeconds: 60, extra: { feePayer: FEE_PAYER },
      }],
    });
    expect(gate.body).toMatchObject({
      price: "$0.05 USDC on Solana",
      preview: { url: "https://safehubby.com/blog/a-post?preview=1", price: "$0.001 USDC on Solana" },
    });
  });

  it("prices a preview at $0.001", async () => {
    const gate = await paywallWith(fakeFacilitator()).gate(request({ "user-agent": "PerplexityBot/1.0" }, { kind: "preview", previewUrl: undefined, title: "A post" }));
    if (gate.type !== "respond") throw new Error("expected a 402");
    const required = decode(gate.headers["PAYMENT-REQUIRED"]!);
    expect(required.accepts[0].amount).toBe(String(PRICES.preview));
    expect(required.resource.description).toBe("Preview of A post");
    expect(gate.body).not.toHaveProperty("preview");
  });

  async function priceFor(kind: "article" | "preview" = "article"): Promise<PaymentRequirements> {
    const gate = await paywallWith(fakeFacilitator()).gate(request({ "user-agent": "GPTBot" }, { kind }));
    if (gate.type !== "respond") throw new Error("expected a 402");
    return decode(gate.headers["PAYMENT-REQUIRED"]!).accepts[0];
  }

  it("verifies, then settles, then serves a paid request, with the receipt in PAYMENT-RESPONSE", async () => {
    const accepted = await priceFor();
    const f = fakeFacilitator();
    const gate = await paywallWith(f).gate(request({ "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor(accepted)) }));
    expect(gate.type).toBe("serve");
    if (gate.type !== "serve") return;
    expect(gate.headers["cache-control"]).toBe("private, no-store");
    expect(decode(gate.headers["PAYMENT-RESPONSE"]!)).toMatchObject({ success: true, transaction: "5txSig" });
    // The facilitator is held to this server's price, never to what the agent claims it accepted.
    expect(f.verify).toHaveBeenCalledWith(expect.objectContaining({ x402Version: 2 }), accepted);
    expect(f.settle).toHaveBeenCalledWith(expect.objectContaining({ x402Version: 2 }), accepted);
  });

  it("refuses a payment for a different price, coin, wallet or fee payer without asking the facilitator", async () => {
    const accepted = await priceFor();
    for (const change of [
      { amount: "1000" }, { asset: SOLANA_NETWORKS["solana-devnet"].usdc }, { payTo: "SomeoneElse111111111111111111111111111111111" },
      { network: SOLANA_NETWORKS["solana-devnet"].caip2 }, { extra: { feePayer: "Other" } },
    ]) {
      const f = fakeFacilitator();
      const gate = await paywallWith(f).gate(request({ "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor({ ...accepted, ...change } as PaymentRequirements)) }));
      expect(gate.type === "respond" && gate.status, JSON.stringify(change)).toBe(402);
      expect(f.verify).not.toHaveBeenCalled();
    }
  });

  it("will not sell the preview's price for the whole article", async () => {
    const previewPrice = await priceFor("preview");
    const f = fakeFacilitator();
    const gate = await paywallWith(f).gate(request({ "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor(previewPrice)) }));
    expect(gate.type === "respond" && gate.status).toBe(402);
    expect(f.verify).not.toHaveBeenCalled();
  });

  it("refuses an x402 v1 payment and an unreadable one", async () => {
    const accepted = await priceFor();
    for (const header of [encodeHeader({ ...paymentFor(accepted), x402Version: 1 }), "%%%"]) {
      const gate = await paywallWith(fakeFacilitator()).gate(request({ "user-agent": "GPTBot", "x-payment": header }));
      expect(gate.type === "respond" && gate.status).toBe(402);
    }
  });

  it("does not settle a payment the facilitator finds invalid, and does not serve one that fails to settle", async () => {
    const accepted = await priceFor();
    const header = { "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor(accepted)) };

    const invalid = fakeFacilitator({ verify: vi.fn(async () => ({ isValid: false, invalidReason: "insufficient_funds" })) });
    const refused = await paywallWith(invalid).gate(request(header));
    expect(refused.type === "respond" && refused.status).toBe(402);
    expect(refused.type === "respond" && refused.body).toMatchObject({ error: "The payment was not accepted: insufficient_funds." });
    expect(invalid.settle).not.toHaveBeenCalled();

    const failed = fakeFacilitator({ settle: vi.fn(async () => ({ success: false, errorReason: "blockhash_expired" })) });
    const notServed = await paywallWith(failed).gate(request(header));
    expect(notServed.type === "respond" && notServed.status).toBe(402);
  });

  it("never charges a HEAD request, which would get no page for the money", async () => {
    const accepted = await priceFor();
    const f = fakeFacilitator();
    const gate = await paywallWith(f).gate(request({ "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor(accepted)) }, { head: true }));
    expect(gate.type === "respond" && gate.status).toBe(402);
    expect(f.settle).not.toHaveBeenCalled();
  });

  it("answers 503 rather than giving the page away when the facilitator is down", async () => {
    const down = fakeFacilitator({ feePayer: vi.fn(async () => { throw new Error("timeout"); }) });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const gate = await paywallWith(down).gate(request({ "user-agent": "GPTBot" }));
    expect(gate.type === "respond" && gate.status).toBe(503);
    const accepted = await priceFor();
    const settleDown = fakeFacilitator({ settle: vi.fn(async () => { throw new Error("502"); }) });
    const paid = await paywallWith(settleDown).gate(request({ "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor(accepted)) }));
    expect(paid.type === "respond" && paid.status).toBe(503);
    error.mockRestore();
  });
});

describe("the preview page", () => {
  const facts: SeoFacts = {
    origin: "https://safehubby.com",
    plans: [{ name: "Free", monthlyCents: 0, seats: 1 }, { name: "Basic", monthlyCents: 3900, seats: 1 }],
    hourlyCents: 4500, armedHourlyCents: 7500, errandFromCents: 1234, hospitalDayCents: 19500,
    loungeFeeCents: 2000, markets: ["Puerto Rico"], roles: [], hiringOpenedOn: "2026-10-28",
  };
  const article = ARTICLES[0]!;

  it("has the title, the summary and the first paragraph, links to the article, and is not indexed", () => {
    const page = blogPageFor(`/blog/${article.slug.en}`, facts, ARTICLES, { preview: true })!;
    const full = blogPageFor(`/blog/${article.slug.en}`, facts)!;
    expect(page.kind).toBe("preview");
    expect(full.kind).toBe("article");
    expect(page.title).toBe(article.title.en);
    expect(page.html).toContain(`<meta name="robots" content="noindex" />`);
    expect(page.html).toContain(`href="/blog/${article.slug.en}"`);
    expect(page.html.length).toBeLessThan(full.html.length / 2);
  });

  it("marks the indexes and missing articles as free pages", () => {
    expect(blogPageFor("/blog", facts)!.kind).toBe("index");
    expect(blogPageFor("/es/blog/nada", facts, ARTICLES, { preview: true })!.kind).toBe("missing");
  });
});

describe("the facilitator over HTTP", () => {
  function decodeJwt(token: string) {
    const [h, c, s] = token.split(".");
    return { head: JSON.parse(Buffer.from(h!, "base64url").toString()), claims: JSON.parse(Buffer.from(c!, "base64url").toString()), input: `${h}.${c}`, sig: Buffer.from(s!, "base64url") };
  }

  it("signs a CDP JWT with an EC key, naming the exact call", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const token = cdpJwt({ id: "organizations/o/apiKeys/k", secret: pem }, "POST", `https://api.cdp.coinbase.com/platform/v2/x402/settle`, 1_000);
    const { head, claims, input, sig } = decodeJwt(token);
    expect(head).toMatchObject({ alg: "ES256", kid: "organizations/o/apiKeys/k", typ: "JWT" });
    expect(head.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(claims).toEqual({ sub: "organizations/o/apiKeys/k", iss: "cdp", uris: ["POST api.cdp.coinbase.com/platform/v2/x402/settle"], iat: 1_000, nbf: 1_000, exp: 1_120 });
    expect(verifySignature("sha256", Buffer.from(input), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
  });

  it("signs a CDP JWT with the base64 Ed25519 key the portal hands out", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const jwk = privateKey.export({ format: "jwk" });
    const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), Buffer.from(jwk.x!, "base64url")]).toString("base64");
    const { head, input, sig } = decodeJwt(cdpJwt({ id: "key-id", secret }, "GET", "https://api.cdp.coinbase.com/platform/v2/x402/supported"));
    expect(head.alg).toBe("EdDSA");
    expect(verifySignature(null, Buffer.from(input), createPublicKey(privateKey), sig)).toBe(true);
  });

  it("learns the fee payer from /supported, once an hour, and sends verify and settle in the facilitator's shape", async () => {
    let clock = 0;
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/supported")) {
        return new Response(JSON.stringify({ kinds: [
          { x402Version: 1, scheme: "exact", network: "solana", extra: { feePayer: "V1Payer" } },
          { x402Version: 2, scheme: "exact", network: MAINNET.caip2, extra: { feePayer: FEE_PAYER } },
        ] }));
      }
      if (url.endsWith("/verify")) return new Response(JSON.stringify({ isValid: false, invalidReason: "invalid_signature" }), { status: 400 });
      return new Response(JSON.stringify({ success: true, transaction: "tx", network: MAINNET.caip2 }));
    }) as unknown as typeof fetch;
    const f = createHttpFacilitator({ url: "https://facilitator.example/x402/", fetch: fakeFetch, now: () => clock });

    expect(await f.feePayer(MAINNET.caip2)).toBe(FEE_PAYER);
    expect(await f.feePayer(MAINNET.caip2)).toBe(FEE_PAYER);
    expect(calls.filter((c) => c.url.endsWith("/supported"))).toHaveLength(1);
    clock = 61 * 60_000;
    await f.feePayer(MAINNET.caip2);
    expect(calls.filter((c) => c.url.endsWith("/supported"))).toHaveLength(2);
    await expect(f.feePayer(SOLANA_NETWORKS["solana-devnet"].caip2)).rejects.toThrow(/does not take/);

    const requirements = { scheme: "exact", network: MAINNET.caip2, amount: "50000", asset: MAINNET.usdc, payTo: OWNER_SOLANA_WALLET, maxTimeoutSeconds: 60, extra: { feePayer: FEE_PAYER } } as const;
    const payment = paymentFor(requirements);
    // A refusal is an answer, not a failure.
    expect(await f.verify(payment, requirements)).toEqual({ isValid: false, invalidReason: "invalid_signature" });
    expect(await f.settle(payment, requirements)).toMatchObject({ success: true, transaction: "tx" });
    const settle = calls.find((c) => c.url === "https://facilitator.example/x402/settle")!;
    expect(JSON.parse(settle.init.body as string)).toEqual({ x402Version: 2, paymentPayload: payment, paymentRequirements: requirements });
    expect((settle.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("treats a facilitator error page as a failure", async () => {
    const f = createHttpFacilitator({ url: "https://facilitator.example", fetch: (async () => new Response("Bad gateway", { status: 502 })) as unknown as typeof fetch });
    await expect(f.feePayer(MAINNET.caip2)).rejects.toThrow(/502/);
  });

  it("sends a CDP JWT on every call when a CDP key is set", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const jwk = privateKey.export({ format: "jwk" });
    const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), Buffer.from(jwk.x!, "base64url")]).toString("base64");
    let auth: string | undefined;
    const f = createHttpFacilitator({
      url: "https://api.cdp.coinbase.com/platform/v2/x402", cdpKey: { id: "k", secret },
      fetch: (async (_url: string, init: RequestInit) => {
        auth = (init.headers as Record<string, string>).authorization;
        return new Response(JSON.stringify({ kinds: [{ x402Version: 2, scheme: "exact", network: MAINNET.caip2, extra: { feePayer: FEE_PAYER } }] }));
      }) as unknown as typeof fetch,
    });
    await f.feePayer(MAINNET.caip2);
    expect(auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(decodeJwt(auth!.slice(7)).claims.uris).toEqual(["GET api.cdp.coinbase.com/platform/v2/x402/supported"]);
  });
});

describe("the paywall's settings", () => {
  it("is off until a facilitator is set", () => {
    expect(agentPaywallConfigFromEnv({})).toBeNull();
    expect(agentPaywallConfigFromEnv({ CDP_API_KEY_ID: "only-the-id" })).toBeNull();
  });

  it("can run on Solana devnet with a test facilitator, paying the owner's wallet by default", () => {
    const config = agentPaywallConfigFromEnv({ X402_FACILITATOR_URL: "https://x402.org/facilitator", X402_NETWORK: "solana-devnet", BLOG_ACCESS_KEY: KEY })!;
    expect(config.network).toBe("solana-devnet");
    expect(config.payTo).toBe("HCuw5TGE98YKdATjDaqVGKou9HPt1htiZVMQdiqYyaut");
    expect(config.accessKey).toBe(KEY);
    expect(config.describe).toContain("devnet");
  });

  it("refuses a CDP key it cannot sign with, at start", () => {
    expect(() => agentPaywallConfigFromEnv({ CDP_API_KEY_ID: "k", CDP_API_KEY_SECRET: "not-a-key" })).toThrow(/CDP_API_KEY_SECRET/);
  });
});

describe("the blog, served with the paywall", () => {
  const dir = mkdtempSync(join(tmpdir(), "safehubby-paywall-"));
  let base = "";
  let close: () => void = () => {};
  const slug = ARTICLES[0]!.slug.en;
  const f = fakeFacilitator();

  beforeAll(async () => {
    const { createApp, makeCtx } = await import("../src/server.ts");
    const { Store } = await import("../src/store.ts");
    const { SEED } = await import("../src/seed.ts");
    const store = new Store(join(dir, "db.json"));
    store.reset(structuredClone(SEED));
    const server = createApp(makeCtx(store), null, paywallWith(f));
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => { close(); rmSync(dir, { recursive: true, force: true }); });

  it("sends a person the whole article", async () => {
    const res = await fetch(`${base}/blog/${slug}`, { headers: { "user-agent": BROWSER } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("payment-required")).toBeNull();
  });

  it("asks an agent to pay for the article and for its preview, with the right addresses", async () => {
    const res = await fetch(`${base}/blog/${slug}/`, { headers: { "user-agent": "GPTBot/1.2" } });
    expect(res.status).toBe(402);
    const required = decode(res.headers.get("payment-required")!);
    expect(required.resource.url).toMatch(new RegExp(`/blog/${slug}$`));
    expect(((await res.json()) as { preview: { url: string } }).preview.url).toMatch(new RegExp(`/blog/${slug}\\?preview=1$`));

    const preview = await fetch(`${base}/blog/${slug}?preview=1`, { headers: { "user-agent": "GPTBot/1.2" } });
    expect(preview.status).toBe(402);
    expect(decode(preview.headers.get("payment-required")!).accepts[0].amount).toBe("1000");
  });

  it("serves the article to an agent that pays", async () => {
    const accepted = decode((await fetch(`${base}/blog/${slug}`, { headers: { "user-agent": "GPTBot" } })).headers.get("payment-required")!).accepts[0];
    const res = await fetch(`${base}/blog/${slug}`, { headers: { "user-agent": "GPTBot", "payment-signature": encodeHeader(paymentFor(accepted)) } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`<h1>`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("payment-response")).toBeTruthy();
  });

  it("sends Claude the whole article free", async () => {
    const res = await fetch(`${base}/blog/${slug}`, { headers: { "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<h1>");
  });

  it("lets the owner's key read the article and its preview free", async () => {
    const res = await fetch(`${base}/blog/${slug}?access=${KEY}`, { headers: { "user-agent": "curl/8.5.0" } });
    expect(res.status).toBe(200);
    const preview = await fetch(`${base}/blog/${slug}?preview=1`, { headers: { "user-agent": "curl/8.5.0", "x-safehubby-access": KEY } });
    expect(await preview.text()).toContain(`<meta name="robots" content="noindex" />`);
  });

  it("keeps the blog's index and its 404 page free to everyone", async () => {
    expect((await fetch(`${base}/blog`, { headers: { "user-agent": "GPTBot" } })).status).toBe(200);
    expect((await fetch(`${base}/es/blog`, { headers: { "user-agent": "curl/8" } })).status).toBe(200);
    expect((await fetch(`${base}/blog/not-an-article`, { headers: { "user-agent": "GPTBot" } })).status).toBe(404);
  });
});
