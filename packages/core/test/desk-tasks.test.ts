import { describe, expect, it } from "vitest";
import {
  DESK_TASK_ACCESS_RULE, DESK_TASK_KINDS, MAX_DESK_TASK_LENGTH, countsTowardAllowance,
  deskTasksUsedIn, findDeskTaskKind, monthBoundsFor, remainingDeskTasks, validateDeskTask,
  type DeskTask,
} from "../src/desk-tasks.ts";
import { PLANS, deskTaskAllowanceFor, hasFeature } from "../src/billing.ts";

const task = (over: Partial<DeskTask> = {}): DeskTask => ({
  id: "d1", travelerId: "usr1", kind: "appointment", note: "Book the dentist",
  status: "open", createdAt: "2027-03-10T12:00:00.000Z", ...over,
});

describe("what a desk task is", () => {
  it("covers the things people actually mean by an assistant", () => {
    const ids = DESK_TASK_KINDS.map((k) => k.id);
    expect(ids).toContain("appointment");
    expect(ids).toContain("reminder");
    expect(ids).toContain("message");
  });

  it("rejects an unknown kind rather than guessing", () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => findDeskTaskKind("teleport")).toThrow(/unknown desk task/i);
  });

  it("needs something to act on, and bounds it", () => {
    expect(() => validateDeskTask({ kind: "reminder", note: "" })).toThrow(/say what you need/i);
    expect(() => validateDeskTask({ kind: "reminder", note: "   " })).toThrow(/say what you need/i);
    expect(() => validateDeskTask({ kind: "reminder", note: "x".repeat(MAX_DESK_TASK_LENGTH + 1) }))
      .toThrow(new RegExp(`under ${MAX_DESK_TASK_LENGTH}`, "i"));
    expect(() => validateDeskTask({ kind: "reminder", note: "Mum's birthday, 4 June" })).not.toThrow();
  });

  it("never carries money, because a task that spends money is a booking", () => {
    // The type is the enforcement. A desk task has nowhere to put a hold, a
    // charge or a spend cap — if this stops compiling, something has grown a
    // way to spend the customer's money without the machinery that caps it.
    const keys = Object.keys(task());
    for (const forbidden of ["chargeId", "holdId", "spendCapCents", "card"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("promises that nobody signs in as the customer", () => {
    // "Send an email for me" has an obvious implementation that is also the
    // worst idea available: hold somebody's mailbox credentials. This is the
    // test that stops it being quietly reintroduced as a convenience.
    expect(DESK_TASK_ACCESS_RULE).toMatch(/never signs in as you/i);
    expect(DESK_TASK_ACCESS_RULE).toMatch(/on your behalf/i);
  });
});

describe("the monthly allowance", () => {
  it("is included on every paid plan and absent on the free one", () => {
    expect(hasFeature("free", "desk-tasks")).toBe(false);
    expect(deskTaskAllowanceFor("free")).toBe(0);
    for (const plan of PLANS.filter((p) => p.monthlyCents > 0)) {
      expect(hasFeature(plan.id, "desk-tasks"), plan.id).toBe(true);
      expect(deskTaskAllowanceFor(plan.id), plan.id).toBeGreaterThan(0);
    }
  });

  it("never shrinks as the plan gets dearer", () => {
    const paid = PLANS.filter((p) => p.monthlyCents > 0).sort((a, b) => a.monthlyCents - b.monthlyCents);
    for (let i = 1; i < paid.length; i++) {
      expect(deskTaskAllowanceFor(paid[i]!.id), paid[i]!.id)
        .toBeGreaterThanOrEqual(deskTaskAllowanceFor(paid[i - 1]!.id));
    }
  });

  it("is finite on every plan, including the dearest", () => {
    // A real person does each of these. "Unlimited" would be a promise the
    // roster cannot keep, discovered by the customer at the point of refusal.
    for (const plan of PLANS) {
      expect(Number.isFinite(deskTaskAllowanceFor(plan.id)), plan.id).toBe(true);
    }
  });

  it("counts what was asked for, and forgives what was cancelled", () => {
    expect(countsTowardAllowance(task({ status: "open" }))).toBe(true);
    expect(countsTowardAllowance(task({ status: "done" }))).toBe(true);
    // Nobody worked it, so it should not cost a slot.
    expect(countsTowardAllowance(task({ status: "cancelled" }))).toBe(false);
  });

  it("counts this month only, and resets on the first", () => {
    const now = new Date("2027-03-14T09:00:00.000Z");
    const { start, end } = monthBoundsFor(now);
    expect(start.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-04-01T00:00:00.000Z");

    const tasks = [
      task({ id: "a", createdAt: "2027-02-28T23:59:59.000Z" }), // last month
      task({ id: "b", createdAt: "2027-03-01T00:00:00.000Z" }), // first moment of this one
      task({ id: "c", createdAt: "2027-03-14T09:00:00.000Z" }),
      task({ id: "d", createdAt: "2027-03-31T23:59:59.000Z" }),
      task({ id: "e", createdAt: "2027-04-01T00:00:00.000Z" }), // next month
      task({ id: "f", createdAt: "2027-03-15T09:00:00.000Z", status: "cancelled" }),
    ];
    expect(deskTasksUsedIn(tasks, start, end)).toBe(3);
  });

  it("reports what is left without ever going negative", () => {
    expect(remainingDeskTasks(10, 3)).toBe(7);
    expect(remainingDeskTasks(10, 10)).toBe(0);
    // An allowance that dropped mid-month must not render as "-2 left".
    expect(remainingDeskTasks(10, 12)).toBe(0);
  });
});
