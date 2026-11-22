import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  SOLANA_NETWORKS, createAgentPaywall, createX402Charger, encodeHeader,
  type Facilitator, type PaymentPayload, type PaymentRequirements,
} from "../src/agent-paywall.ts";
import { createAgentShop } from "../src/agent-shop.ts";
import { makeCipher } from "../src/crypto.ts";
import type { StoreLike } from "../src/store.ts";

const ADMIN = "owner-admin-key";
const WALLET = "HCuw5TGE98YKdATjDaqVGKou9HPt1htiZVMQdiqYyaut";
const FEE_PAYER = "FacilitatorFeePayer1111111111111111111111111";
const MAINNET = SOLANA_NETWORKS.solana;
const ADDRESS = { name: "Ana Rivera", line1: "1 Calle Sol", city: "San Juan", postalCode: "00901", country: "PR", phone: "+1 787 555 0100" };
const AGENT = { "user-agent": "curl/8.5.0", "content-type": "application/json" };

const dir = mkdtempSync(join(tmpdir(), "safehubby-shop-"));
let base = "";
let server: Server;
let store: StoreLike;
let clock = new Date("2026-11-22T12:00:00Z");
const cipher = makeCipher(randomBytes(32));

let facilitator: Facilitator & { verify: ReturnType<typeof vi.fn>; settle: ReturnType<typeof vi.fn> };
const resetFacilitator = () => {
  facilitator = {
    feePayer: vi.fn(async () => FEE_PAYER),
    verify: vi.fn(async () => ({ isValid: true, payer: "AgentWallet111" })),
    settle: vi.fn(async () => ({ success: true, transaction: "5txSig", network: MAINNET.caip2, payer: "AgentWallet111" })),
  };
};
resetFacilitator();
// The shop holds the facilitator through this indirection, so each test can swap in its own.
const proxy: Facilitator = {
  feePayer: (n) => facilitator.feePayer(n),
  verify: (p, r) => facilitator.verify(p, r),
  settle: (p, r) => facilitator.settle(p, r),
};

beforeAll(async () => {
  const { createApp, makeCtx } = await import("../src/server.ts");
  const { Store } = await import("../src/store.ts");
  const { SEED } = await import("../src/seed.ts");
  store = new Store(join(dir, "db.json"));
  store.reset(structuredClone(SEED));
  const charger = createX402Charger({ network: "solana", payTo: WALLET, facilitator: proxy });
  const paywall = createAgentPaywall({ network: "solana", payTo: WALLET, facilitator: proxy, accessKey: null }, charger);
  const shop = createAgentShop({ store, charger, cipher, origin: () => "https://safehubby.com", now: () => clock, isOwner: (key) => key === ADMIN });
  server = createApp(makeCtx(store), null, paywall, shop);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

beforeEach(async () => {
  resetFacilitator();
  clock = new Date("2026-11-22T12:00:00Z");
  store.update((db) => { db.shopProducts = []; db.shopQuotes = []; db.shopOrders = []; delete db.shopShipping; });
  await owner("PUT", "/api/shop/admin/shipping", { countries: ["US", "PR"], flatCents: 800, freeOverCents: 10_000 });
  await owner("PUT", "/api/shop/admin/products/travel-mug", { name: "Travel mug", description: "12 oz, steel", priceCents: 1500, stock: 5 });
  await owner("PUT", "/api/shop/admin/products/last-one", { name: "Last one", description: "Only one", priceCents: 2000, stock: 1 });
});

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = AGENT) =>
  fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const owner = (method: string, path: string, body?: unknown) => call(method, path, body, { ...AGENT, "x-admin-key": ADMIN });
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const decode = (v: string) => JSON.parse(Buffer.from(v, "base64").toString("utf8"));
const paymentFor = (accepted: PaymentRequirements, resourceUrl?: string): PaymentPayload =>
  ({ x402Version: 2, accepted, payload: { transaction: "base64tx" }, ...(resourceUrl ? { resource: { url: resourceUrl } } : {}) });

async function quote(items: unknown = [{ productId: "travel-mug", qty: 2 }]) {
  const res = await call("POST", "/api/shop/quotes", { items, shipTo: ADDRESS });
  expect(res.status).toBe(201);
  return json(res);
}

/** The 402 for a quote, and a payment for exactly its price. */
async function priceOf(payUrl: string) {
  const res = await call("POST", new URL(payUrl).pathname);
  expect(res.status).toBe(402);
  const required = decode(res.headers.get("payment-required")!);
  return { required, accepted: required.accepts[0] as PaymentRequirements, body: await json(res) };
}

const pay = (payUrl: string, payment: PaymentPayload) =>
  call("POST", new URL(payUrl).pathname, undefined, { ...AGENT, "payment-signature": encodeHeader(payment) });

describe("browsing", () => {
  it("lists what is for sale, free, to any agent, even with the paywall on", async () => {
    const res = await call("GET", "/api/shop", undefined, { "user-agent": "GPTBot/1.2" });
    expect(res.status).toBe(200);
    const shop = await json(res);
    expect(shop.products.map((p: { productId: string }) => p.productId)).toEqual(["travel-mug", "last-one"]);
    expect(shop.products[0]).toMatchObject({ price: "$15.00", priceCents: 1500, inStock: 5 });
    expect(shop.shipsTo).toEqual(["US", "PR"]);
    expect(shop.network).toBe(MAINNET.caip2);
  });

  it("hides a product the owner switched off", async () => {
    await owner("PUT", "/api/shop/admin/products/last-one", { name: "Last one", description: "Only one", priceCents: 2000, stock: 1, active: false });
    const shop = await json(await call("GET", "/api/shop"));
    expect(shop.products.map((p: { productId: string }) => p.productId)).toEqual(["travel-mug"]);
  });
});

describe("a quote", () => {
  it("is priced by the shop, with shipping, and held for 15 minutes", async () => {
    const q = await quote([{ productId: "travel-mug", qty: 2, unitCents: 1 }]);
    expect(q).toMatchObject({ subtotal: "$30.00", shipping: "$8.00", total: "$38.00", totalCents: 3800, expiresAt: "2026-11-22T12:15:00.000Z" });
    expect(q.payUrl).toBe(`https://safehubby.com/api/shop/quotes/${q.quoteId}/pay`);
    expect(q.shipsTo).toEqual({ name: "Ana Rivera", city: "San Juan", country: "PR" });
  });

  it("keeps the address encrypted at rest", async () => {
    const q = await quote();
    const stored = store.data.shopQuotes!.find((x) => x.id === q.quoteId)!;
    expect(stored.shipTo).not.toContain("Ana");
    expect(JSON.parse(cipher.decrypt(stored.shipTo))).toMatchObject({ name: "Ana Rivera", city: "San Juan" });
  });

  it("refuses what cannot be sold, in words an agent can act on", async () => {
    const bad = await call("POST", "/api/shop/quotes", { items: [{ productId: "nope" }], shipTo: ADDRESS });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatch(/no product nope/);
    const far = await call("POST", "/api/shop/quotes", { items: [{ productId: "travel-mug" }], shipTo: { ...ADDRESS, country: "FR" } });
    expect((await json(far)).error).toMatch(/does not ship to FR/);
    expect((await call("POST", "/api/shop/quotes", "not json at all")).status).toBe(400);
  });
});

describe("paying", () => {
  it("asks for exactly the quote's total in USDC, to the owner's wallet, for that quote's address", async () => {
    const q = await quote();
    const { required, accepted, body } = await priceOf(q.payUrl);
    expect(accepted).toMatchObject({ scheme: "exact", network: MAINNET.caip2, amount: "38000000", asset: MAINNET.usdc, payTo: WALLET });
    expect(required.resource).toEqual({ url: q.payUrl, description: "Order: 2 × Travel mug", mimeType: "application/json" });
    expect(body).toMatchObject({ quoteId: q.quoteId, total: "$38.00" });
  });

  it("places the order once the payment settles, sets the stock aside, and never charges twice", async () => {
    const q = await quote();
    const { accepted } = await priceOf(q.payUrl);
    const res = await pay(q.payUrl, paymentFor(accepted, q.payUrl));
    expect(res.status).toBe(201);
    expect(res.headers.get("payment-response")).toBeTruthy();
    const order = await json(res);
    expect(order).toMatchObject({ status: "paid", total: "$38.00", transaction: "5txSig" });
    expect(order.orderId).toMatch(/^ord_[\w-]{24}$/);
    expect(order).not.toHaveProperty("shipTo");
    expect(store.data.shopProducts!.find((p) => p.id === "travel-mug")!.stock).toBe(3);
    expect(facilitator.settle).toHaveBeenCalledTimes(1);

    // An agent that retries after a timeout gets the same order, and nothing is settled again.
    const again = await pay(q.payUrl, paymentFor(accepted, q.payUrl));
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ alreadyPaid: true, orderId: order.orderId });
    expect(facilitator.settle).toHaveBeenCalledTimes(1);

    const status = await json(await call("GET", `/api/shop/orders/${order.orderId}`));
    expect(status).toMatchObject({ orderId: order.orderId, status: "paid" });
    expect(JSON.stringify(status)).not.toContain("Ana");
    expect((await call("GET", "/api/shop/orders/ord_guessed")).status).toBe(404);
  });

  it("refuses a payment for another price or another quote without asking the facilitator", async () => {
    const q = await quote();
    const other = await quote([{ productId: "travel-mug", qty: 1 }]);
    const { accepted } = await priceOf(q.payUrl);
    const { accepted: cheaper } = await priceOf(other.payUrl);

    expect((await pay(q.payUrl, paymentFor(cheaper))).status).toBe(402);
    expect((await pay(q.payUrl, paymentFor(accepted, other.payUrl))).status).toBe(402);
    expect(facilitator.verify).not.toHaveBeenCalled();
  });

  it("gives the stock back when the payment is refused on chain, so the quote can be paid again", async () => {
    facilitator.settle.mockResolvedValueOnce({ success: false, errorReason: "insufficient_funds" });
    const q = await quote();
    const { accepted } = await priceOf(q.payUrl);
    const res = await pay(q.payUrl, paymentFor(accepted));
    expect(res.status).toBe(402);
    expect((await json(res)).error).toMatch(/insufficient_funds/);
    expect(store.data.shopProducts!.find((p) => p.id === "travel-mug")!.stock).toBe(5);
    expect((await pay(q.payUrl, paymentFor(accepted))).status).toBe(201);
  });

  it("holds a payment whose result is unknown for the owner, and does not let it be paid again", async () => {
    facilitator.settle.mockRejectedValueOnce(new Error("socket hang up"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const q = await quote();
    const { accepted } = await priceOf(q.payUrl);
    const res = await pay(q.payUrl, paymentFor(accepted));
    expect(res.status).toBe(502);
    expect((await json(res)).error).toMatch(/Do not pay again/);
    expect(store.data.shopProducts!.find((p) => p.id === "travel-mug")!.stock).toBe(3);
    expect((await pay(q.payUrl, paymentFor(accepted))).status).toBe(409);
    error.mockRestore();

    const view = await json(await owner("GET", "/api/shop/admin"));
    expect(view.stuckPayments).toEqual([expect.objectContaining({ quoteId: q.quoteId, payer: "AgentWallet111", total: "$38.00" })]);
    expect(view.stuckPayments[0].shipTo.name).toBe("Ana Rivera");

    // The owner finds it on chain and fills it.
    const filled = await owner("POST", `/api/shop/admin/quotes/${q.quoteId}`, { outcome: "paid", transaction: "foundOnChain" });
    expect(filled.status).toBe(200);
    const after = await json(await pay(q.payUrl, paymentFor(accepted)));
    expect(after).toMatchObject({ alreadyPaid: true, transaction: "foundOnChain" });
  });

  it("lets the owner release a stuck payment that never went through", async () => {
    facilitator.settle.mockRejectedValueOnce(new Error("timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const q = await quote();
    const { accepted } = await priceOf(q.payUrl);
    await pay(q.payUrl, paymentFor(accepted));
    error.mockRestore();
    expect(await json(await owner("POST", `/api/shop/admin/quotes/${q.quoteId}`, { outcome: "failed" }))).toEqual({ quoteId: q.quoteId, status: "released" });
    expect(store.data.shopProducts!.find((p) => p.id === "travel-mug")!.stock).toBe(5);
    expect((await call("POST", new URL(q.payUrl).pathname)).status).toBe(410);
  });

  it("does not sell the last one twice", async () => {
    const first = await quote([{ productId: "last-one" }]);
    const second = await quote([{ productId: "last-one" }]);
    const a = await priceOf(first.payUrl), b = await priceOf(second.payUrl);
    expect((await pay(first.payUrl, paymentFor(a.accepted))).status).toBe(201);
    const late = await pay(second.payUrl, paymentFor(b.accepted));
    expect(late.status).toBe(409);
    expect((await json(late)).error).toMatch(/sold out/);
    expect(facilitator.settle).toHaveBeenCalledTimes(1);
  });

  it("will not take payment on an expired quote", async () => {
    const q = await quote();
    clock = new Date("2026-11-22T12:15:00Z");
    expect((await call("POST", new URL(q.payUrl).pathname)).status).toBe(410);
    expect((await call("POST", "/api/shop/quotes/q_nope/pay")).status).toBe(404);
  });
});

describe("the owner", () => {
  it("needs the admin key", async () => {
    expect((await call("GET", "/api/shop/admin")).status).toBe(401);
    expect((await call("PUT", "/api/shop/admin/products/x", { name: "x", description: "x", priceCents: 1, stock: 1 }, { ...AGENT, "x-admin-key": "wrong" })).status).toBe(401);
  });

  it("refuses a bad product", async () => {
    const res = await owner("PUT", "/api/shop/admin/products/Bad Id", { name: "x", description: "x", priceCents: 1, stock: 1 });
    expect(res.status).toBe(400);
  });

  async function paidOrder() {
    const q = await quote();
    const { accepted } = await priceOf(q.payUrl);
    return json(await pay(q.payUrl, paymentFor(accepted)));
  }

  it("sees the order with its address, ships it with tracking, and the agent sees the tracking", async () => {
    const order = await paidOrder();
    const view = await json(await owner("GET", "/api/shop/admin"));
    expect(view.orders[0]).toMatchObject({ id: order.orderId, payer: "AgentWallet111", shipTo: expect.objectContaining({ name: "Ana Rivera", line1: "1 Calle Sol" }) });

    const shipped = await owner("POST", `/api/shop/admin/orders/${order.orderId}`, { status: "shipped", tracking: "USPS 9400 1000 0000 0000 0000 00" });
    expect(shipped.status).toBe(200);
    expect(await json(await call("GET", `/api/shop/orders/${order.orderId}`))).toMatchObject({ status: "shipped", tracking: "USPS 9400 1000 0000 0000 0000 00" });
    expect((await owner("POST", `/api/shop/admin/orders/${order.orderId}`, { status: "cancelled" })).status).toBe(409);
  });

  it("puts the stock back when an order is cancelled before it ships, and then refunds it", async () => {
    const order = await paidOrder();
    await owner("POST", `/api/shop/admin/orders/${order.orderId}`, { status: "cancelled" });
    expect(store.data.shopProducts!.find((p) => p.id === "travel-mug")!.stock).toBe(5);
    const refunded = await json(await owner("POST", `/api/shop/admin/orders/${order.orderId}`, { status: "refunded", note: "Refunded, transaction 3abc" }));
    expect(refunded).toMatchObject({ status: "refunded", note: "Refunded, transaction 3abc" });
  });
});

describe("a server without the shop", () => {
  it("says the shop is closed", async () => {
    const { createApp, makeCtx } = await import("../src/server.ts");
    const closed = createApp(makeCtx(store));
    await new Promise<void>((r) => closed.listen(0, r));
    const res = await fetch(`http://127.0.0.1:${(closed.address() as AddressInfo).port}/api/shop`);
    closed.close();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "The agent shop is not open." });
  });
});
