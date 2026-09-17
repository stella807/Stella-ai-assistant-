import { describe, expect, it } from "vitest";
import {
  LAUNCH_DISCOUNT_RATE, LAUNCH_DISCOUNT_YEARS, LAUNCH_WINDOW_END, LAUNCH_WINDOW_START,
  REFERRAL_CODE_LENGTH, discountBreakEvenLift, discountedPriceCents, isReferralCodeShaped,
  joinedDuringLaunch, launchDiscountApplies, launchDiscountCentsFor, launchDiscountEndsAt,
  newReferralCode, normalizeReferralCode, shareMessage,
  SERVICE_LIVE_AT, billingStartsAt, launchOfferFor, serviceIsLive,
} from "../src/promotions.ts";
import { findPlan } from "../src/billing.ts";

const inWindow = "2026-10-15T00:00:00.000Z";
const sub = (startedAt: string) => ({ startedAt });

describe("the break-even arithmetic the discount rests on", () => {
  it("needs a lift only slightly larger than the discount itself", () => {
    // (1 + L)(1 - d) = 1  =>  L = d / (1 - d)
    expect(discountBreakEvenLift(0.03)).toBeCloseTo(0.0309, 4);
    expect(discountBreakEvenLift(0.1)).toBeCloseTo(0.1111, 4);
    expect(discountBreakEvenLift(0.5)).toBeCloseTo(1, 10);
  });

  it("actually breaks even at that lift, checked against revenue rather than asserted", () => {
    const price = 1799;
    const base = 1000;
    for (const rate of [0.03, 0.1, 0.25]) {
      const lift = discountBreakEvenLift(rate);
      const before = base * price;
      const after = base * (1 + lift) * price * (1 - rate);
      expect(after).toBeCloseTo(before, 6);
    }
  });

  it("refuses a rate that isn't a discount", () => {
    expect(() => discountBreakEvenLift(0)).toThrow(/between 0 and 1/i);
    expect(() => discountBreakEvenLift(1)).toThrow(/between 0 and 1/i);
    expect(() => discountBreakEvenLift(-0.1)).toThrow(/between 0 and 1/i);
  });
});

describe("who counts as an early sign-up", () => {
  it("is anyone who joined inside the launch window", () => {
    expect(joinedDuringLaunch(inWindow)).toBe(true);
    expect(joinedDuringLaunch(LAUNCH_WINDOW_START)).toBe(true);
  });

  it("excludes the instant the window closes, and anything before it opens", () => {
    expect(joinedDuringLaunch(LAUNCH_WINDOW_END)).toBe(false);
    expect(joinedDuringLaunch("2026-09-30T23:59:59.000Z")).toBe(false);
    expect(joinedDuringLaunch("2027-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("the discount is bounded, not a founding-member rate for life", () => {
  it("applies during the first year after joining", () => {
    expect(launchDiscountApplies(sub(inWindow), new Date("2026-10-16T00:00:00.000Z"))).toBe(true);
    expect(launchDiscountApplies(sub(inWindow), new Date("2027-10-14T00:00:00.000Z"))).toBe(true);
  });

  it("stops exactly a year later, so the cohort is not discounted forever", () => {
    const ends = launchDiscountEndsAt(inWindow);
    expect(ends.getUTCFullYear()).toBe(new Date(inWindow).getUTCFullYear() + LAUNCH_DISCOUNT_YEARS);
    expect(launchDiscountApplies(sub(inWindow), ends)).toBe(false);
    expect(launchDiscountApplies(sub(inWindow), new Date("2028-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("never applies to someone who joined outside the window, however new they are", () => {
    const later = "2027-03-01T00:00:00.000Z";
    expect(launchDiscountApplies(sub(later), new Date("2027-03-02T00:00:00.000Z"))).toBe(false);
  });
});

describe("what comes off the price", () => {
  const now = new Date("2026-11-01T00:00:00.000Z");

  it("takes the stated rate off a real plan price", () => {
    const premium = findPlan("premium-basic").monthlyCents; // 8999
    expect(launchDiscountCentsFor(premium, sub(inWindow), now)).toBe(Math.floor(premium * LAUNCH_DISCOUNT_RATE));
    // 3% of $89.99 is 269 cents. The point still stands: the copy shows the
    // amount, not the percentage, so nobody oversells a fraction of a
    // dollar. See the module doc.
    expect(launchDiscountCentsFor(premium, sub(inWindow), now)).toBe(269);
    expect(discountedPriceCents(premium, sub(inWindow), now)).toBe(8730);
  });

  it("rounds down, so the discount is never a fraction more than promised", () => {
    // 3% of 1999 is 59.97.
    expect(launchDiscountCentsFor(1999, sub(inWindow), now)).toBe(59);
  });

  it("is nothing at all for anyone not in the cohort", () => {
    expect(launchDiscountCentsFor(6999, sub("2027-06-01T00:00:00.000Z"), now)).toBe(0);
    expect(discountedPriceCents(6999, sub("2027-06-01T00:00:00.000Z"), now)).toBe(6999);
  });

  it("is nothing on a free plan, and never negative", () => {
    expect(launchDiscountCentsFor(0, sub(inWindow), now)).toBe(0);
    expect(launchDiscountCentsFor(-100, sub(inWindow), now)).toBe(0);
  });

  it("is smaller than the annual discount the app already gives", () => {
    // The honest comparison: paying annually already saves ~15%, five times
    // this. If the launch discount is ever meant to move someone, it has to
    // clear that bar, and at 3% it does not.
    const plan = findPlan("premium-basic");
    const annualSaving = 1 - plan.annualCents / (plan.monthlyCents * 12);
    expect(LAUNCH_DISCOUNT_RATE).toBeLessThan(annualSaving);
  });
});

describe("referral codes", () => {
  it("generates a readable, hyphenated code with no lookalike characters", () => {
    for (let i = 0; i < 200; i++) {
      const code = newReferralCode();
      expect(isReferralCodeShaped(code)).toBe(true);
      expect(code).not.toMatch(/[IO01]/);
      expect(code.replace("-", "")).toHaveLength(REFERRAL_CODE_LENGTH);
    }
  });

  it("forgives case, spacing and a missing hyphen — it gets read aloud", () => {
    expect(normalizeReferralCode("abc-de4")).toBe("ABC-DE4");
    expect(normalizeReferralCode(" abcde4 ")).toBe("ABC-DE4");
    expect(normalizeReferralCode("ABC DE4")).toBe("ABC-DE4");
  });

  it("returns nothing for anything that isn't a code, rather than guessing", () => {
    expect(normalizeReferralCode("")).toBe("");
    expect(normalizeReferralCode("TOO-SHORT-XYZ")).toBe("");
    expect(normalizeReferralCode("AB")).toBe("");
  });

  it("puts the code and the link in the invite, so a share is actually trackable", () => {
    const text = shareMessage("ABC-DE4", "https://safehubby.app/?ref=ABC-DE4");
    expect(text).toContain("ABC-DE4");
    expect(text).toContain("https://safehubby.app/?ref=ABC-DE4");
  });

  it("never pitches drinking in the invite", () => {
    // Same rule the points table holds: growth is fine, selling a big night
    // out is not what this app is for.
    expect(shareMessage("ABC-DE4", "https://x").toLowerCase()).not.toMatch(/party harder|drink more|get drunk/);
  });
});

describe("the pre-launch window, when nobody can be served yet", () => {
  it("knows the service is not live until the launch window closes", () => {
    expect(SERVICE_LIVE_AT).toBe(LAUNCH_WINDOW_END);
    expect(serviceIsLive(new Date(inWindow))).toBe(false);
    expect(serviceIsLive(new Date(LAUNCH_WINDOW_START))).toBe(false);
    expect(serviceIsLive(new Date(SERVICE_LIVE_AT))).toBe(true);
    expect(serviceIsLive(new Date("2027-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("never starts billing inside the window — the whole point of the rule", () => {
    // Every day of the pre-launch window maps to go-live, not to itself.
    for (const day of [LAUNCH_WINDOW_START, inWindow, "2026-11-30T23:59:59.000Z"]) {
      expect(billingStartsAt(new Date(day)).toISOString()).toBe(SERVICE_LIVE_AT);
    }
  });

  it("bills from signup once there is a service to bill for", () => {
    const later = new Date("2027-03-04T09:00:00.000Z");
    expect(billingStartsAt(later)).toEqual(later);
  });

  it("gives the cohort a full discounted year of service, not a year from signing up", () => {
    // Somebody who joined on day one of the window still gets twelve
    // discounted months of a working product, because the year is measured
    // from go-live rather than from the signup that preceded it.
    const ends = launchDiscountEndsAt(LAUNCH_WINDOW_START);
    expect(ends.toISOString()).toBe("2027-12-01T00:00:00.000Z");
    expect(launchDiscountApplies(sub(LAUNCH_WINDOW_START), new Date("2027-11-30T00:00:00.000Z"))).toBe(true);
    expect(launchDiscountApplies(sub(LAUNCH_WINDOW_START), ends)).toBe(false);
  });

  it("ends the discount on the same date for everyone in the cohort", () => {
    // Uniform by construction: they all joined before go-live, so they all
    // anchor to it. One date to explain, and no early joiner is worse off for
    // having signed up sooner.
    const first = launchDiscountEndsAt(LAUNCH_WINDOW_START).toISOString();
    const last = launchDiscountEndsAt("2026-11-30T12:00:00.000Z").toISOString();
    expect(last).toBe(first);
  });
});

describe("the offer a shopper is shown, before they are a subscriber", () => {
  const duringWindow = new Date(inWindow);
  const beforeWindow = new Date("2026-09-12T00:00:00.000Z");
  const afterWindow = new Date("2027-03-01T00:00:00.000Z");
  const premium = findPlan("premium-basic").monthlyCents; // 8999

  it("takes the rate OFF the price — it is not a charge of 3%", () => {
    // The whole bug this exists for: "3% off $89.99" is $87.30, not $2.70.
    const offer = launchOfferFor(premium, duringWindow);
    expect(offer.fullCents).toBe(8999);
    expect(offer.discountCents).toBe(269);
    expect(offer.payCents).toBe(8730);
    expect(offer.discounted).toBe(true);
    // The number a customer is charged must be the big one, not the small one.
    expect(offer.payCents).toBeGreaterThan(offer.fullCents * 0.9);
  });

  it("always adds up: what you pay plus what came off is the list price", () => {
    for (const price of [0, 999, 1799, 2999, 6999, 19999]) {
      for (const at of [beforeWindow, duringWindow, afterWindow]) {
        const offer = launchOfferFor(price, at);
        expect(offer.payCents + offer.discountCents).toBe(price);
        expect(offer.payCents).toBeLessThanOrEqual(price);
        expect(offer.payCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("offers nothing before the window opens, so the card matches the banner", () => {
    const offer = launchOfferFor(premium, beforeWindow);
    expect(offer.discounted).toBe(false);
    expect(offer.payCents).toBe(premium);
  });

  it("offers nothing once the window has closed", () => {
    expect(launchOfferFor(premium, afterWindow).discounted).toBe(false);
  });

  it("discounts an annual price too, not only a monthly one", () => {
    const annual = findPlan("premium-basic").annualCents;
    const offer = launchOfferFor(annual, duringWindow);
    expect(offer.discounted).toBe(true);
    expect(offer.discountCents).toBe(Math.floor(annual * LAUNCH_DISCOUNT_RATE));
    expect(offer.payCents).toBe(annual - offer.discountCents);
  });

  it("leaves a free plan free rather than showing a discount on nothing", () => {
    const offer = launchOfferFor(0, duringWindow);
    expect(offer).toMatchObject({ fullCents: 0, discountCents: 0, payCents: 0, discounted: false });
  });

  it("agrees with what renewal will actually charge", () => {
    // The offer is a promise about a future invoice, so the two have to be
    // the same arithmetic rather than two implementations of it.
    const sub = { startedAt: inWindow, joinedAt: inWindow };
    const atRenewal = new Date("2027-02-01T00:00:00.000Z");
    expect(launchOfferFor(premium, duringWindow).payCents)
      .toBe(discountedPriceCents(premium, sub, atRenewal));
  });
});
