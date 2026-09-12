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
    // base 1500 + 5mi * 220 + 15min * 60 = 1500 + 1100 + 900 = 3500
    expect(driverEarningsCents("secure-transport", 5, 15)).toBe(3500);
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
