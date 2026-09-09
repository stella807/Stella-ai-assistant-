import { describe, expect, it } from "vitest";
import {
  PARTY_CATALOG, PARTY_CATEGORIES, findItem, itemsIn, suggestForGuests, summarizeCart,
} from "../src/party.ts";

describe("the catalogue", () => {
  it("covers every advertised category", () => {
    for (const c of PARTY_CATEGORIES) expect(itemsIn(c.id).length).toBeGreaterThan(0);
  });

  it("prices everything above zero and names a vendor", () => {
    for (const i of PARTY_CATALOG) {
      expect(i.priceCents).toBeGreaterThan(0);
      expect(i.vendor.length).toBeGreaterThan(0);
      expect(i.unit.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate skus", () => {
    expect(new Set(PARTY_CATALOG.map((i) => i.sku)).size).toBe(PARTY_CATALOG.length);
  });

  it("offers non-alcoholic drink options", () => {
    const drinks = itemsIn("drinks").map((i) => i.name.toLowerCase());
    expect(drinks.some((n) => n.includes("mocktail"))).toBe(true);
    expect(drinks.some((n) => n.includes("soft drinks"))).toBe(true);
  });

  it("rejects an unknown sku", () => {
    expect(() => findItem("pt-unicorn")).toThrow();
  });
});

describe("the cart", () => {
  it("totals lines and splits rentals from purchases", () => {
    const s = summarizeCart([{ sku: "pt-chair", qty: 10 }, { sku: "pt-cups", qty: 1 }]);
    expect(s.subtotalCents).toBe(250 * 10 + 2800);
    expect(s.rentalCents).toBe(2500);
    expect(s.purchaseCents).toBe(2800);
  });

  it("ignores zero and negative quantities", () => {
    expect(summarizeCart([{ sku: "pt-chair", qty: 0 }, { sku: "pt-cups", qty: -2 }]).subtotalCents).toBe(0);
  });

  it("is empty for an empty cart", () => {
    const s = summarizeCart([]);
    expect(s.subtotalCents).toBe(0);
    expect(s.coversGuests).toBeNull();
  });

  it("reports coverage by the weakest category, not the strongest", () => {
    // Twelve chairs and food for forty still seats twelve.
    const s = summarizeCart([{ sku: "pt-chair", qty: 12 }, { sku: "pt-taco-bar", qty: 40 }]);
    expect(s.coversGuests).toBe(12);
  });
});

describe("suggesting a cart", () => {
  it("covers the headcount it was asked for", () => {
    const s = summarizeCart(suggestForGuests(20));
    expect(s.coversGuests).toBeGreaterThanOrEqual(20);
    expect(s.subtotalCents).toBeGreaterThan(0);
  });

  it("scales with the guest count", () => {
    expect(summarizeCart(suggestForGuests(40)).subtotalCents)
      .toBeGreaterThan(summarizeCart(suggestForGuests(10)).subtotalCents);
  });

  it("refuses a nonsense headcount", () => {
    expect(() => suggestForGuests(0)).toThrow();
    expect(() => suggestForGuests(-5)).toThrow();
  });
});
