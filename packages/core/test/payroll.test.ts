import { describe, expect, it } from "vitest";
import {
  PAYROLL_PERIOD_DAYS, applyAdjustments, earningsFor, outstandingClawbackCents, payoutPeriodFor,
  previousPayoutPeriod, totalEarningsCents, unpaidEarningsCents, validatePayoutDestination,
} from "../src/payroll.ts";
import type { AssistantAdjustment } from "../src/payroll.ts";
import type { ConciergeTask } from "../src/concierge.ts";

const task = (over: Partial<ConciergeTask> = {}): ConciergeTask => ({
  id: "ct1", travelerId: "usr1", category: "grab-something", note: "Grab a burger",
  // The customer's fee and the assistant's payout differ by Safehubby's
  // margin; payroll must read the payout, so the two are set apart here on
  // purpose rather than to the same number.
  location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500,
  serviceFeeCents: 1125, assistantPayoutCents: 900, peopleCount: 1,
  status: "completed", provider: "Nearby Aide", assistantId: "asst1",
  chargeId: "ch1", holdId: "hold1", createdAt: "2024-01-01T00:00:00.000Z",
  completedAt: "2024-01-01T12:00:00.000Z",
  ...over,
});

describe("payoutPeriodFor", () => {
  it("gives every instant a 14-day window, end exclusive", () => {
    const p = payoutPeriodFor(new Date("2024-01-05T00:00:00.000Z"));
    expect((p.end.getTime() - p.start.getTime()) / 86_400_000).toBe(PAYROLL_PERIOD_DAYS);
  });

  it("puts two dates 14 days apart into different periods, and a date just before the boundary into the earlier one", () => {
    const start = payoutPeriodFor(new Date("2024-01-01T00:00:00.000Z"));
    const sameEnd = payoutPeriodFor(new Date(start.end.getTime() - 1));
    const nextPeriod = payoutPeriodFor(start.end);
    expect(sameEnd.start.getTime()).toBe(start.start.getTime());
    expect(nextPeriod.start.getTime()).toBe(start.end.getTime());
  });

  it("is stable — the same instant always resolves to the same period", () => {
    const at = new Date("2025-06-15T08:00:00.000Z");
    expect(payoutPeriodFor(at)).toEqual(payoutPeriodFor(at));
  });
});

describe("previousPayoutPeriod", () => {
  it("is the period immediately before the current one, with no gap", () => {
    const at = new Date("2024-03-01T00:00:00.000Z");
    const current = payoutPeriodFor(at);
    const previous = previousPayoutPeriod(at);
    expect(previous.end.getTime()).toBe(current.start.getTime());
  });
});

describe("earningsFor", () => {
  it("only counts completed tasks for the named assistant, in the window, not yet paid out", () => {
    const period = payoutPeriodFor(new Date("2024-01-01T12:00:00.000Z"));
    const tasks: ConciergeTask[] = [
      task({ id: "ct1", assistantPayoutCents: 900 }),
      task({ id: "ct2", assistantId: "someone-else", assistantPayoutCents: 1200 }),
      task({ id: "ct3", status: "in-progress", completedAt: undefined, assistantPayoutCents: 1800 }),
      task({ id: "ct4", payoutId: "payout_already", assistantPayoutCents: 900 }),
      task({ id: "ct5", completedAt: "2023-01-01T00:00:00.000Z", assistantPayoutCents: 500 }),
    ];
    const earnings = earningsFor(tasks, "asst1", period);
    expect(earnings.map((e) => e.taskId)).toEqual(["ct1"]);
    expect(totalEarningsCents(earnings)).toBe(900);
  });

  it("pays the assistant's payout, never the customer's fee", () => {
    // The bug this guards: paying `serviceFeeCents` hands the assistant
    // Safehubby's margin too, leaving zero margin on every task booked.
    const period = payoutPeriodFor(new Date("2024-01-01T12:00:00.000Z"));
    const earnings = earningsFor([task({ serviceFeeCents: 1125, assistantPayoutCents: 900 })], "asst1", period);
    expect(totalEarningsCents(earnings)).toBe(900);
    expect(totalEarningsCents(earnings)).not.toBe(1125);
  });

  it("sums every eligible task in the window", () => {
    const period = payoutPeriodFor(new Date("2024-01-01T12:00:00.000Z"));
    const tasks: ConciergeTask[] = [
      task({ id: "ct1", assistantPayoutCents: 900 }),
      task({ id: "ct2", assistantPayoutCents: 1200, completedAt: "2024-01-05T00:00:00.000Z" }),
    ];
    expect(totalEarningsCents(earningsFor(tasks, "asst1", period))).toBe(2100);
  });

  it("excludes a task completed just at the period's end boundary — that belongs to the next period", () => {
    const period = payoutPeriodFor(new Date("2024-01-01T00:00:00.000Z"));
    const tasks: ConciergeTask[] = [task({ completedAt: period.end.toISOString() })];
    expect(earningsFor(tasks, "asst1", period)).toEqual([]);
  });
});

describe("unpaidEarningsCents", () => {
  it("sums every completed, not-yet-paid task for that assistant, regardless of period", () => {
    const tasks: ConciergeTask[] = [
      task({ id: "ct1", assistantPayoutCents: 900, completedAt: "2023-01-01T00:00:00.000Z" }),
      task({ id: "ct2", assistantPayoutCents: 1200, completedAt: "2024-06-01T00:00:00.000Z" }),
      task({ id: "ct3", assistantPayoutCents: 500, payoutId: "payout_already" }),
      task({ id: "ct4", assistantId: "someone-else", assistantPayoutCents: 2000 }),
      task({ id: "ct5", status: "in-progress", completedAt: undefined, assistantPayoutCents: 1800 }),
    ];
    expect(unpaidEarningsCents(tasks, "asst1")).toBe(2100);
  });

  it("is zero once everything has been paid out", () => {
    const tasks: ConciergeTask[] = [task({ payoutId: "payout_1" })];
    expect(unpaidEarningsCents(tasks, "asst1")).toBe(0);
  });
});

describe("validatePayoutDestination", () => {
  const destination = (over: Partial<{ accountHolderName: string; routingNumber: string; accountNumber: string }> = {}) => ({
    accountHolderName: "Jordan Rivera",
    routingNumber: "021000021",
    accountNumber: "123456789",
    ...over,
  });

  it("accepts a well-formed US bank account", () => {
    expect(() => validatePayoutDestination(destination())).not.toThrow();
  });

  it("requires a name on the account", () => {
    expect(() => validatePayoutDestination(destination({ accountHolderName: "" }))).toThrow(/name/i);
    expect(() => validatePayoutDestination(destination({ accountHolderName: "   " }))).toThrow(/name/i);
  });

  it("requires exactly 9 digits for a routing number", () => {
    expect(() => validatePayoutDestination(destination({ routingNumber: "12345" }))).toThrow(/routing number/i);
    expect(() => validatePayoutDestination(destination({ routingNumber: "12345678a" }))).toThrow(/routing number/i);
  });

  it("bounds the account number to a plausible length", () => {
    expect(() => validatePayoutDestination(destination({ accountNumber: "12" }))).toThrow(/account number/i);
    expect(() => validatePayoutDestination(destination({ accountNumber: "1".repeat(20) }))).toThrow(/account number/i);
  });
});

const adjustment = (over: Partial<AssistantAdjustment> = {}): AssistantAdjustment => ({
  id: "adj1", assistantId: "asst1", taskId: "ct_disputed", reason: "customer dispute",
  totalCents: 2500, remainingCents: 2500, createdAt: "2024-01-01T00:00:00.000Z",
  ...over,
});

describe("applyAdjustments — clawing back a dispute from future pay", () => {
  it("pays out everything when there is no debt", () => {
    expect(applyAdjustments(900, [])).toEqual({ payableCents: 900, consumed: [] });
  });

  it("consumes debt before anything is paid out", () => {
    const result = applyAdjustments(900, [adjustment({ remainingCents: 500 })]);
    expect(result.payableCents).toBe(400);
    expect(result.consumed).toEqual([{ id: "adj1", amountCents: 500 }]);
  });

  it("pays nothing, and only partially consumes the debt, when earnings are less than what's owed", () => {
    const result = applyAdjustments(300, [adjustment({ remainingCents: 2500 })]);
    expect(result.payableCents).toBe(0);
    expect(result.consumed).toEqual([{ id: "adj1", amountCents: 300 }]);
  });

  it("applies the oldest debt first when there is more than one", () => {
    const older = adjustment({ id: "adj-old", remainingCents: 200, createdAt: "2024-01-01T00:00:00.000Z" });
    const newer = adjustment({ id: "adj-new", remainingCents: 200, createdAt: "2024-02-01T00:00:00.000Z" });
    const result = applyAdjustments(300, [newer, older]);
    expect(result.consumed).toEqual([
      { id: "adj-old", amountCents: 200 },
      { id: "adj-new", amountCents: 100 },
    ]);
    expect(result.payableCents).toBe(0);
  });

  it("ignores an adjustment that has already been fully applied", () => {
    const result = applyAdjustments(900, [adjustment({ remainingCents: 0 })]);
    expect(result).toEqual({ payableCents: 900, consumed: [] });
  });
});

describe("outstandingClawbackCents", () => {
  it("sums every open adjustment's remaining balance", () => {
    expect(outstandingClawbackCents([
      adjustment({ id: "a", remainingCents: 500 }),
      adjustment({ id: "b", remainingCents: 300 }),
      adjustment({ id: "c", remainingCents: 0 }),
    ])).toBe(800);
  });

  it("is zero with nothing outstanding", () => {
    expect(outstandingClawbackCents([])).toBe(0);
  });
});
