import { describe, expect, it } from "vitest";
import {
  SHOP_MAX_ORDER_CENTS, SHOP_PERSONAL_DATA_DAYS, ShopError, canMoveOrder, centsToUsdcMicros, priceQuote, quoteExpired,
  releaseStock, reserveStock, shipToExpired, sweepShop, validateProduct, validateShipTo, validateShipping,
  type ShopOrder, type ShopProduct, type ShopQuote, type ShopShipping,
} from "../src/agent-shop.ts";

const now = new Date("2026-11-22T12:00:00Z");
const product = (id: string, priceCents: number, stock: number, active = true): ShopProduct =>
  ({ id, name: `The ${id}`, description: "x", priceCents, stock, active, updatedAt: now.toISOString() });
const CATALOG = [product("mug", 1500, 5), product("tee", 2500, 1), product("old", 999, 9, false)];
const SHIPPING: ShopShipping = { countries: ["US", "PR"], flatCents: 800, freeOverCents: 5000 };
const ADDRESS = { name: "Ana Rivera", line1: "1 Calle Sol", city: "San Juan", postalCode: "00901", country: "pr" };

describe("pricing a quote", () => {
  it("prices from the catalog, ignoring any price the agent sends, and adds shipping", () => {
    const q = priceQuote(CATALOG, SHIPPING, [{ productId: "mug", qty: 2, unitCents: 1 }], ADDRESS, now);
    expect(q.lines).toEqual([{ productId: "mug", name: "The mug", qty: 2, unitCents: 1500 }]);
    expect(q).toMatchObject({ subtotalCents: 3000, shippingCents: 800, totalCents: 3800 });
    expect(q.shipTo.country).toBe("PR");
    expect(q.expiresAt).toBe("2026-11-22T12:15:00.000Z");
  });

  it("ships free over the owner's threshold, and adds up repeated lines", () => {
    const q = priceQuote(CATALOG, SHIPPING, [{ productId: "mug", qty: 2 }, { productId: "mug" }, { productId: "tee" }], ADDRESS, now);
    expect(q.lines.find((l) => l.productId === "mug")!.qty).toBe(3);
    expect(q).toMatchObject({ subtotalCents: 7000, shippingCents: 0, totalCents: 7000 });
  });

  it("refuses what is not for sale, not in stock, or not shipped there", () => {
    const fails = (items: unknown, to: unknown = ADDRESS, shipping: ShopShipping | null = SHIPPING) =>
      expect(() => priceQuote(CATALOG, shipping, items, to, now)).toThrow(ShopError);
    fails([{ productId: "old" }]);
    fails([{ productId: "nope" }]);
    fails([{ productId: "tee", qty: 2 }]);
    fails([{ productId: "mug", qty: 0 }]);
    fails([{ productId: "mug", qty: 1.5 }]);
    fails([]);
    fails("mug");
    fails([{ productId: "mug" }], { ...ADDRESS, country: "FR" });
    fails([{ productId: "mug" }], ADDRESS, null);
    fails([{ productId: "mug" }], ADDRESS, { ...SHIPPING, countries: [] });
  });

  it("caps one order", () => {
    const pricey = [product("ring", SHOP_MAX_ORDER_CENTS, 3)];
    expect(() => priceQuote(pricey, SHIPPING, [{ productId: "ring", qty: 2 }], ADDRESS, now)).toThrow(/at most/);
  });

  it("checks the address", () => {
    expect(() => validateShipTo({ ...ADDRESS, name: "" }, SHIPPING)).toThrow(/name/);
    expect(() => validateShipTo({ ...ADDRESS, email: "nope" }, SHIPPING)).toThrow(/email/);
    expect(() => validateShipTo({ ...ADDRESS, phone: "call me" }, SHIPPING)).toThrow(/phone/);
    expect(() => validateShipTo(null, SHIPPING)).toThrow(/shipTo/);
    expect(validateShipTo({ ...ADDRESS, line2: "  ", phone: "+1 787 555 0100" }, SHIPPING)).toEqual({ ...ADDRESS, country: "PR", phone: "+1 787 555 0100" });
  });

  it("knows when a quote has expired", () => {
    const q = priceQuote(CATALOG, SHIPPING, [{ productId: "mug" }], ADDRESS, now);
    expect(quoteExpired(q, new Date("2026-11-22T12:14:59Z"))).toBe(false);
    expect(quoteExpired(q, new Date("2026-11-22T12:15:00Z"))).toBe(true);
  });

  it("converts cents to USDC's smallest unit", () => {
    expect(centsToUsdcMicros(3800)).toBe(38_000_000);
  });
});

describe("the owner's catalog and shipping", () => {
  it("takes a product and refuses a bad one", () => {
    expect(validateProduct("blue-mug", { name: " Blue mug ", description: "12 oz", priceCents: 1500, stock: 4 }, now))
      .toEqual({ id: "blue-mug", name: "Blue mug", description: "12 oz", priceCents: 1500, stock: 4, active: true, updatedAt: now.toISOString() });
    expect(() => validateProduct("Blue Mug", { name: "a", description: "b", priceCents: 1, stock: 1 }, now)).toThrow(/id/);
    expect(() => validateProduct("mug", { name: "a", description: "b", priceCents: 0, stock: 1 }, now)).toThrow(/priceCents/);
    expect(() => validateProduct("mug", { name: "a", description: "b", priceCents: 10.5, stock: 1 }, now)).toThrow(/priceCents/);
    expect(() => validateProduct("mug", { name: "a", description: "b", priceCents: 1, stock: -1 }, now)).toThrow(/stock/);
    expect(() => validateProduct("mug", { name: "a", description: "b", priceCents: 1, stock: 1, imageUrl: "http://x" }, now)).toThrow(/https/);
  });

  it("takes the shipping rules", () => {
    expect(validateShipping({ countries: ["us", "PR", "US"], flatCents: 0 })).toEqual({ countries: ["US", "PR"], flatCents: 0, freeOverCents: null });
    expect(() => validateShipping({ countries: ["USA"], flatCents: 0 })).toThrow(/two-letter/);
    expect(() => validateShipping({ countries: ["US"], flatCents: -5 })).toThrow(/flatCents/);
  });
});

describe("stock", () => {
  const lines = [{ productId: "mug", name: "The mug", qty: 2, unitCents: 1500 }];

  it("is taken when a payment is accepted and given back when it fails", () => {
    const taken = reserveStock(CATALOG, lines);
    expect(taken.find((p) => p.id === "mug")!.stock).toBe(3);
    expect(releaseStock(taken, lines).find((p) => p.id === "mug")!.stock).toBe(5);
  });

  it("takes nothing if any line sold out since the quote", () => {
    expect(() => reserveStock(CATALOG, [...lines, { productId: "tee", name: "The tee", qty: 2, unitCents: 2500 }])).toThrow(/sold out/);
  });
});

describe("an order's life", () => {
  it("moves forward, and a cancelled order still has to be refunded", () => {
    expect(canMoveOrder("paid", "shipped")).toBe(true);
    expect(canMoveOrder("shipped", "delivered")).toBe(true);
    expect(canMoveOrder("cancelled", "refunded")).toBe(true);
    expect(canMoveOrder("delivered", "shipped")).toBe(false);
    expect(canMoveOrder("shipped", "cancelled")).toBe(false);
    expect(canMoveOrder("refunded", "paid")).toBe(false);
  });

  const order = (status: ShopOrder["status"], updatedAt: string): ShopOrder => ({
    id: "o", quoteId: "q", lines: [], subtotalCents: 0, shippingCents: 0, totalCents: 0, shipTo: "sealed", status,
    network: "solana", transaction: "tx", paidAt: updatedAt, updatedAt,
  });

  it("erases the shipping details of a finished order after the keeping period, and only then", () => {
    const old = new Date(now.getTime() - SHOP_PERSONAL_DATA_DAYS * 86_400_000).toISOString();
    expect(shipToExpired(order("delivered", old), now)).toBe(true);
    expect(shipToExpired(order("refunded", old), now)).toBe(true);
    expect(shipToExpired(order("shipped", old), now)).toBe(false);
    expect(shipToExpired(order("delivered", now.toISOString()), now)).toBe(false);

    const quote = (id: string, status: ShopQuote["status"], expiresAt: string): ShopQuote =>
      ({ id, status, expiresAt, createdAt: expiresAt, lines: [], subtotalCents: 0, shippingCents: 0, totalCents: 0, shipTo: "sealed" });
    const swept = sweepShop({
      quotes: [quote("fresh", "open", now.toISOString()), quote("stale", "open", old), quote("stuck", "settling", old), quote("done", "paid", old)],
      orders: [order("delivered", old), order("paid", old)],
    }, now);
    expect(swept.quotes.map((q) => q.id)).toEqual(["fresh", "stuck"]);
    expect(swept.orders.map((o) => o.shipTo)).toEqual([null, "sealed"]);
    expect(swept).toMatchObject({ erased: 1, dropped: 2 });
  });
});
