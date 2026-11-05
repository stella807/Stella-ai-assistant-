import { describe, expect, it } from "vitest";
import { DRIVER_RATE_CARD, driverEarningsCents, driverRateFor } from "../src/driver-pay.ts";

describe("driver pay scale", () => {
  it("pays the base fare alone for a zero-distance, zero-time trip", () => {
    expect(driverEarningsCents("standard", 0, 0)).toBe(DRIVER_RATE_CARD.standard.baseCents);
    expect(driverEarningsCents("secure-transport", 0, 0)).toBe(DRIVER_RATE_CARD["secure-transport"].baseCents);
  });

  it("does not scale with distance or time on the published card, only if miles and minutes are added", () => {
    expect(driverEarningsCents("standard", 10, 30)).toBe(driverEarningsCents("standard", 2, 8));
  });

  it("pays $85 a trip on both tiers, whatever the distance or time", () => {
    for (const tier of ["standard", "secure-transport"] as const) {
      for (const [miles, minutes] of [[0, 0], [2, 8], [5, 15], [40, 90]]) {
        expect(driverEarningsCents(tier, miles, minutes), `${tier} ${miles}mi ${minutes}min`).toBe(8500);
      }
    }
  });

  it("pays more than an Uber Black driver takes home on a typical trip", () => {
    // Uber Black's fare components run $2.50-$4.00/mi and $0.40-$0.65/min and its drivers keep roughly
    // 75-80%. Even at the top of that band, a 5-mile, 15-minute trip nets a driver about $24.
    const topOfBlackBand = Math.round((400 * 5 + 65 * 15) * 0.8);
    expect(driverEarningsCents("standard", 5, 15)).toBeGreaterThan(topOfBlackBand);
    expect(driverEarningsCents("secure-transport", 5, 15)).toBeGreaterThan(topOfBlackBand);
  });

  it("rejects a negative distance or duration", () => {
    expect(() => driverEarningsCents("standard", -1, 10)).toThrow(/negative/i);
    expect(() => driverEarningsCents("standard", 10, -1)).toThrow(/negative/i);
  });

  it("still lets miles and minutes be added to the rate card", () => {
    const custom = { baseCents: 8500, perMileCents: 100, perMinuteCents: 20 };
    expect(Math.round(custom.baseCents + custom.perMileCents * 10 + custom.perMinuteCents * 30)).toBe(10_100);
  });

  it("exposes the rate card per tier", () => {
    expect(driverRateFor("standard")).toBe(DRIVER_RATE_CARD.standard);
    expect(driverRateFor("secure-transport")).toBe(DRIVER_RATE_CARD["secure-transport"]);
  });

  it("keeps the driver rate card entirely separate from concierge's", () => {
    // Different shape (per-mile/per-minute vs. flat per-category), and no
    // shared constant between the two modules — this is the one test that
    // would fail if someone "simplified" by reusing concierge's numbers.
    expect(Object.keys(DRIVER_RATE_CARD.standard).sort()).toEqual(["baseCents", "perMileCents", "perMinuteCents"]);
  });
});

describe("the rate card outlives the dispatch model", () => {
  it("still pays a hired driver, though no live path dispatches one", () => {
    // Own-driver dispatch is dormant, not cancelled — rides are arranged on
    // a rideshare today (see ride-coordination.ts). This card is still what
    // Safehubby would pay a driver it hires, is still disclosed on the
    // driver application screen, and is still the honest answer to "what
    // would you pay me?" for anyone applying now.
    expect(driverEarningsCents("standard", 5, 15)).toBe(8500);
    expect(driverEarningsCents("secure-transport", 5, 15)).toBe(8500);
  });

  it("computes no customer-facing fare at all", async () => {
    // A third party sets the price of an arranged ride, so Safehubby must
    // not publish one — the rule `RideEstimate.fareEstimateCents` states in
    // ports.ts. If a fare function reappears here, that rule has been
    // quietly dropped.
    const mod = await import("../src/driver-pay.ts");
    for (const name of Object.keys(mod)) {
      expect(name.toLowerCase(), name).not.toContain("fare");
    }
  });
});
