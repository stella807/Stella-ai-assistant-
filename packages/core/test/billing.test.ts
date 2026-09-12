import { describe, expect, it } from "vitest";
import { ALL_FEATURES, PLANS, annualSavingsPercent, findPlan, formatPrice, hasFeature } from "../src/billing.ts";
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
    expect(formatPrice(1499)).toBe("$14.99");
  });

  it("gates automatic fulfilment above the entry tier", () => {
    // Booking on someone's behalf means fronting the money, which is what the
    // higher tiers actually pay for.
    expect(hasFeature("premium-basic", "automatic-rides")).toBe(false);
    expect(hasFeature("premium-plus", "automatic-rides")).toBe(true);
    expect(hasFeature("premium-plus", "automatic-delivery")).toBe(true);
  });

  it("keeps secure transport off the free tier, but on every paid one", () => {
    expect(hasFeature("free", "secure-transport")).toBe(false);
    expect(hasFeature("premium-basic", "secure-transport")).toBe(false);
    expect(hasFeature("premium-plus", "secure-transport")).toBe(true);
    expect(hasFeature("family", "secure-transport")).toBe(true);
  });

  it("gives Premium Plus every feature there is", () => {
    // `ALL_FEATURES` is exhaustive by construction — see its `satisfies
    // Record<Feature, true>` in billing.ts, which turns "someone added a
    // Feature and forgot about the top tiers" into a compile error.
    expect(ALL_FEATURES.length).toBe(20);
    for (const feature of ALL_FEATURES) {
      expect(hasFeature("premium-plus", feature)).toBe(true);
    }
  });

  it("makes Family the same features as Premium Plus, differing only in seats", () => {
    // Family is the household tier, not a longer feature list. If these ever
    // diverge again, the blurbs and docs/billing.md are wrong too.
    expect([...findPlan("family").features].sort()).toEqual([...findPlan("premium-plus").features].sort());
    expect(findPlan("family").seats).toBeGreaterThan(findPlan("premium-plus").seats);
  });

  it("puts personal concierge on every paid tier, never the free one", () => {
    expect(hasFeature("free", "personal-concierge")).toBe(false);
    expect(hasFeature("premium-basic", "personal-concierge")).toBe(true);
    expect(hasFeature("premium-plus", "personal-concierge")).toBe(true);
    expect(hasFeature("family", "personal-concierge")).toBe(true);
  });

  it("gives every paid tier the same concierge, not a cheaper version for the entry plan", () => {
    // No lighter spend cap or narrower category list for Premium — the cap
    // protects the subscriber and the card issuer, not a pricing tier.
    for (const feature of ["personal-concierge"] as const) {
      expect(hasFeature("premium-basic", feature)).toBe(hasFeature("family", feature));
    }
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
