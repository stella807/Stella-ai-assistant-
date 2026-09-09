import { describe, expect, it } from "vitest";
import { PLANS, annualSavingsPercent, findPlan, formatPrice, hasFeature } from "../src/billing.ts";
import { buildRecoveryPlan } from "../src/recovery.ts";
import { estimateBac } from "../src/bac.ts";
import { logDrink } from "../src/drinks.ts";

describe("plans", () => {
  it("never paywalls SOS or location sharing", () => {
    expect(hasFeature("free", "sos")).toBe(true);
    expect(hasFeature("free", "location-sharing")).toBe(true);
    expect(hasFeature("free", "check-ins")).toBe(true);
  });

  it("gates premium features", () => {
    expect(hasFeature("free", "ride-booking")).toBe(false);
    expect(hasFeature("premium-basic", "ride-booking")).toBe(false);
    expect(hasFeature("premium-plus", "ride-booking")).toBe(true);
  });

  it("is strictly cumulative as tiers rise", () => {
    for (const feature of findPlan("premium-basic").features) {
      expect(hasFeature("premium-plus", feature)).toBe(true);
    }
    for (const feature of findPlan("premium-plus").features) {
      expect(hasFeature("family", feature)).toBe(true);
    }
  });

  it("saves 10-20% on every paid annual plan", () => {
    for (const plan of PLANS.filter((p) => p.monthlyCents > 0)) {
      const pct = annualSavingsPercent(plan);
      expect(pct).toBeGreaterThanOrEqual(10);
      expect(pct).toBeLessThanOrEqual(20);
    }
  });

  it("formats prices", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(1099)).toBe("$10.99");
  });

  it("rejects an unknown plan", () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => findPlan("enterprise")).toThrow();
  });
});

describe("recovery plan", () => {
  const bac = estimateBac({
    body: { weightKg: 82, widmarkRatio: 0.68 },
    drinks: [logDrink({ id: "d1", drinkId: "beer-ipa", loggedAt: "2026-01-01T20:00:00Z" })],
    now: new Date("2026-01-01T20:30:00Z"),
  });

  it("tells the truth that only time lowers bac", () => {
    expect(buildRecoveryPlan("during", bac).soberEstimate).toMatch(/only time/i);
  });

  it("debunks the sober-up myths rather than selling them", () => {
    const myths = buildRecoveryPlan("during", bac).myths.join(" ").toLowerCase();
    expect(myths).toContain("coffee");
    expect(myths).toContain("cold shower");
  });

  it("never coaches hiding intoxication from anyone", () => {
    for (const phase of ["during", "next-morning"] as const) {
      const text = JSON.stringify(buildRecoveryPlan(phase, bac)).toLowerCase();
      expect(text).not.toMatch(/appear sober|seem sober|hide|conceal|act sober|look sober/);
    }
  });

  it("switches advice for the morning after", () => {
    expect(buildRecoveryPlan("next-morning", bac).tips.map((t) => t.id)).toContain("rehydrate");
  });
});
