import { describe, expect, it } from "vitest";
import {
  LAUNCH_DISCOUNT_RATE, LAUNCH_DISCOUNT_YEARS, LAUNCH_WINDOW_END, LAUNCH_WINDOW_START,
  REFERRAL_CODE_LENGTH, discountBreakEvenLift, discountedPriceCents, isReferralCodeShaped,
  joinedDuringLaunch, launchDiscountApplies, launchDiscountCentsFor, launchDiscountEndsAt,
  newReferralCode, normalizeReferralCode, shareMessage,
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
    const premium = findPlan("premium-basic").monthlyCents; // 1799
    expect(launchDiscountCentsFor(premium, sub(inWindow), now)).toBe(Math.floor(premium * LAUNCH_DISCOUNT_RATE));
    // 3% of $17.99 is 53 cents — small enough that the copy should not
    // oversell it. See the module doc.
    expect(launchDiscountCentsFor(premium, sub(inWindow), now)).toBe(53);
    expect(discountedPriceCents(premium, sub(inWindow), now)).toBe(1746);
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
