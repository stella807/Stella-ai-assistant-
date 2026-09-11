import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, findPlan } from "../src/billing.ts";
import {
  cancelSubscription, changePlan, describeSubscription, effectivePlan, isRenewalDue,
  markPastDue, periodEnd, priceOf, prorationCreditCents, renew, startSubscription,
  unusedFraction,
} from "../src/subscription.ts";
import type { Subscription } from "../src/subscription.ts";

const now = new Date("2026-03-01T00:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

const start = (planId: Parameters<typeof findPlan>[0], platform: "web" | "ios" | "android" = "web") =>
  startSubscription({ travelerId: "t1", planId, cadence: "monthly", platform, now });

describe("starting a subscription", () => {
  it("puts a paid plan into a trial and charges nothing today", () => {
    const { subscription, due } = start("premium-plus");
    expect(subscription.status).toBe("trialing");
    expect(due).toBeNull();
    expect(subscription.trialEndsAt).toBe(days(TRIAL_DAYS).toISOString());
  });

  it("takes the rail from the platform the purchase happened on", () => {
    expect(start("premium-plus", "ios").subscription.rail).toBe("app-store");
    expect(start("premium-plus", "android").subscription.rail).toBe("play-store");
    expect(start("premium-plus", "web").subscription.rail).toBe("card");
  });

  it("makes the free plan active with no trial and nothing owed", () => {
    const { subscription, due } = start("free");
    expect(subscription.status).toBe("active");
    expect(subscription.trialEndsAt).toBeUndefined();
    expect(due).toBeNull();
  });
});

describe("periods", () => {
  it("advances a month or a year", () => {
    expect(periodEnd("monthly", now).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(periodEnd("annual", now).toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });

  it("prices each cadence off the plan", () => {
    const plan = findPlan("premium-plus");
    expect(priceOf(plan, "monthly")).toBe(plan.monthlyCents);
    expect(priceOf(plan, "annual")).toBe(plan.annualCents);
  });
});

const active = (planId: Parameters<typeof findPlan>[0], at: Date = now): Subscription => ({
  travelerId: "t1", planId, cadence: "monthly", rail: "card", status: "active",
  startedAt: at.toISOString(), currentPeriodEnd: periodEnd("monthly", at).toISOString(),
});

describe("proration", () => {
  it("credits the part of the period that was paid for and not used", () => {
    const sub = active("premium-basic");
    // Half a 31-day month in.
    const mid = new Date(now.getTime() + 15.5 * 86_400_000);
    expect(unusedFraction(sub, mid)).toBeCloseTo(0.5, 2);
    expect(prorationCreditCents(sub, mid)).toBeCloseTo(findPlan("premium-basic").monthlyCents / 2, -1);
  });

  it("credits nothing on a trial, because nothing was paid", () => {
    const { subscription } = start("premium-basic");
    expect(prorationCreditCents(subscription, days(7))).toBe(0);
  });

  it("never credits past the end of the period", () => {
    expect(unusedFraction(active("premium-basic"), days(90))).toBe(0);
    expect(unusedFraction(active("premium-basic"), days(-90))).toBe(1);
  });
});

describe("changing plans", () => {
  it("bills the difference, not the full price again, when upgrading mid-period", () => {
    const mid = new Date(now.getTime() + 15.5 * 86_400_000);
    const { subscription, due } = changePlan({
      subscription: active("premium-basic"), planId: "premium-plus", cadence: "monthly", platform: "web", now: mid,
    });
    const full = findPlan("premium-plus").monthlyCents;
    expect(subscription.planId).toBe("premium-plus");
    expect(due!.cents).toBeLessThan(full);
    expect(due!.cents).toBeGreaterThan(0);
    expect(due!.description).toMatch(/credit applied/);
  });

  it("never produces a bill for a downgrade", () => {
    const { due } = changePlan({
      subscription: active("family"), planId: "premium-basic", cadence: "monthly", platform: "web", now,
    });
    expect(due).toBeNull();
  });

  it("swaps the plan inside a trial without charging or shortening the trial", () => {
    const { subscription } = start("premium-basic");
    const changed = changePlan({ subscription, planId: "family", cadence: "monthly", platform: "web", now: days(3) });
    expect(changed.subscription.status).toBe("trialing");
    expect(changed.subscription.trialEndsAt).toBe(subscription.trialEndsAt);
    expect(changed.due).toBeNull();
  });

  it("dropping to free owes nothing and clears the trial", () => {
    const { subscription, due } = changePlan({
      subscription: active("family"), planId: "free", cadence: "monthly", platform: "web", now,
    });
    expect(subscription.planId).toBe("free");
    expect(subscription.status).toBe("active");
    expect(due).toBeNull();
  });

  it("re-stamps the rail when the purchase happens on a different platform", () => {
    const { subscription } = changePlan({
      subscription: active("premium-basic"), planId: "family", cadence: "monthly", platform: "ios", now,
    });
    expect(subscription.rail).toBe("app-store");
  });

  it("un-cancels a subscription that was on its way out", () => {
    const canceled = cancelSubscription(active("premium-basic"), now);
    const { subscription } = changePlan({ subscription: canceled, planId: "family", cadence: "monthly", platform: "web", now });
    expect(subscription.status).toBe("active");
    expect(subscription.canceledAt).toBeUndefined();
  });
});

describe("renewal", () => {
  it("charges the full plan price and moves the period", () => {
    const sub = active("premium-plus");
    const { subscription, due } = renew(sub, days(31));
    expect(due!.cents).toBe(findPlan("premium-plus").monthlyCents);
    expect(subscription.status).toBe("active");
    expect(new Date(subscription.currentPeriodEnd) > new Date(sub.currentPeriodEnd)).toBe(true);
  });

  it("ends the trial rather than extending it", () => {
    const { subscription } = start("premium-basic");
    expect(renew(subscription, days(TRIAL_DAYS)).subscription.trialEndsAt).toBeUndefined();
  });

  it("comes due when the period runs out, and never for a canceled plan", () => {
    const sub = active("premium-basic");
    expect(isRenewalDue(sub, days(10))).toBe(false);
    expect(isRenewalDue(sub, days(40))).toBe(true);
    expect(isRenewalDue(cancelSubscription(sub, now), days(40))).toBe(false);
  });
});

describe("cancelling and entitlement", () => {
  it("keeps paid features until the end of the period already paid for", () => {
    const canceled = cancelSubscription(active("family"), now);
    expect(effectivePlan(canceled, days(10))).toBe("family");
    expect(effectivePlan(canceled, days(40))).toBe("free");
  });

  it("does not cut off a past-due account mid-night", () => {
    expect(effectivePlan(markPastDue(active("premium-plus")), days(40))).toBe("premium-plus");
  });

  it("treats no subscription at all as free", () => {
    expect(effectivePlan(null, now)).toBe("free");
  });

  it("is idempotent", () => {
    const once = cancelSubscription(active("family"), now);
    expect(cancelSubscription(once, days(1))).toEqual(once);
  });
});

describe("describeSubscription", () => {
  it("says when the first charge lands during a trial", () => {
    expect(describeSubscription(start("premium-plus").subscription, now)).toMatch(/Free trial/);
  });

  it("says the plan stays on after cancelling, then that it is gone", () => {
    const canceled = cancelSubscription(active("family"), now);
    expect(describeSubscription(canceled, days(1))).toMatch(/stays on until/);
    expect(describeSubscription(canceled, days(40))).toMatch(/back on the free plan/);
  });

  it("does not threaten to switch features off the moment a card fails", () => {
    expect(describeSubscription(markPastDue(active("premium-plus")), now)).toMatch(/still on/);
  });

  it("reassures on free rather than upselling", () => {
    expect(describeSubscription(start("free").subscription, now)).toMatch(/never cost anything/);
  });
});
