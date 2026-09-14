import { describe, expect, it } from "vitest";
import {
  ALL_FEATURES, ELITE_LADDER, ELITE_ONLY, PLANS, annualSavingsPercent, findPlan, formatPrice,
  hasFeature, includedConciergeHours, isElitePlan, isPlanReleased, releasedPlans,
} from "../src/billing.ts";
import { disclosuresFor, doctorAvailableFor, findEliteService } from "../src/elite.ts";
import { resetFlags, setFlag } from "../src/features.ts";
import { buildRecoveryPlan } from "../src/recovery.ts";
import { estimateBac } from "../src/bac.ts";
import { logDrink } from "../src/drinks.ts";
import { CONCIERGE_CATEGORIES, serviceFeeFor } from "../src/concierge.ts";

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

  it("formats prices, grouped once they get long", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(1499)).toBe("$14.99");
    // The Elite ladder puts four- and six-figure prices through here.
    expect(formatPrice(499_999)).toBe("$4,999.99");
    expect(formatPrice(19_999_999)).toBe("$199,999.99");
    for (const plan of PLANS) expect(formatPrice(plan.annualCents)).not.toMatch(/\d{5}/);
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

  it("moves every Elite rung together on one flag, and never hides a shipped plan", () => {
    // One switch for the whole ladder, in both directions. Releasing or
    // pulling a rung at a time would mean a jet and a doctor on sale under
    // one price while the others wait, which is the same exposure in a
    // smaller font.
    for (const id of ELITE_LADDER) {
      expect(isPlanReleased(id), id).toBe(true);
      expect(releasedPlans().map((p) => p.id)).toContain(id);
    }
    for (const plan of PLANS.filter((p) => !ELITE_LADDER.includes(p.id))) {
      expect(isPlanReleased(plan.id)).toBe(true);
      expect(releasedPlans().map((p) => p.id)).toContain(plan.id);
    }

    setFlag("elite-tier", false);
    for (const id of ELITE_LADDER) {
      expect(isPlanReleased(id), id).toBe(false);
      expect(releasedPlans().map((p) => p.id)).not.toContain(id);
    }
    // Pulling the ladder must never take an everyday tier with it.
    for (const plan of PLANS.filter((p) => !ELITE_LADDER.includes(p.id))) {
      expect(isPlanReleased(plan.id), plan.id).toBe(true);
    }
    resetFlags();
    for (const id of ELITE_LADDER) expect(isPlanReleased(id), id).toBe(true);
  });

  it("prices every Elite rung on its hours rather than against a membership card", () => {
    // The old rationale here was that Elite had to undercut Family plus the
    // partner's own membership, because it was the same kind of thing: a
    // number to call. These rungs are not that — they are a retainer, and
    // they are priced on somebody's time. So the invariant that matters is
    // the one that keeps a rung solvent: the hours it gives away cost less
    // than the rung charges, with room left for the desk behind them.
    const hourFee = serviceFeeFor("book-and-buy", false, 1, 1);
    for (const id of ELITE_LADDER) {
      const plan = findPlan(id);
      expect(includedConciergeHours(id), id).toBeGreaterThan(0);
      expect(includedConciergeHours(id) * hourFee, id).toBeLessThan(plan.monthlyCents);
      // Still a step up from the household tier, or the ladder makes no sense.
      expect(plan.monthlyCents, id).toBeGreaterThan(findPlan("family").monthlyCents);
    }
    // And the band is the one that was asked for: $500 to $20,000 a month.
    expect(findPlan("elite").monthlyCents).toBe(50_000);
    expect(findPlan("elite-private").monthlyCents).toBe(2_000_000);
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

  it("lets a plan reach jet travel or a doctor only with the guardrails attached", () => {
    /**
     * This used to assert that no purchasable plan reached either one, which
     * was right while the ladder was held: the two carry legal duties of
     * their own — 14 CFR Part 295 broker disclosures for charter, and the
     * federal Anti-Kickback Statute for anything shaped like paying for a
     * patient referral — and shipping them by accident was the exposure.
     *
     * Elite is released now, so the absence is gone and the duties are what
     * is left to hold. They do not ride on the feature flag, and this is the
     * test that says so: whatever is purchasable, the disclosures exist, the
     * medical rate is zero, and the doctor is unavailable the moment the
     * assessment says call an ambulance.
     */
    const OFF_LIMITS = ["private-aviation", "concierge-doctor"] as const;
    for (const plan of releasedPlans()) {
      for (const feature of OFF_LIMITS) {
        if (!hasFeature(plan.id, feature)) continue;
        expect(isElitePlan(plan.id), `${plan.id} reaches ${feature}`).toBe(true);
      }
      // The concierge itself is on every paid tier — that is the thing the
      // doctor and the jets are kept distinct from, not hidden behind.
      if (plan.monthlyCents > 0) expect(hasFeature(plan.id, "personal-concierge")).toBe(true);
    }

    // The duties themselves, asserted here rather than left to elite.ts, so
    // that releasing a plan can never be the change that drops them.
    expect(findEliteService("concierge-doctor").commissionRate).toBe(0);
    expect(disclosuresFor("jet-travel").join(" ")).toMatch(/air carrier operating your flight is named/i);
    expect(disclosuresFor("concierge-doctor").join(" ")).toMatch(/not emergency care/i);
    expect(doctorAvailableFor("call-emergency")).toBe(false);
  });

  it("never puts the luxury desk on an everyday tier", () => {
    // The ladder is released; the desk is still Elite-only. A jet on the
    // $9.99 tier would not be a pricing mistake, it would be a different
    // product with different duties attached to it.
    for (const plan of releasedPlans().filter((p) => !isElitePlan(p.id))) {
      for (const feature of ELITE_ONLY) {
        expect(hasFeature(plan.id, feature), `${plan.id}/${feature}`).toBe(false);
      }
    }
  });

  it("offers no concierge category that is a jet or a doctor", () => {
    // The other door into the same mistake: the concierge categories are
    // what a subscriber actually picks from, and they are deliberately four
    // mundane errands. If a luxury category is ever added here it bypasses
    // the plan gate entirely.
    const categories = CONCIERGE_CATEGORIES.map((c) => `${c.id} ${c.label} ${c.description}`.toLowerCase());
    for (const text of categories) {
      expect(text).not.toMatch(/jet|charter|flight|aviation|doctor|physician|medical/);
    }
  });

  it("makes the entry tiers one person, and sells the second seat", () => {
    // Free and Premium are for somebody looking after themselves. This is
    // not only a published number: `peopleCountFor` clamps a concierge
    // task's household count to it, so a Premium subscriber books an
    // assistant for themselves rather than for a group.
    expect(findPlan("free").seats).toBe(1);
    expect(findPlan("premium-basic").seats).toBe(1);
    expect(findPlan("premium-plus").seats).toBe(2);
    expect(findPlan("family").seats).toBe(6);
  });

  it("never lets seats go down as the price goes up", () => {
    const paid = releasedPlans().filter((p) => p.monthlyCents > 0)
      .sort((a, b) => a.monthlyCents - b.monthlyCents);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i]!.seats, `${paid[i]!.id} vs ${paid[i - 1]!.id}`)
        .toBeGreaterThanOrEqual(paid[i - 1]!.seats);
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
