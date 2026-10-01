import { describe, expect, it } from "vitest";
import {
  PRICE_CHANGE_NOTICE_DAYS, RenewalConsentError, SERVICE_LIVE_AT, TRIAL_DAYS,
  assertRenewalConsent, autoRenewalTermsFor, findPlan, priceChangeNoticeDueAt,
  requiresRenewalDisclosure, startSubscription, type RenewalConsent,
} from "../src/index.ts";

const BEFORE_LIVE = new Date("2026-10-15T00:00:00.000Z");
const AFTER_LIVE = new Date("2027-01-10T00:00:00.000Z");

const consentFor = (
  planId: "premium-basic" | "free", cadence: "monthly" | "annual", at: Date,
): RenewalConsent => {
  const terms = autoRenewalTermsFor(planId, cadence, at);
  return {
    planId: terms.planId as typeof planId,
    cadence: terms.cadence,
    priceCents: terms.priceCents,
    acceptedAt: at.toISOString(),
  };
};

describe("automatic-renewal terms", () => {
  it("quotes the price that actually recurs, for each cadence", () => {
    const plan = findPlan("premium-basic");
    expect(autoRenewalTermsFor("premium-basic", "monthly", AFTER_LIVE).priceCents)
      .toBe(plan.monthlyCents);
    expect(autoRenewalTermsFor("premium-basic", "annual", AFTER_LIVE).priceCents)
      .toBe(plan.annualCents);
  });

  it("never tells a pre-launch subscriber they will be charged before go-live", () => {
    // The disclosure has to be true. Somebody joining in the launch window is
    // not charged fourteen days later — the trial itself starts at go-live,
    // so the first charge is fourteen days after that.
    const terms = autoRenewalTermsFor("premium-basic", "monthly", BEFORE_LIVE);
    const live = Date.parse(SERVICE_LIVE_AT);
    expect(Date.parse(terms.firstChargeAt)).toBe(live + TRIAL_DAYS * 86_400_000);
    expect(Date.parse(terms.firstChargeAt)).toBeGreaterThan(live);
  });

  it("charges a post-launch subscriber a trial's length after they join", () => {
    const terms = autoRenewalTermsFor("premium-basic", "monthly", AFTER_LIVE);
    expect(Date.parse(terms.firstChargeAt))
      .toBe(AFTER_LIVE.getTime() + TRIAL_DAYS * 86_400_000);
  });

  it("has nothing to disclose about a plan that costs nothing", () => {
    const terms = autoRenewalTermsFor("free", "monthly", AFTER_LIVE);
    expect(terms.priceCents).toBe(0);
    expect(requiresRenewalDisclosure(terms)).toBe(false);
  });
});

describe("the consent gate", () => {
  it("refuses a paid subscription with no agreement at all", () => {
    expect(() => startSubscription({
      travelerId: "t1", planId: "premium-basic", cadence: "monthly",
      platform: "web", now: AFTER_LIVE,
    })).toThrow(RenewalConsentError);
  });

  it("lets a free plan through without one", () => {
    const { subscription } = startSubscription({
      travelerId: "t1", planId: "free", cadence: "monthly",
      platform: "web", now: AFTER_LIVE,
    });
    expect(subscription.planId).toBe("free");
    expect(subscription.renewalTermsAcceptedAt).toBeUndefined();
  });

  it("records when the terms were agreed to, on the subscription itself", () => {
    const consent = consentFor("premium-basic", "monthly", AFTER_LIVE);
    const { subscription } = startSubscription({
      travelerId: "t1", planId: "premium-basic", cadence: "monthly",
      platform: "web", now: AFTER_LIVE, renewalConsent: consent,
    });
    expect(subscription.renewalTermsAcceptedAt).toBe(AFTER_LIVE.toISOString());
  });

  it("refuses an agreement given for a different plan", () => {
    // Consent is not a checkbox that means "yes to anything". It names what
    // was agreed to, so it cannot be carried over to a costlier plan.
    const consent = consentFor("premium-basic", "monthly", AFTER_LIVE);
    expect(() => startSubscription({
      travelerId: "t1", planId: "premium-plus", cadence: "monthly",
      platform: "web", now: AFTER_LIVE, renewalConsent: consent,
    })).toThrow(/different plan/i);
  });

  it("refuses an agreement given for a different cadence", () => {
    const consent = consentFor("premium-basic", "monthly", AFTER_LIVE);
    expect(() => startSubscription({
      travelerId: "t1", planId: "premium-basic", cadence: "annual",
      platform: "web", now: AFTER_LIVE, renewalConsent: consent,
    })).toThrow(/different plan/i);
  });

  it("refuses an agreement whose price no longer matches the offer", () => {
    // The screen said one number and the charge would be another. Starting
    // anyway is exactly the practice the law exists to stop.
    const stale = { ...consentFor("premium-basic", "monthly", AFTER_LIVE), priceCents: 100 };
    expect(() => startSubscription({
      travelerId: "t1", planId: "premium-basic", cadence: "monthly",
      platform: "web", now: AFTER_LIVE, renewalConsent: stale,
    })).toThrow(/price changed/i);
  });

  it("accepts a matching agreement on every paid cadence", () => {
    for (const cadence of ["monthly", "annual"] as const) {
      const consent = consentFor("premium-basic", cadence, AFTER_LIVE);
      expect(() => startSubscription({
        travelerId: "t1", planId: "premium-basic", cadence,
        platform: "web", now: AFTER_LIVE, renewalConsent: consent,
      }), cadence).not.toThrow();
    }
  });

  it("checks terms directly too, for callers that are not starting a plan", () => {
    const terms = autoRenewalTermsFor("premium-basic", "monthly", AFTER_LIVE);
    expect(() => assertRenewalConsent(terms, undefined)).toThrow(RenewalConsentError);
    expect(() => assertRenewalConsent(
      autoRenewalTermsFor("free", "monthly", AFTER_LIVE), undefined,
    )).not.toThrow();
  });
});

describe("price-change notice", () => {
  it("falls due a clear month before the new price is charged", () => {
    const effective = new Date("2027-06-01T00:00:00.000Z");
    const due = priceChangeNoticeDueAt(effective);
    expect(effective.getTime() - due.getTime())
      .toBe(PRICE_CHANGE_NOTICE_DAYS * 86_400_000);
    expect(due.getTime()).toBeLessThan(effective.getTime());
  });
});
