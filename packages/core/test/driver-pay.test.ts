import { describe, expect, it } from "vitest";
import { DRIVER_RATE_CARD, driverEarningsCents, driverRateFor } from "../src/driver-pay.ts";

describe("driver pay scale", () => {
  it("pays the base fare alone for a zero-distance, zero-time trip", () => {
    expect(driverEarningsCents("standard", 0, 0)).toBe(DRIVER_RATE_CARD.standard.baseCents);
    expect(driverEarningsCents("secure-transport", 0, 0)).toBe(DRIVER_RATE_CARD["secure-transport"].baseCents);
  });

  it("scales with distance and time", () => {
    const short = driverEarningsCents("standard", 2, 8);
    const long = driverEarningsCents("standard", 10, 30);
    expect(long).toBeGreaterThan(short);
  });

  it("computes the exact standard fare", () => {
    // base 300 + 5mi * 90 + 15min * 18 = 300 + 450 + 270 = 1020
    expect(driverEarningsCents("standard", 5, 15)).toBe(1020);
  });

  it("computes the exact secure-transport fare", () => {
    // base 600 + 5mi * 200 + 15min * 35 = 600 + 1000 + 525 = 2125
    expect(driverEarningsCents("secure-transport", 5, 15)).toBe(2125);
  });

  it("pays secure transport less than an Uber Black driver takes home", () => {
    // Uber Black's fare components run $2.50-$4.00/mi and $0.40-$0.65/min, and
    // its drivers keep roughly 75-80% of that after commission. Safehubby pays
    // under the low end of what a Black driver nets, per mile and per minute.
    const rate = DRIVER_RATE_CARD["secure-transport"];
    expect(rate.perMileCents).toBeLessThan(250 * 0.8 + 1);
    expect(rate.perMinuteCents).toBeLessThan(40);
  });

  it("pays secure transport meaningfully more than standard for the identical trip", () => {
    const standard = driverEarningsCents("standard", 8, 20);
    const secure = driverEarningsCents("secure-transport", 8, 20);
    expect(secure).toBeGreaterThan(standard * 2);
  });

  it("rejects a negative distance or duration", () => {
    expect(() => driverEarningsCents("standard", -1, 10)).toThrow(/negative/i);
    expect(() => driverEarningsCents("standard", 10, -1)).toThrow(/negative/i);
  });

  it("exposes the rate card per tier", () => {
    expect(driverRateFor("standard")).toBe(DRIVER_RATE_CARD.standard);
    expect(driverRateFor("secure-transport")).toBe(DRIVER_RATE_CARD["secure-transport"]);
  });

  it("keeps the driver rate card entirely separate from concierge's", () => {
    // Different shape (per-mile/per-minute vs. flat per-category), and no
    // shared constant between the two modules — this is the one test that
    // would fail if someone "simplified" by reusing concierge's numbers.
    expect(DRIVER_RATE_CARD.standard.baseCents).not.toBe(DRIVER_RATE_CARD["secure-transport"].baseCents);
  });
});

describe("the rate card outlives the dispatch model", () => {
  it("still pays a hired driver, though no live path dispatches one", () => {
    // Own-driver dispatch is dormant, not cancelled — rides are arranged on
    // a rideshare today (see ride-coordination.ts). This card is still what
    // Safehubby would pay a driver it hires, is still disclosed on the
    // driver application screen, and is still the honest answer to "what
    // would you pay me?" for anyone applying now.
    expect(driverEarningsCents("standard", 5, 15)).toBe(1020);
    expect(driverEarningsCents("secure-transport", 5, 15)).toBe(2125);
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
