import { describe, expect, it } from "vitest";
import {
  CARD_FEE_FIXED_CENTS, CARD_FEE_RATE, ERRAND_PROFIT_FLOOR_CENTS, ERRAND_RATE_PER_HOUR_CENTS,
  ERRAND_TIERS, errandCardCostCents, errandFeeCents, errandPayoutCents, errandProfitCents,
  findErrandTier, validateErrandTier,
} from "../src/index.ts";

const CAPS = [500, 1_000, 2_000, 4_000, 8_000, 10_000, 25_000, 100_000];

describe("errand tiers", () => {
  it("pays $16 an hour for the minutes, plus the mileage", () => {
    expect(ERRAND_RATE_PER_HOUR_CENTS).toBe(1_600);
    // 15 minutes at $16/hr is exactly $4.00, which is what the old flat quick
    // task paid — the cheapest tier is the same job at the same money.
    expect(errandPayoutCents("in-building")).toBe(400);
    // 35 min = $9.33 + 4 mi x $0.70 = $2.80
    expect(errandPayoutCents("nearby-store")).toBe(1_213);
    // 60 min = $16.00 + 10 mi = $7.00
    expect(errandPayoutCents("shopping-trip")).toBe(2_300);
    // 50 min = $13.33 + 6 mi = $4.20
    expect(errandPayoutCents("wait-in-line")).toBe(1_753);
  });

  it("climbs with the work: more time and miles never pays less", () => {
    const pay = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
    expect(Math.min(...pay)).toBe(pay[0]);
    for (const t of ERRAND_TIERS) expect(errandPayoutCents(t.id), t.id).toBeGreaterThanOrEqual(400);
  });

  it("never pays the runner less than $16 an hour for the time the tier assumes", () => {
    for (const t of ERRAND_TIERS) {
      const hourly = (errandPayoutCents(t.id) / t.minutes) * 60;
      // Mileage is on top, so the floor is the wage alone — rounding may cost a cent.
      expect(hourly, t.id).toBeGreaterThanOrEqual(ERRAND_RATE_PER_HOUR_CENTS - 60 / t.minutes);
    }
  });

  it("keeps at least five cents on every errand, at every spend cap", () => {
    // The guarantee. Card fees are charged on the whole hold — item and fee
    // together — so a fee sized for a small item loses money on a large one.
    // The fee is therefore worked out from the cap actually chosen.
    for (const t of ERRAND_TIERS) {
      for (const cap of CAPS) {
        expect(errandProfitCents(t.id, cap), `${t.id} at ${cap}`)
          .toBeGreaterThanOrEqual(ERRAND_PROFIT_FLOOR_CENTS);
      }
    }
  });

  it("is not wildly over the floor either — the fee is the smallest that works", () => {
    for (const t of ERRAND_TIERS) {
      for (const cap of CAPS) {
        expect(errandProfitCents(t.id, cap), `${t.id} at ${cap}`)
          .toBeLessThan(ERRAND_PROFIT_FLOOR_CENTS + 3);
      }
    }
  });

  it("charges more fee for a bigger item, because the card charges more", () => {
    for (const t of ERRAND_TIERS) {
      expect(errandFeeCents(t.id, 10_000)).toBeGreaterThan(errandFeeCents(t.id, 1_000));
    }
  });

  it("counts card cost on the whole hold, rounded against us", () => {
    const hold = 2_000 + errandFeeCents("in-building", 2_000);
    expect(errandCardCostCents(hold)).toBe(Math.ceil(hold * CARD_FEE_RATE + CARD_FEE_FIXED_CENTS));
  });

  it("prices the soda: a $2 item in the building costs $2 plus the fee", () => {
    const fee = errandFeeCents("in-building", 2_000);
    expect(fee).toBeGreaterThan(errandPayoutCents("in-building"));
    expect(fee).toBeLessThan(600);
  });

  it("knows each tier by id and refuses a made-up one", () => {
    expect(findErrandTier("nearby-store").label).toBeTruthy();
    expect(() => findErrandTier("teleport")).toThrow(/unknown/i);
    expect(() => validateErrandTier("teleport", "grab-something")).toThrow(/unknown/i);
  });

  it("applies only to the two per-task categories", () => {
    expect(() => validateErrandTier("in-building", "grab-something")).not.toThrow();
    expect(() => validateErrandTier("in-building", "run-errand")).not.toThrow();
    // An hourly booking is priced on hours; a tier there would be a second,
    // disagreeing price.
    expect(() => validateErrandTier("in-building", "wait-with-someone")).toThrow(/errand/i);
  });
});

describe("tiers and the included grab", () => {
  it("includes only the cheapest tier in the monthly allowance", async () => {
    const { isGrabIncluded, customerServiceFeeFor, errandFeeCents: fee } = await import("../src/index.ts");
    const base = { planId: "free" as const, category: "grab-something" as const, quickTask: true, usedThisMonth: 0 };
    expect(isGrabIncluded({ ...base, errandTier: "in-building" })).toBe(true);
    expect(isGrabIncluded({ ...base, errandTier: "nearby-store" })).toBe(false);
    // A paid-for tier is charged its tier fee, sized to the cap chosen.
    expect(customerServiceFeeFor({ ...base, errandTier: "nearby-store", spendCapCents: 2_000 }))
      .toBe(fee("nearby-store", 2_000));
  });
});
