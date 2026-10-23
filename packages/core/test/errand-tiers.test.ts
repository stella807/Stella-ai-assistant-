import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetFlags, setFlag } from "../src/features.ts";

// These exercise the Free plan's errands, which are paused by default — see
// `free-errands`. The capability is kept and tested; it is switched on here.
beforeEach(() => setFlag("free-errands", true));
afterEach(() => resetFlags());
import {
  CARD_FEE_FIXED_CENTS, CARD_FEE_RATE, ERRAND_PROFIT_FLOOR_CENTS, ERRAND_RATE_PER_HOUR_CENTS,
  ERRAND_TIERS, errandCardCostCents, errandFeeCents, errandPayoutCents, errandProfitCents,
  findErrandTier, validateErrandTier,
} from "../src/index.ts";

const CAPS = [500, 1_000, 2_000, 4_000, 8_000, 10_000, 25_000, 100_000];

describe("errand tiers", () => {
  it("pays $24 an hour for the minutes, plus the mileage, and never under $10", () => {
    expect(ERRAND_RATE_PER_HOUR_CENTS).toBe(2_400);
    // 15 minutes at $24/hr is $6.00 — under the minimum, so $10.00.
    expect(errandPayoutCents("in-building")).toBe(1_000);
    // 35 min = $14.00 + 4 mi x $0.70 = $2.80
    expect(errandPayoutCents("nearby-store")).toBe(1_680);
    // 60 min = $24.00 + 10 mi = $7.00
    expect(errandPayoutCents("shopping-trip")).toBe(3_100);
    // 50 min = $20.00 + 6 mi = $4.20
    expect(errandPayoutCents("wait-in-line")).toBe(2_420);
  });

  it("climbs with the work: more time and miles never pays less", () => {
    const pay = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
    expect(Math.min(...pay)).toBe(pay[0]);
    for (const t of ERRAND_TIERS) expect(errandPayoutCents(t.id), t.id).toBeGreaterThanOrEqual(1_000);
  });

  it("never pays the runner less than $24 an hour for the time the tier assumes", () => {
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
    // The runner's $10 minimum, plus card costs and five cents.
    expect(fee).toBeLessThan(1_300);
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

describe("suggested caps", () => {
  it("start small for small errands and grow with the work", async () => {
    const { ERRAND_TIERS } = await import("../src/errand-tiers.ts");
    const caps = ERRAND_TIERS.map((t) => t.suggestedCapCents);
    expect(Math.min(...caps)).toBeGreaterThanOrEqual(500);
    expect(ERRAND_TIERS[0]!.suggestedCapCents).toBeLessThan(ERRAND_TIERS[2]!.suggestedCapCents);
  });
});
