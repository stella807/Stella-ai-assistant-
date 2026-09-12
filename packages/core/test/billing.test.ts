import { describe, expect, it } from "vitest";
import {
  ALL_FEATURES, ELITE_ONLY, PLANS, annualSavingsPercent, findPlan, formatPrice, hasFeature,
  isPlanReleased, releasedPlans,
} from "../src/billing.ts";
import { resetFlags, setFlag } from "../src/features.ts";
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

  it("gives Premium Plus every feature except the Elite-only catalogue", () => {
    // `ALL_FEATURES` is exhaustive by construction — see its `satisfies
    // Record<Feature, true>` in billing.ts, which turns "someone added a
    // Feature and forgot to decide where it goes" into a compile error.
    expect(ALL_FEATURES.length).toBe(27);
    for (const feature of ALL_FEATURES) {
      expect(hasFeature("premium-plus", feature)).toBe(!ELITE_ONLY.includes(feature));
    }
  });

  it("keeps the luxury catalogue off every everyday tier", () => {
    for (const feature of ELITE_ONLY) {
      for (const plan of ["free", "premium-basic", "premium-plus", "family"] as const) {
        expect(hasFeature(plan, feature)).toBe(false);
      }
      expect(hasFeature("elite", feature)).toBe(true);
    }
  });

  it("gives Elite everything, the everyday features included", () => {
    for (const feature of ALL_FEATURES) {
      expect(hasFeature("elite", feature)).toBe(true);
    }
  });

  it("holds Elite back until its flag is on, and never hides a shipped plan", () => {
    expect(isPlanReleased("elite")).toBe(false);
    expect(releasedPlans().map((p) => p.id)).not.toContain("elite");
    // Every other tier has shipped and must always be listed.
    for (const plan of PLANS.filter((p) => p.id !== "elite")) {
      expect(isPlanReleased(plan.id)).toBe(true);
      expect(releasedPlans().map((p) => p.id)).toContain(plan.id);
    }

    setFlag("elite-tier", true);
    expect(isPlanReleased("elite")).toBe(true);
    expect(releasedPlans().map((p) => p.id)).toContain("elite");
    resetFlags();
    expect(isPlanReleased("elite")).toBe(false);
  });

  it("prices Elite under assembling the same thing from separate memberships", () => {
    // The binding competitor isn't Quintessentially at $12,000-$44,000/yr —
    // it's the partner's own $99/mo membership, which a member can just buy.
    // Family ($69.99) + a $99 partner membership is $169/mo; Elite has to
    // beat that or there's no reason to take it. See docs/billing.md.
    const PARTNER_OWN_MEMBERSHIP_CENTS = 9900;
    const elite = findPlan("elite");
    expect(elite.monthlyCents).toBeLessThan(findPlan("family").monthlyCents + PARTNER_OWN_MEMBERSHIP_CENTS);
    // Still a step up from Family, or the ladder makes no sense.
    expect(elite.monthlyCents).toBeGreaterThan(findPlan("family").monthlyCents);
    // And an order of magnitude under Quintessentially's floor.
    expect(elite.annualCents).toBeLessThan(1_200_000);
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
