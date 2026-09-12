import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MAX_CAPACITY, ASSISTANT_MIN_CAPACITY, CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES,
  CONCIERGE_ASSISTANT_PAYOUT_CENTS, CONCIERGE_FEE_MARGIN, CONCIERGE_MAX_CAP_CENTS,
  CONCIERGE_MIN_CAP_CENTS, CONCIERGE_TASK_MINUTES,
  MAX_PHOTO_BYTES, MAX_TASKS_PER_WEEK_ESTIMATE, QUICK_TASK_ASSISTANT_PAYOUT_CENTS,
  QUICK_TASK_CATEGORIES, QUICK_TASK_MAX_CAP_CENTS,
  HOUSEHOLD_INCREMENT, MAX_PEOPLE_PER_TASK,
  MAX_SPEND_REQUEST_NOTE,
  annualEstimateCentsFor, assistantPayoutFor, canRevealCard, conciergeCategoryLabel,
  conciergeMarginCents, liveSpendRequests, remainingSpendCents, spendRequestedCents,
  validateSpendRequest,
  householdMultiplier,
  describeAssistantCapacity,
  hourlyRateCentsFor, isAssistantAvailable, isQuickTaskEligible, serviceFeeFor,
  totalChargeCents, validateConciergeRequest, validateDisputeReason, validateIdentityPhoto,
} from "../src/concierge.ts";
import type { AssistantProfile, ConciergeCategory, ConciergeTaskInput } from "../src/concierge.ts";

const request = (over: Partial<ConciergeTaskInput> = {}): ConciergeTaskInput => ({
  category: "grab-something",
  note: "Grab a burger and fries from The Anchor Tavern",
  location: { lat: 40.714, lng: -74.003, label: "The Anchor Tavern" },
  spendCapCents: 2500,
  ...over,
});

describe("validateConciergeRequest", () => {
  it("accepts a well-formed request", () => {
    expect(() => validateConciergeRequest(request())).not.toThrow();
  });

  it("rejects a category outside the fixed list", () => {
    expect(() => validateConciergeRequest(request({ category: "babysit" as never }))).toThrow(/unknown task/i);
  });

  it("requires a note the assistant can act on", () => {
    expect(() => validateConciergeRequest(request({ note: "" }))).toThrow(/describe the task/i);
    expect(() => validateConciergeRequest(request({ note: "   " }))).toThrow(/describe the task/i);
  });

  it("bounds the note length", () => {
    expect(() => validateConciergeRequest(request({ note: "x".repeat(281) }))).toThrow(/280 characters/);
    expect(() => validateConciergeRequest(request({ note: "x".repeat(280) }))).not.toThrow();
  });

  it("enforces the spend-cap bounds — a hard ceiling, not a suggestion", () => {
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MIN_CAP_CENTS - 1 }))).toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MAX_CAP_CENTS + 1 }))).toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MIN_CAP_CENTS }))).not.toThrow();
    expect(() => validateConciergeRequest(request({ spendCapCents: CONCIERGE_MAX_CAP_CENTS }))).not.toThrow();
  });

  it("rejects a non-whole-cent cap", () => {
    expect(() => validateConciergeRequest(request({ spendCapCents: 25.5 }))).toThrow(/spend cap/i);
  });
});

describe("categories", () => {
  it("has a label for every category, findable by id", () => {
    for (const c of CONCIERGE_CATEGORIES) expect(conciergeCategoryLabel(c.id)).toBe(c.label);
  });

  it("never enters someone's home, whatever the task is called", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/will not enter your home/i);
  });
});

describe("disclosures", () => {
  it("says plainly this is not Safehubby's own employee", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/not a Safehubby employee/i);
  });

  it("states the cap is exact, not padded", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/never more/i);
  });

  it("is not a substitute for calling emergency services", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/not an emergency service/i);
  });

  it("says the assistant pays with an issued card, never the subscriber's own", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/card issued for this task alone/i);
  });
});

const profile = (over: Partial<AssistantProfile> = {}): AssistantProfile => ({
  id: "a1",
  name: "Jordan",
  categories: ["grab-something"],
  maxConcurrentCustomers: 2,
  currentCustomers: 1,
  ...over,
});

describe("assistant roster", () => {
  it("bounds capacity to 1-3, the assistant's own stated comfort level", () => {
    expect(ASSISTANT_MIN_CAPACITY).toBe(1);
    expect(ASSISTANT_MAX_CAPACITY).toBe(3);
  });

  it("is available while under its own stated capacity", () => {
    expect(isAssistantAvailable(profile({ maxConcurrentCustomers: 2, currentCustomers: 1 }))).toBe(true);
    expect(isAssistantAvailable(profile({ maxConcurrentCustomers: 2, currentCustomers: 2 }))).toBe(false);
    expect(isAssistantAvailable(profile({ maxConcurrentCustomers: 2, currentCustomers: 3 }))).toBe(false);
  });

  it("describes remaining room rather than a bare number", () => {
    expect(describeAssistantCapacity(profile({ maxConcurrentCustomers: 3, currentCustomers: 1 })))
      .toMatch(/room for 2 more/i);
  });

  it("says plainly when someone is full up", () => {
    expect(describeAssistantCapacity(profile({ maxConcurrentCustomers: 1, currentCustomers: 1 })))
      .toMatch(/at capacity/i);
  });
});

describe("the service fee — the customer's price, with the margin on top of the payout", () => {
  it("has a published payout for every category", () => {
    for (const c of CONCIERGE_CATEGORIES) {
      expect(CONCIERGE_ASSISTANT_PAYOUT_CENTS[c.id]).toBeGreaterThan(0);
      expect(assistantPayoutFor(c.id)).toBe(CONCIERGE_ASSISTANT_PAYOUT_CENTS[c.id]);
    }
  });

  it("charges the customer the payout grossed up by the margin, never a cut of it", () => {
    for (const c of CONCIERGE_CATEGORIES) {
      const payout = assistantPayoutFor(c.id);
      expect(serviceFeeFor(c.id)).toBe(Math.round(payout / (1 - CONCIERGE_FEE_MARGIN)));
      // The assistant is never the one funding the margin.
      expect(serviceFeeFor(c.id)).toBeGreaterThan(payout);
      expect(conciergeMarginCents(c.id)).toBe(serviceFeeFor(c.id) - payout);
    }
  });

  it("keeps the margin at the stated share of what the customer pays", () => {
    for (const c of CONCIERGE_CATEGORIES) {
      const share = conciergeMarginCents(c.id) / serviceFeeFor(c.id);
      expect(share).toBeCloseTo(CONCIERGE_FEE_MARGIN, 4);
    }
  });

  it("prices a longer, open-ended task higher than a quick errand", () => {
    expect(serviceFeeFor("wait-with-someone")).toBeGreaterThan(serviceFeeFor("grab-something"));
  });

  it("is additive with the spend cap, never folded into or replacing it", () => {
    const category: ConciergeCategory = "grab-something";
    const total = totalChargeCents(category, 2500);
    expect(total).toBe(2500 + serviceFeeFor(category));
  });

  it("mentions the service fee and the selfie check in what a subscriber agrees to", () => {
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/service fee/i);
    expect(CONCIERGE_DISCLOSURES.join(" ")).toMatch(/selfie/i);
  });
});

describe("quick-task discount", () => {
  it("only discounts the short, single-purpose categories", () => {
    expect(QUICK_TASK_CATEGORIES).toEqual(["grab-something", "run-errand"]);
    expect(isQuickTaskEligible("grab-something")).toBe(true);
    expect(isQuickTaskEligible("run-errand")).toBe(true);
    expect(isQuickTaskEligible("wait-with-someone")).toBe(false);
    expect(isQuickTaskEligible("check-in-person")).toBe(false);
  });

  it("charges less than the standard fee for an eligible category", () => {
    for (const category of QUICK_TASK_CATEGORIES) {
      expect(assistantPayoutFor(category, true)).toBe(QUICK_TASK_ASSISTANT_PAYOUT_CENTS[category]);
      expect(serviceFeeFor(category, true)).toBeLessThan(serviceFeeFor(category));
      expect(assistantPayoutFor(category, true)).toBeLessThan(assistantPayoutFor(category));
    }
  });

  it("ignores the quickTask flag for a category that isn't eligible", () => {
    expect(serviceFeeFor("wait-with-someone", true)).toBe(serviceFeeFor("wait-with-someone"));
    expect(assistantPayoutFor("check-in-person", true)).toBe(CONCIERGE_ASSISTANT_PAYOUT_CENTS["check-in-person"]);
  });

  it("folds the discount into the total charge", () => {
    const total = totalChargeCents("grab-something", 2000, true);
    expect(total).toBe(2000 + serviceFeeFor("grab-something", true));
  });

  it("rejects quickTask on a category that doesn't qualify", () => {
    expect(() => validateConciergeRequest(request({ category: "wait-with-someone", quickTask: true })))
      .toThrow(/isn't eligible for the quick-task discount/i);
  });

  it("enforces a lower spend cap for a quick task than the standard max", () => {
    expect(QUICK_TASK_MAX_CAP_CENTS).toBeLessThan(CONCIERGE_MAX_CAP_CENTS);
    expect(() => validateConciergeRequest(request({ quickTask: true, spendCapCents: QUICK_TASK_MAX_CAP_CENTS })))
      .not.toThrow();
    expect(() => validateConciergeRequest(request({ quickTask: true, spendCapCents: QUICK_TASK_MAX_CAP_CENTS + 1 })))
      .toThrow(/spend cap/i);
  });

  it("still allows the standard, higher cap when not booked as a quick task", () => {
    expect(() => validateConciergeRequest(request({ spendCapCents: QUICK_TASK_MAX_CAP_CENTS + 1 }))).not.toThrow();
  });
});

describe("household scaling — a bigger family is more work, but not linearly", () => {
  it("charges the plain rate for one person", () => {
    expect(householdMultiplier(1)).toBe(1);
    expect(assistantPayoutFor("grab-something", false, 1)).toBe(900);
    expect(serviceFeeFor("grab-something", false, 1)).toBe(1125);
  });

  it("defaults to one person when the count is omitted", () => {
    expect(householdMultiplier()).toBe(1);
    expect(assistantPayoutFor("grab-something")).toBe(assistantPayoutFor("grab-something", false, 1));
  });

  it("adds the stated increment per extra person, not a full rate each", () => {
    expect(householdMultiplier(2)).toBeCloseTo(1 + HOUSEHOLD_INCREMENT, 10);
    expect(householdMultiplier(6)).toBeCloseTo(1 + HOUSEHOLD_INCREMENT * 5, 10);
    // Sublinear on purpose: six people must cost well under six times one.
    expect(householdMultiplier(6)).toBeLessThan(6);
  });

  it("scales a family of six to the expected published numbers", () => {
    expect(assistantPayoutFor("grab-something", false, 6)).toBe(2025);
    expect(assistantPayoutFor("run-errand", false, 6)).toBe(2250);
    expect(assistantPayoutFor("check-in-person", false, 6)).toBe(2700);
    expect(assistantPayoutFor("wait-with-someone", false, 6)).toBe(4050);
  });

  it("scales two people to the expected published numbers", () => {
    expect(assistantPayoutFor("grab-something", false, 2)).toBe(1125);
    expect(assistantPayoutFor("check-in-person", false, 2)).toBe(1500);
    expect(assistantPayoutFor("wait-with-someone", false, 2)).toBe(2250);
  });

  it("keeps the margin on top of the scaled payout, at the same share", () => {
    for (const people of [1, 2, 4, 6]) {
      const payout = assistantPayoutFor("wait-with-someone", false, people);
      const fee = serviceFeeFor("wait-with-someone", false, people);
      expect(fee).toBeGreaterThan(payout);
      expect(conciergeMarginCents("wait-with-someone", false, people)).toBe(fee - payout);
      // Within a rounding cent of the stated share: both amounts are whole
      // cents, so a multiplier like 1.75 can't land the ratio exactly on 0.2.
      expect(conciergeMarginCents("wait-with-someone", false, people) / fee)
        .toBeCloseTo(CONCIERGE_FEE_MARGIN, 3);
      expect(Math.abs(fee - Math.round(payout / (1 - CONCIERGE_FEE_MARGIN)))).toBeLessThanOrEqual(1);
    }
  });

  it("scales the quick-task rate the same way", () => {
    expect(assistantPayoutFor("grab-something", true, 1)).toBe(500);
    expect(assistantPayoutFor("grab-something", true, 6)).toBe(1125);
  });

  it("adds the scaled fee to the spend cap, leaving the cap itself untouched", () => {
    // The cap is the subscriber's own ceiling for purchases; scaling pay for
    // a bigger household must never quietly raise what can be spent.
    expect(totalChargeCents("grab-something", 2500, false, 6))
      .toBe(2500 + serviceFeeFor("grab-something", false, 6));
  });

  it("clamps a nonsense count rather than producing a nonsense rate", () => {
    expect(householdMultiplier(0)).toBe(1);
    expect(householdMultiplier(-4)).toBe(1);
    expect(householdMultiplier(999)).toBe(householdMultiplier(MAX_PEOPLE_PER_TASK));
    expect(householdMultiplier(2.7)).toBe(householdMultiplier(2));
  });

  it("rejects an out-of-range people count on a request", () => {
    expect(() => validateConciergeRequest(request({ peopleCount: 0 }))).toThrow(/between 1 and/i);
    expect(() => validateConciergeRequest(request({ peopleCount: 7 }))).toThrow(/between 1 and/i);
    expect(() => validateConciergeRequest(request({ peopleCount: 2.5 }))).toThrow(/between 1 and/i);
    expect(() => validateConciergeRequest(request({ peopleCount: 6 }))).not.toThrow();
    expect(() => validateConciergeRequest(request())).not.toThrow();
  });
});

describe("spend requests — evidence before the card unlocks", () => {
  const photo = { base64: "aGVsbG8=", mimeType: "image/jpeg", capturedAt: "2026-01-01T00:00:00.000Z" };
  const spendRequest = (over: Partial<{ id: string; amountCents: number; status: string }> = {}) => ({
    id: "sr1", amountCents: 4000, note: "Two chickens", photo,
    status: "open" as const, createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as any;

  it("keeps the card locked until a purchase is documented", () => {
    expect(canRevealCard({ spendRequests: undefined })).toBe(false);
    expect(canRevealCard({ spendRequests: [] })).toBe(false);
    expect(canRevealCard({ spendRequests: [spendRequest()] })).toBe(true);
  });

  it("re-locks the card when the only request is declined", () => {
    expect(canRevealCard({ spendRequests: [spendRequest({ status: "declined" })] })).toBe(false);
  });

  it("treats an approved request as live, the same as an open one", () => {
    expect(canRevealCard({ spendRequests: [spendRequest({ status: "approved" })] })).toBe(true);
  });

  it("leaves the card unlocked while any request survives a decline", () => {
    const task = {
      spendRequests: [spendRequest({ id: "a", status: "declined" }), spendRequest({ id: "b" })],
    };
    expect(liveSpendRequests(task).map((r) => r.id)).toEqual(["b"]);
    expect(canRevealCard(task)).toBe(true);
  });

  it("counts only live requests against the cap, so declining frees it back up", () => {
    const cap = { spendCapCents: 10000 };
    expect(spendRequestedCents({ spendRequests: [spendRequest({ amountCents: 4000 })] })).toBe(4000);
    expect(remainingSpendCents({ ...cap, spendRequests: [spendRequest({ amountCents: 4000 })] })).toBe(6000);
    expect(remainingSpendCents({
      ...cap, spendRequests: [spendRequest({ amountCents: 4000, status: "declined" })],
    })).toBe(10000);
  });

  it("never reports a negative remainder", () => {
    expect(remainingSpendCents({
      spendCapCents: 1000, spendRequests: [spendRequest({ amountCents: 4000 })],
    })).toBe(0);
  });

  it("refuses a request that would overrun what is left of the cap", () => {
    const task = { spendCapCents: 5000, spendRequests: [spendRequest({ amountCents: 4000 })] };
    expect(() => validateSpendRequest({ amountCents: 1500, note: "More" }, task)).toThrow(/left of the spend cap/i);
    expect(() => validateSpendRequest({ amountCents: 1000, note: "More" }, task)).not.toThrow();
  });

  it("requires a real amount and a real description", () => {
    const task = { spendCapCents: 5000, spendRequests: [] };
    expect(() => validateSpendRequest({ amountCents: 0, note: "x" }, task)).toThrow(/whole cents/i);
    expect(() => validateSpendRequest({ amountCents: -100, note: "x" }, task)).toThrow(/whole cents/i);
    expect(() => validateSpendRequest({ amountCents: 12.5, note: "x" }, task)).toThrow(/whole cents/i);
    expect(() => validateSpendRequest({ amountCents: 100, note: "   " }, task)).toThrow(/what you are buying/i);
    expect(() => validateSpendRequest({ amountCents: 100, note: "x".repeat(MAX_SPEND_REQUEST_NOTE + 1) }, task))
      .toThrow(new RegExp(`under ${MAX_SPEND_REQUEST_NOTE}`, "i"));
  });
});

describe("pay-rate calculator — reference info, not a contract", () => {
  it("computes an hourly-equivalent rate from the assistant's payout, not the customer's fee", () => {
    for (const c of CONCIERGE_CATEGORIES) {
      const expected = Math.round(assistantPayoutFor(c.id) / (CONCIERGE_TASK_MINUTES[c.id] / 60));
      expect(hourlyRateCentsFor(c.id)).toBe(expected);
      // Quoting the grossed-up fee here would overstate take-home pay.
      expect(hourlyRateCentsFor(c.id))
        .toBeLessThan(Math.round(serviceFeeFor(c.id) / (CONCIERGE_TASK_MINUTES[c.id] / 60)));
    }
  });

  it("uses the discounted fee for the hourly rate when quickTask applies", () => {
    expect(hourlyRateCentsFor("grab-something", true)).toBeLessThan(hourlyRateCentsFor("grab-something", false));
  });

  it("multiplies the per-task fee by a weekly cadence and 52 weeks", () => {
    expect(annualEstimateCentsFor("grab-something", 3)).toBe(assistantPayoutFor("grab-something") * 3 * 52);
  });

  it("never goes negative and caps an absurd weekly cadence rather than exploding", () => {
    expect(annualEstimateCentsFor("grab-something", -5)).toBe(0);
    expect(annualEstimateCentsFor("grab-something", 999))
      .toBe(assistantPayoutFor("grab-something") * MAX_TASKS_PER_WEEK_ESTIMATE * 52);
  });
});

describe("validateDisputeReason", () => {
  it("accepts a real explanation", () => {
    expect(() => validateDisputeReason("The assistant never showed up and kept the money.")).not.toThrow();
  });

  it("rejects a blank claim", () => {
    expect(() => validateDisputeReason("")).toThrow(/describe what happened/i);
    expect(() => validateDisputeReason("   ")).toThrow(/describe what happened/i);
  });

  it("bounds the length", () => {
    expect(() => validateDisputeReason("x".repeat(281))).toThrow(/under 280 characters/i);
    expect(() => validateDisputeReason("x".repeat(280))).not.toThrow();
  });
});

describe("validateIdentityPhoto", () => {
  const photo = (over: Partial<{ base64: string; mimeType: string }> = {}) => ({
    base64: Buffer.from("a small test photo").toString("base64"),
    mimeType: "image/jpeg",
    ...over,
  });

  it("accepts a normal photo", () => {
    expect(() => validateIdentityPhoto(photo())).not.toThrow();
  });

  it("rejects an empty capture", () => {
    expect(() => validateIdentityPhoto(photo({ base64: "" }))).toThrow(/no photo/i);
  });

  it("rejects anything not declared as an image", () => {
    expect(() => validateIdentityPhoto(photo({ mimeType: "audio/webm" }))).toThrow(/doesn't look like a photo/i);
  });

  it("caps how large the encoded photo can be", () => {
    const huge = "A".repeat(MAX_PHOTO_BYTES * 2);
    expect(() => validateIdentityPhoto(photo({ base64: huge }))).toThrow(/too large/i);
  });
});
