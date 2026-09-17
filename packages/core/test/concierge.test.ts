import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MAX_CAPACITY, ASSISTANT_MIN_CAPACITY, CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES,
  CONCIERGE_ASSISTANT_PAYOUT_CENTS, CONCIERGE_FEE_MARGIN, CONCIERGE_MAX_CAP_CENTS,
  CONCIERGE_MIN_CAP_CENTS, CONCIERGE_TASK_MINUTES, DEFAULT_CONCIERGE_CAP_CENTS,
  GRAB_SOMETHING_MIN_CAP_CENTS, GRAB_SOMETHING_MAX_CAP_CENTS, minCapFor,
  MAX_PHOTO_BYTES, MAX_TASKS_PER_WEEK_ESTIMATE, QUICK_TASK_ASSISTANT_PAYOUT_CENTS,
  QUICK_TASK_CATEGORIES, QUICK_TASK_MAX_CAP_CENTS,
  HOUSEHOLD_INCREMENT, MAX_PEOPLE_PER_TASK,
  MAX_SPEND_REQUEST_NOTE,
  annualEstimateCentsFor, assistantPayoutFor, canRevealCard, conciergeCategoryLabel,
  conciergeMarginCents, liveSpendRequests, remainingSpendCents, spendRequestedCents,
  validateSpendRequest, isSpendAccountedFor, unaccountedSpendCents, validateSpendChange,
  MAX_SPEND_CHANGE_NOTE,
  householdMultiplier,
  describeAssistantCapacity,
  hourlyRateCentsFor, isAssistantAvailable, isQuickTaskEligible, serviceFeeFor,
  totalChargeCents, validateConciergeRequest, validateDisputeReason, validateIdentityPhoto,
  PURCHASE_LADDER_TOP_CENTS, capPresetsFor, capScaleFor, defaultCapFor, maxCapFor, minutesFor,
  HOURLY_CATEGORIES, PA_HOURLY_RATE_CENTS, defaultHoursFor, hasCapCeiling, isHourlyCategory,
  MAX_BOOKED_HOURS, MIN_BOOKED_HOURS, clampHours,
} from "../src/concierge.ts";
import { presetAmounts } from "../src/amount-steps.ts";
import type { AssistantProfile, ConciergeCategory, ConciergeTaskInput } from "../src/concierge.ts";

const request = (over: Partial<ConciergeTaskInput> = {}): ConciergeTaskInput => {
  const category = over.category ?? "grab-something";
  return {
    category: "grab-something",
    note: "Grab a burger and fries from The Anchor Tavern",
    location: { lat: 40.714, lng: -74.003, label: "The Anchor Tavern" },
    spendCapCents: 2500,
    // airport-pickup requires a flight; every other category rejects one —
    // filled in by default here so the "for every category" tests below
    // don't each need to know that one category has an extra required field.
    ...(category === "airport-pickup" ? { flight: { flightNumber: "DL204", date: "2026-09-17" } } : {}),
    ...over,
  };
};

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
    // Not grab-something (see its own doc comment on GRAB_SOMETHING_MIN/MAX_CAP_CENTS)
    // — run-errand is what still uses the shared bounds this test is about.
    const errand = { category: "run-errand" as const };
    expect(() => validateConciergeRequest(request({ ...errand, spendCapCents: CONCIERGE_MIN_CAP_CENTS - 1 }))).toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ ...errand, spendCapCents: CONCIERGE_MAX_CAP_CENTS + 1 }))).toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ ...errand, spendCapCents: CONCIERGE_MIN_CAP_CENTS }))).not.toThrow();
    expect(() => validateConciergeRequest(request({ ...errand, spendCapCents: CONCIERGE_MAX_CAP_CENTS }))).not.toThrow();
  });

  it("gives grab-something its own, wider bounds — no floor, a $1,000 ceiling", () => {
    expect(GRAB_SOMETHING_MIN_CAP_CENTS).toBe(0);
    expect(minCapFor("grab-something")).toBe(GRAB_SOMETHING_MIN_CAP_CENTS);
    expect(() => validateConciergeRequest(request({ spendCapCents: GRAB_SOMETHING_MIN_CAP_CENTS }))).not.toThrow();
    expect(() => validateConciergeRequest(request({ spendCapCents: GRAB_SOMETHING_MAX_CAP_CENTS }))).not.toThrow();
    expect(() => validateConciergeRequest(request({ spendCapCents: GRAB_SOMETHING_MAX_CAP_CENTS + 1 })))
      .toThrow(/spend cap/i);
    expect(() => validateConciergeRequest(request({ spendCapCents: -1 }))).toThrow(/spend cap/i);
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
  it("has a published payout for every category, whichever way it is paid", () => {
    for (const c of CONCIERGE_CATEGORIES) {
      expect(assistantPayoutFor(c.id)).toBeGreaterThan(0);
      if (isHourlyCategory(c.id)) {
        // Hourly work is the rate times the hours booked, and the per-task
        // table has no entry for it to disagree with.
        expect(assistantPayoutFor(c.id)).toBe(PA_HOURLY_RATE_CENTS * defaultHoursFor(c.id));
      } else {
        expect(assistantPayoutFor(c.id)).toBe(CONCIERGE_ASSISTANT_PAYOUT_CENTS[c.id]);
      }
    }
  });

  it("prices hourly work by the hours booked, not by a fixed block", () => {
    for (const c of HOURLY_CATEGORIES) {
      expect(assistantPayoutFor(c, false, 1, 1)).toBe(PA_HOURLY_RATE_CENTS);
      expect(assistantPayoutFor(c, false, 1, 4)).toBe(PA_HOURLY_RATE_CENTS * 4);
      // Twice the hours is twice the pay — there is no block to round into.
      expect(assistantPayoutFor(c, false, 1, 5)).toBe(2 * assistantPayoutFor(c, false, 1, 2.5));
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
      // Three decimals, not four: both sides are whole cents, so the ratio
      // lands near 0.2003 rather than exactly on 0.2.
      expect(share).toBeCloseTo(CONCIERGE_FEE_MARGIN, 3);
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
    expect(assistantPayoutFor("check-in-person", true)).toBe(assistantPayoutFor("check-in-person"));
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
    // run-errand, not grab-something — see the previous test's comment.
    expect(QUICK_TASK_MAX_CAP_CENTS).toBeLessThan(CONCIERGE_MAX_CAP_CENTS);
    expect(() => validateConciergeRequest(request({ category: "run-errand", quickTask: true, spendCapCents: QUICK_TASK_MAX_CAP_CENTS })))
      .not.toThrow();
    expect(() => validateConciergeRequest(request({ category: "run-errand", quickTask: true, spendCapCents: QUICK_TASK_MAX_CAP_CENTS + 1 })))
      .toThrow(/spend cap/i);
  });

  it("never shrinks grab-something's ceiling for a quick task — it keeps its own $1,000 max either way", () => {
    expect(() => validateConciergeRequest(request({ quickTask: true, spendCapCents: GRAB_SOMETHING_MAX_CAP_CENTS })))
      .not.toThrow();
    expect(maxCapFor("grab-something", true)).toBe(GRAB_SOMETHING_MAX_CAP_CENTS);
    expect(maxCapFor("grab-something", false)).toBe(GRAB_SOMETHING_MAX_CAP_CENTS);
  });

  it("still allows the standard, higher cap when not booked as a quick task", () => {
    expect(() => validateConciergeRequest(request({ spendCapCents: QUICK_TASK_MAX_CAP_CENTS + 1 }))).not.toThrow();
  });
});

describe("the cap the customer starts from", () => {
  it("books without being edited, in either mode", () => {
    // The default is what most bookings will keep. If it ever sat above a
    // ceiling, the commonest path through the form would open on an amount
    // the server rejects.
    expect(() => validateConciergeRequest(request({ spendCapCents: DEFAULT_CONCIERGE_CAP_CENTS })))
      .not.toThrow();
    expect(() => validateConciergeRequest(request({ quickTask: true, spendCapCents: DEFAULT_CONCIERGE_CAP_CENTS })))
      .not.toThrow();
  });

  it("covers an ordinary errand rather than only a sandwich", () => {
    // A hardware run, a pharmacy trip, a week's groceries. $25 did not reach
    // any of them, which made "too low to use" the default experience.
    expect(DEFAULT_CONCIERGE_CAP_CENTS).toBeGreaterThanOrEqual(10000);
  });

  it("leaves the floor low enough for genuinely small jobs", () => {
    // Raising the default must not drag the minimum up with it: a $12 coffee
    // run should not have to authorize a hold ten times its size.
    expect(CONCIERGE_MIN_CAP_CENTS).toBeLessThan(DEFAULT_CONCIERGE_CAP_CENTS);
  });
});

describe("household scaling — a bigger family is more work, but not linearly", () => {
  it("charges the plain rate for one person", () => {
    expect(householdMultiplier(1)).toBe(1);
    expect(assistantPayoutFor("grab-something", false, 1)).toBe(1050);
    expect(serviceFeeFor("grab-something", false, 1)).toBe(1313);
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
    expect(assistantPayoutFor("grab-something", false, 6)).toBe(2363);
    expect(assistantPayoutFor("run-errand", false, 6)).toBe(2588);
    // Hourly, at the default block: $35/hr x 1h and x 2h, scaled 2.25x.
    expect(assistantPayoutFor("check-in-person", false, 6)).toBe(7875);
    expect(assistantPayoutFor("wait-with-someone", false, 6)).toBe(15750);
  });

  it("scales two people to the expected published numbers", () => {
    expect(assistantPayoutFor("grab-something", false, 2)).toBe(1313);
    expect(assistantPayoutFor("check-in-person", false, 2)).toBe(4375);
    expect(assistantPayoutFor("wait-with-someone", false, 2)).toBe(8750);
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
    expect(assistantPayoutFor("grab-something", true, 1)).toBe(400);
    expect(assistantPayoutFor("grab-something", true, 6)).toBe(900);
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

describe("receipts — unanswered spend comes out of the assistant's pay", () => {
  const photo = { base64: "aGVsbG8=", mimeType: "image/jpeg", capturedAt: "2026-01-01T00:00:00.000Z" };
  const req = (over: Record<string, unknown> = {}) => ({
    id: "sr1", amountCents: 4000, note: "Two chickens", photo,
    status: "open", createdAt: "2026-01-01T00:00:00.000Z", ...over,
  }) as any;

  it("counts a purchase with a receipt as answered for", () => {
    expect(isSpendAccountedFor(req({ receipt: photo }))).toBe(true);
    expect(unaccountedSpendCents({ spendRequests: [req({ receipt: photo })] })).toBe(0);
  });

  it("counts a reported change as answered for, so no receipt is not a penalty", () => {
    // The whole point: the shop was out of it, they said so, they keep their pay.
    const change = { note: "They were out of it", createdAt: "2026-01-01T01:00:00.000Z" };
    expect(isSpendAccountedFor(req({ change }))).toBe(true);
    expect(unaccountedSpendCents({ spendRequests: [req({ change })] })).toBe(0);
  });

  it("charges silence to the assistant — no receipt and no explanation", () => {
    expect(isSpendAccountedFor(req())).toBe(false);
    expect(unaccountedSpendCents({ spendRequests: [req()] })).toBe(4000);
  });

  it("adds up only the unanswered purchases", () => {
    const change = { note: "Out of stock", createdAt: "2026-01-01T01:00:00.000Z" };
    expect(unaccountedSpendCents({
      spendRequests: [
        req({ id: "a", amountCents: 4000, receipt: photo }),
        req({ id: "b", amountCents: 2500 }),
        req({ id: "c", amountCents: 1000, change }),
        req({ id: "d", amountCents: 9000 }),
      ],
    })).toBe(11500);
  });

  it("never charges for a declined purchase — the card was locked for it", () => {
    expect(unaccountedSpendCents({
      spendRequests: [req({ amountCents: 4000, status: "declined" })],
    })).toBe(0);
  });

  it("is zero for a task where nothing was ever requested", () => {
    expect(unaccountedSpendCents({ spendRequests: undefined })).toBe(0);
    expect(unaccountedSpendCents({ spendRequests: [] })).toBe(0);
  });

  it("requires a real explanation on a change note", () => {
    expect(() => validateSpendChange("")).toThrow(/say what changed/i);
    expect(() => validateSpendChange("   ")).toThrow(/say what changed/i);
    expect(() => validateSpendChange("x".repeat(MAX_SPEND_CHANGE_NOTE + 1)))
      .toThrow(new RegExp(`under ${MAX_SPEND_CHANGE_NOTE}`, "i"));
    expect(() => validateSpendChange("They were out of the 2lb bag")).not.toThrow();
  });
});

describe("pay-rate calculator — reference info, not a contract", () => {
  it("computes an hourly-equivalent rate from the assistant's payout, not the customer's fee", () => {
    for (const c of CONCIERGE_CATEGORIES) {
      // Hourly work has a real rate; per-task work has one implied by the
      // published minutes. Either way it is the payout, never the fee.
      const expected = isHourlyCategory(c.id)
        ? PA_HOURLY_RATE_CENTS
        : Math.round(assistantPayoutFor(c.id) / (CONCIERGE_TASK_MINUTES[c.id] / 60));
      expect(hourlyRateCentsFor(c.id)).toBe(expected);
      // Quoting the grossed-up fee here would overstate take-home pay.
      const minutes = minutesFor(c.id);
      expect(hourlyRateCentsFor(c.id))
        .toBeLessThan(Math.round(serviceFeeFor(c.id) / (minutes / 60)));
    }
  });

  it("pays a quick task less per task and at a deliberately different hourly rate — a different role, not a shorter version of this one", () => {
    // This test used to require the quick-task rate to clear ~95% of the
    // standard rate's hourly-equivalent, on the theory that a quick task is
    // the same work done faster. That held while "quick task" was a
    // discount tier inside the personal-assistant's own rate card. It no
    // longer is: `ROLE_CATEGORIES` sends every quick task to the
    // errand-runner role exclusively, a genuinely different, lower-skill
    // job the standard categories are never dispatched to — so it is priced
    // against the errand-runner labor market instead (see
    // QUICK_TASK_ASSISTANT_PAYOUT_CENTS's own comment for the real
    // Glassdoor/Salary.com/Instacart/DoorDash figures behind $24/hr).
    expect(assistantPayoutFor("grab-something", true))
      .toBeLessThan(assistantPayoutFor("grab-something", false));
    expect(hourlyRateCentsFor("grab-something", true)).toBe(2400);
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

describe("two ceilings: an errand and a purchase are funded differently", () => {
  it("funds a hotel or a pair of tickets well past the errand ceiling", () => {
    expect(() => validateConciergeRequest(request({
      category: "book-and-buy", spendCapCents: 180000,
    }))).not.toThrow();
  });

  it("loads whatever the customer funds, with no ceiling of Safehubby's", () => {
    // A forty-thousand-dollar hotel stay is a real booking. What bounds this
    // is the customer's own funding clearing, not a number picked in here.
    expect(() => validateConciergeRequest(request({
      category: "book-and-buy", spendCapCents: 4_000_000,
    }))).not.toThrow();
    expect(maxCapFor("book-and-buy")).toBeNull();
    expect(hasCapCeiling("book-and-buy")).toBe(false);
  });

  it("does not let the preset ladder become the limit it replaced", () => {
    // The stepper needs a finite scale to step along, and the ladder's top is
    // it. Treating that as the ceiling clamps a typed $40,000 back down to
    // $10,000 — "no limit" with extra steps, which is how this first shipped.
    const scale = capScaleFor("book-and-buy");
    expect(scale.maxCents).toBe(PURCHASE_LADDER_TOP_CENTS);
    expect(maxCapFor("book-and-buy")).toBeNull();
    expect(() => validateConciergeRequest(request({
      category: "book-and-buy", spendCapCents: PURCHASE_LADDER_TOP_CENTS * 4,
    }))).not.toThrow();
  });

  it("still refuses an amount below the floor, and still holds it exactly", () => {
    expect(() => validateConciergeRequest(request({
      category: "book-and-buy", spendCapCents: CONCIERGE_MIN_CAP_CENTS - 1,
    }))).toThrow(/at least/i);
    // The promise the cap makes does not weaken as the number grows: the
    // total is still cap + fee, with nothing padded.
    const cap = 4_000_000;
    expect(totalChargeCents("book-and-buy", cap, false, 1, 3))
      .toBe(cap + serviceFeeFor("book-and-buy", false, 1, 3));
  });

  it("does not let an errand reach the purchase ceiling", () => {
    // The higher balance belongs to the task that is buying something, not to
    // whoever picks the roomier category by accident.
    expect(() => validateConciergeRequest(request({
      category: "run-errand", spendCapCents: CONCIERGE_MAX_CAP_CENTS + 1,
    }))).toThrow(/spend cap/i);
    expect(maxCapFor("run-errand")).toBe(CONCIERGE_MAX_CAP_CENTS);
    expect(hasCapCeiling("run-errand")).toBe(true);
  });

  it("never offers a preset the ceiling would reject", () => {
    for (const { id } of CONCIERGE_CATEGORIES) {
      for (const quick of [false, true]) {
        if (quick && !isQuickTaskEligible(id)) continue;
        const scale = capScaleFor(id, quick);
        for (const preset of presetAmounts(capPresetsFor(id), scale)) {
          expect(() => validateConciergeRequest(request({
            category: id, quickTask: quick, spendCapCents: preset,
          })), `${id} preset ${preset}`).not.toThrow();
        }
      }
    }
  });

  it("always offers the ceiling itself as one tap", () => {
    // The quick-task checkbox names its ceiling in the label. When the ladder
    // ran $20/$40/$75/... under a $50 quick ceiling, the copy promised an
    // amount no button could produce — you could read "capped at $50" and
    // have no way to actually choose $50. The ceiling has to be on the ladder.
    for (const { id } of CONCIERGE_CATEGORIES) {
      for (const quick of [false, true]) {
        if (quick && !isQuickTaskEligible(id)) continue;
        const scale = capScaleFor(id, quick);
        expect(presetAmounts(capPresetsFor(id), scale), `${id} quick=${quick}`)
          .toContain(scale.maxCents);
      }
    }
  });

  it("opens each category on a cap that category can actually book", () => {
    for (const { id } of CONCIERGE_CATEGORIES) {
      expect(() => validateConciergeRequest(request({ category: id, spendCapCents: defaultCapFor(id) })),
        `${id} default`).not.toThrow();
    }
  });

  it("pays the purchase task for the hours it takes, not as a fixed trip", () => {
    // Finding what is available, comparing it and committing someone's money
    // has no natural end, so it is booked by the hour like the rest of the
    // personal assistant's work — at the same rate as every other hour.
    expect(isHourlyCategory("book-and-buy")).toBe(true);
    expect(hourlyRateCentsFor("book-and-buy")).toBe(PA_HOURLY_RATE_CENTS);
    expect(assistantPayoutFor("book-and-buy", false, 1, 6))
      .toBe(3 * assistantPayoutFor("book-and-buy", false, 1, 2));
  });
});

describe("booking a budget of hours", () => {
  it("takes hours for the work that is paid by the hour", () => {
    expect(() => validateConciergeRequest(request({ category: "book-and-buy", hours: 4 }))).not.toThrow();
    expect(() => validateConciergeRequest(request({ category: "wait-with-someone", hours: 2.5 }))).not.toThrow();
  });

  it("refuses hours on an errand instead of quietly dropping them", () => {
    // Dropping them would charge the per-task price for a booking the
    // customer sized in hours — a mismatch nobody notices until the invoice.
    expect(() => validateConciergeRequest(request({ category: "run-errand", hours: 3 })))
      .toThrow(/priced per task/i);
  });

  it("holds the booking inside a day, and above a doorstep visit", () => {
    expect(() => validateConciergeRequest(request({ category: "book-and-buy", hours: 0.5 })))
      .toThrow(/between/i);
    expect(() => validateConciergeRequest(request({ category: "book-and-buy", hours: MAX_BOOKED_HOURS + 1 })))
      .toThrow(/between/i);
    expect(() => validateConciergeRequest(request({ category: "book-and-buy", hours: MAX_BOOKED_HOURS })))
      .not.toThrow();
  });

  it("books in half hours, not in arbitrary fractions", () => {
    expect(() => validateConciergeRequest(request({ category: "book-and-buy", hours: 2.25 })))
      .toThrow(/half hours/i);
  });

  it("refuses an airport pickup with no flight named", () => {
    expect(() => validateConciergeRequest(request({ category: "airport-pickup", flight: undefined })))
      .toThrow(/which flight/i);
    expect(() => validateConciergeRequest(request({ category: "airport-pickup", flight: { flightNumber: "", date: "2026-09-17" } })))
      .toThrow(/which flight/i);
    expect(() => validateConciergeRequest(request({ category: "airport-pickup", flight: { flightNumber: "DL204", date: "" } })))
      .toThrow(/which flight/i);
  });

  it("accepts a well-formed airport pickup", () => {
    expect(() => validateConciergeRequest(request({ category: "airport-pickup" }))).not.toThrow();
  });

  it("refuses a flight on a category that doesn't track one", () => {
    expect(() => validateConciergeRequest(request({
      category: "run-errand", flight: { flightNumber: "DL204", date: "2026-09-17" },
    }))).toThrow(/does not track a flight/i);
  });

  it("is a personal-assistant duty, paid by the hour like the other in-person work", () => {
    expect(isHourlyCategory("airport-pickup")).toBe(true);
    expect(hourlyRateCentsFor("airport-pickup")).toBe(PA_HOURLY_RATE_CENTS);
  });

  it("charges the customer the booked hours grossed up, and pays the assistant all of them", () => {
    const hours = 5;
    const payout = assistantPayoutFor("book-and-buy", false, 1, hours);
    expect(payout).toBe(PA_HOURLY_RATE_CENTS * hours);
    const fee = serviceFeeFor("book-and-buy", false, 1, hours);
    expect(fee).toBeGreaterThan(payout);
    // The margin still sits on top of the hours rather than inside them.
    expect(Math.round(fee * (1 - CONCIERGE_FEE_MARGIN))).toBe(payout);
  });

  it("keeps the card balance independent of the hours booked", () => {
    // The two are different kinds of money: hours are the assistant's time,
    // the cap is what goes on the card. Booking longer must not quietly
    // change what they are allowed to spend.
    const capCents = 120000;
    const short = totalChargeCents("book-and-buy", capCents, false, 1, 2);
    const long = totalChargeCents("book-and-buy", capCents, false, 1, 8);
    expect(long - short).toBe(
      serviceFeeFor("book-and-buy", false, 1, 8) - serviceFeeFor("book-and-buy", false, 1, 2),
    );
  });

  it("snaps a stray value onto something bookable rather than refusing to price it", () => {
    expect(clampHours(0)).toBe(MIN_BOOKED_HOURS);
    expect(clampHours(99)).toBe(MAX_BOOKED_HOURS);
    expect(clampHours(2.3)).toBe(2.5);
    expect(clampHours(Number.NaN)).toBe(MIN_BOOKED_HOURS);
  });
});
