import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetFlags, setFlag } from "../src/features.ts";

// These exercise the Free plan's errands, which are paused by default — see
// `free-errands`. The capability is kept and tested; it is switched on here.
beforeEach(() => setFlag("free-errands", true));
afterEach(() => resetFlags());
import {
  INCLUDED_GRABS_PER_MONTH, INCLUDED_GRAB_CATEGORY, assistantPayoutFor, customerServiceFeeFor,
  customerTotalCents, findPlan, includedGrabAllowanceFor, includedGrabsUsedIn, isGrabIncluded,
  errandCreditCover, errandCreditFor, errandCreditUsedIn, errandFeeCents,
  monthBoundsFor, releasedPlans, netAfterProcessorFeeCents, remainingIncludedGrabs, serviceFeeFor, hourlyServiceFee, includedHoursUsedIn,
  type ConciergeCategory, type ConciergeTask, type PlanId,
} from "../src/index.ts";

const remaining = (planId: PlanId, used: number) =>
  remainingIncludedGrabs(includedGrabAllowanceFor(planId), used);

const grab = (
  planId: PlanId, usedThisMonth: number,
  over: { category?: ConciergeCategory; quickTask?: boolean } = {},
): { planId: PlanId; category: ConciergeCategory; quickTask: boolean; usedThisMonth: number } => ({
  planId, category: INCLUDED_GRAB_CATEGORY, quickTask: true, usedThisMonth, ...over,
});

describe("grabs a plan includes", () => {
  it("brings the free plan's first grabs of the month for nothing but the item", () => {
    // The person this was built for: a juice to a hospital room. A five-dollar
    // fee on a three-dollar juice made the cheapest help we sell cost more
    // than the thing itself.
    const allowance = INCLUDED_GRABS_PER_MONTH.free!;
    expect(allowance).toBeGreaterThan(0);
    for (let used = 0; used < allowance; used++) {
      expect(customerServiceFeeFor(grab("free", used)), `grab ${used + 1}`).toBe(0);
    }
  });

  it("charges the ordinary fee once the month's allowance is used", () => {
    const allowance = INCLUDED_GRABS_PER_MONTH.free!;
    expect(customerServiceFeeFor(grab("free", allowance)))
      .toBe(serviceFeeFor(INCLUDED_GRAB_CATEGORY, true, 1));
    expect(remaining("free", allowance)).toBe(0);
    expect(remaining("free", allowance + 5)).toBe(0);
  });

  it("holds only the spend cap on an included grab", () => {
    expect(customerTotalCents({ ...grab("free", 0), spendCapCents: 300 })).toBe(300);
  });

  it("never touches what the runner is paid", () => {
    /**
     * Waiving the fee moves who pays the assistant — Safehubby, instead of
     * the customer — and never what they earn. If this ever fails, a free
     * juice run has quietly become a cheaper one for the person running it.
     */
    const payout = assistantPayoutFor(INCLUDED_GRAB_CATEGORY, true, 1);
    expect(payout).toBeGreaterThan(0);
    expect(customerServiceFeeFor(grab("free", 0))).toBe(0);
    expect(assistantPayoutFor(INCLUDED_GRAB_CATEGORY, true, 1)).toBe(payout);
  });

  it("covers only the one-thing pickup", () => {
    // An errand is a list and a longer trip, and keeps its rate.
    expect(isGrabIncluded(grab("free", 0, { category: "run-errand" }))).toBe(false);
    expect(customerServiceFeeFor(grab("free", 0, { category: "run-errand" })))
      .toBe(serviceFeeFor("run-errand", true, 1));
    // So does the standard-rate grab a paid subscriber chooses on purpose —
    // the longer, open-ended version, not the quick one the allowance is for.
    expect(isGrabIncluded(grab("premium-basic", 0, { quickTask: false }))).toBe(false);
  });

  it("gives every paid plan more than free, and the top rungs no limit", () => {
    const free = INCLUDED_GRABS_PER_MONTH.free!;
    for (const plan of releasedPlans()) {
      const n = INCLUDED_GRABS_PER_MONTH[plan.id];
      if (plan.id === "free") continue;
      // Basic's errands come from its $35 credit instead, which covers more than a grab.
      if (plan.id === "basic") { expect(errandCreditFor("basic")).toBeGreaterThan(free * 1_000); continue; }
      if (n !== null) expect(n, plan.id).toBeGreaterThanOrEqual(free + 1);
    }
    for (const id of ["elite", "elite-signature", "elite-private"] as const) {
      expect(INCLUDED_GRABS_PER_MONTH[id], id).toBeNull();
      expect(remaining(id, 10_000)).toBeNull();
      expect(customerServiceFeeFor(grab(id, 10_000))).toBe(0);
    }
  });

  it("never gives away more in a month than a paid plan takes in", () => {
    // Every included grab is the runner's pay with nothing coming in. On a
    // paid plan that has to fit inside the dues after the card fee, or the
    // allowance is a plan that loses money on its heaviest users. Basic sits
    // closest to that line on purpose: it gives an elderly member as many
    // errands as $39 carries.
    const payout = assistantPayoutFor(INCLUDED_GRAB_CATEGORY, true, 1);
    for (const plan of releasedPlans()) {
      const n = INCLUDED_GRABS_PER_MONTH[plan.id];
      if (n === null || plan.monthlyCents === 0) continue;
      expect(n * payout, plan.id).toBeLessThan(netAfterProcessorFeeCents(plan.monthlyCents));
    }
  });

  it("caps what a free account can cost in a month at a known, small number", () => {
    // Free has no dues to absorb it, so the ceiling is the whole point. This
    // is the most a free account can cost Safehubby in runner pay, ever.
    const payout = assistantPayoutFor(INCLUDED_GRAB_CATEGORY, true, 1);
    expect(INCLUDED_GRABS_PER_MONTH.free! * payout).toBeLessThanOrEqual(1_000);
    expect(findPlan("free").monthlyCents).toBe(0);
  });
});

describe("counting the month", () => {
  // Typed, not cast: a cast let a misspelled status through once, and the
  // test passed against a module that had made the same mistake.
  const task = (over: Partial<ConciergeTask>): ConciergeTask => {
    const base: ConciergeTask = {
      id: "t", travelerId: "u", category: INCLUDED_GRAB_CATEGORY, note: "juice",
      location: { lat: 0, lng: 0 }, spendCapCents: 300, serviceFeeCents: 0, assistantPayoutCents: 400,
      peopleCount: 1, status: "completed", provider: "safehubby", feeIncluded: true,
      chargeId: "c", holdId: "h", createdAt: "2027-01-10T12:00:00.000Z",
    };
    return { ...base, ...over };
  };
  const { start, end } = monthBoundsFor(new Date("2027-01-15T00:00:00.000Z"));

  it("counts the month's included grabs, the same calendar month desk tasks use", () => {
    expect(includedGrabsUsedIn([task({}), task({ status: "in-progress" })], start, end)).toBe(2);
    // Last month's do not carry over.
    expect(includedGrabsUsedIn([task({ createdAt: "2026-12-31T23:59:00.000Z" })], start, end)).toBe(0);
  });

  it("gives a cancelled grab back, and ignores grabs that paid their fee", () => {
    expect(includedGrabsUsedIn([task({ status: "canceled" })], start, end)).toBe(0);
    expect(includedGrabsUsedIn([task({ feeIncluded: false, serviceFeeCents: 500 })], start, end)).toBe(0);
  });
});

describe("while Free's errands are paused", () => {
  it("includes no grabs on Free, and still includes them on a paid plan", () => {
    setFlag("free-errands", false);
    expect(includedGrabAllowanceFor("free")).toBe(0);
    expect(isGrabIncluded(grab("free", 0))).toBe(false);
    expect(isGrabIncluded(grab("premium-basic", 0))).toBe(true);
    // The table keeps the number, so switching the flag back on restores it.
    expect(INCLUDED_GRABS_PER_MONTH.free).toBe(1);
    setFlag("free-errands", true);
    expect(includedGrabAllowanceFor("free")).toBe(1);
  });
});

describe("included assistant hours", () => {
  const base = { category: "wait-with-someone" as const, includedHoursUsedThisMonth: 0 };

  it("covers hours up to the plan's monthly allowance, and bills only the rest", () => {
    const full = serviceFeeFor("wait-with-someone", false, 1, 3);
    const premium = hourlyServiceFee({ ...base, planId: "premium-basic", hours: 3 });
    expect(premium.includedHoursUsed).toBe(2);
    expect(premium.serviceFeeCents).toBe(Math.round(full / 3));
    const elite = hourlyServiceFee({ ...base, planId: "elite", hours: 3 });
    expect(elite).toEqual({ serviceFeeCents: 0, includedHoursUsed: 3 });
  });

  it("stops covering once the month's hours are used", () => {
    const r = hourlyServiceFee({ ...base, planId: "premium-plus", hours: 2, includedHoursUsedThisMonth: 4 });
    expect(r).toEqual({ serviceFeeCents: serviceFeeFor("wait-with-someone", false, 1, 2), includedHoursUsed: 0 });
  });

  it("includes nothing on Free and leaves per-task categories alone", () => {
    expect(hourlyServiceFee({ ...base, planId: "free", hours: 2 }).includedHoursUsed).toBe(0);
    const grab = hourlyServiceFee({ ...base, planId: "elite", category: "grab-something" });
    expect(grab.includedHoursUsed).toBe(0);
  });

  it("counts only this month's, non-canceled hours", () => {
    const at = (iso: string, used: number, status: "completed" | "canceled" = "completed") =>
      ({ createdAt: iso, includedHoursUsed: used, status }) as never;
    const start = new Date("2026-10-01T00:00:00Z"); const end = new Date("2026-11-01T00:00:00Z");
    expect(includedHoursUsedIn([at("2026-10-03T00:00:00Z", 2), at("2026-10-05T00:00:00Z", 1, "canceled"), at("2026-09-30T00:00:00Z", 4)], start, end)).toBe(2);
  });
});

describe("errand credit", () => {
  const base = { planId: "basic" as const, category: "grab-something" as const, creditUsedThisMonth: 0 };

  it("covers any errand tier up to $35 a month, then bills the rest", () => {
    const grocery = errandFeeCents("shopping-trip", 5_000);
    expect(errandCreditCover({ ...base, errandTier: "shopping-trip", feeCents: grocery })).toBe(Math.min(grocery, 3_500));
    expect(errandCreditCover({ ...base, errandTier: "wait-in-line", feeCents: 2_600, creditUsedThisMonth: 3_000 })).toBe(500);
    expect(errandCreditCover({ ...base, errandTier: "in-building", feeCents: 1_100, creditUsedThisMonth: 3_500 })).toBe(0);
  });

  it("is only on Basic, and only for errands", () => {
    expect(errandCreditCover({ ...base, planId: "premium-basic", errandTier: "in-building", feeCents: 1_100 })).toBe(0);
    expect(errandCreditCover({ ...base, category: "wait-with-someone", errandTier: "in-building", feeCents: 1_100 })).toBe(0);
    expect(errandCreditCover({ ...base, feeCents: 1_100 })).toBe(0);
  });

  it("never costs more than Basic brings in after the card fee", () => {
    expect(errandCreditFor("basic")).toBeLessThan(netAfterProcessorFeeCents(findPlan("basic").monthlyCents));
  });

  it("takes the credit off the customer's fee", () => {
    const fee = errandFeeCents("wait-in-line", 4_000);
    const charged = customerServiceFeeFor({ ...base, category: "run-errand", errandTier: "wait-in-line", spendCapCents: 4_000, usedThisMonth: 0, creditUsedThisMonth: 3_000 });
    expect(charged).toBe(fee - 500);
  });

  it("counts only this month's, non-canceled credit", () => {
    const at = (iso: string, c: number, status: "completed" | "canceled" = "completed") =>
      ({ createdAt: iso, errandCreditCents: c, status }) as never;
    const start = new Date("2026-10-01T00:00:00Z"); const end = new Date("2026-11-01T00:00:00Z");
    expect(errandCreditUsedIn([at("2026-10-03T00:00:00Z", 2_000), at("2026-10-05T00:00:00Z", 900, "canceled"), at("2026-09-30T00:00:00Z", 1_000)], start, end)).toBe(2_000);
  });
});
