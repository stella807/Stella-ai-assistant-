import { describe, expect, it } from "vitest";
import { canDelegateTo, runnerOf, whoDoesTheWork, type DelegationRunner } from "../src/delegation.ts";
import type { ConciergeTask } from "../src/concierge.ts";

const NOW = new Date("2026-12-05T15:00:00Z");
const task = (over: Partial<ConciergeTask> = {}): ConciergeTask => ({
  id: "t1", travelerId: "u1", category: "grab-something", note: "A juice", location: { lat: 18.4, lng: -66.1 },
  spendCapCents: 1000, serviceFeeCents: 478, assistantPayoutCents: 400, peopleCount: 1, status: "in-progress",
  provider: "Safehubby", assistantId: "pa1", chargeId: "c1", holdId: "h1", createdAt: NOW.toISOString(), ...over,
});
const runner = (over: Partial<DelegationRunner> = {}): DelegationRunner => ({
  id: "r1", role: "errand-runner", market: "puerto-rico", maxConcurrentCustomers: 2,
  categories: ["grab-something", "run-errand"], ...over,
});

describe("who does the work", () => {
  it("is the assistant the customer chose, until they hand it to a runner", () => {
    expect(whoDoesTheWork(task())).toBe("pa1");
    expect(whoDoesTheWork(task({ runnerId: "r1" }))).toBe("r1");
  });
  it("reads the runner off a task, if there is one", () => {
    expect(runnerOf(task())).toBeNull();
    expect(runnerOf(task({ runnerId: "r1", runnerName: "Kit" }))).toEqual({ id: "r1", name: "Kit" });
  });
});

describe("canDelegateTo", () => {
  const ok = { assistantMarket: "puerto-rico" as const, now: NOW, activeTasksFor: () => 0, onRoster: () => true };
  it("lets an assistant hand an errand to a runner in the same market with room", () => {
    expect(canDelegateTo(runner(), task(), ok)).toEqual({ ok: true });
  });
  it("refuses a task that is not still going", () => {
    expect(canDelegateTo(runner(), task({ status: "completed" }), ok)).toMatchObject({ ok: false });
  });
  it("refuses work the runner is not dispatched for — sitting with someone is never a runner's job", () => {
    expect(canDelegateTo(runner(), task({ category: "wait-with-someone" }), ok)).toMatchObject({ ok: false });
  });
  it("refuses a runner in another market, one off the roster, or one at capacity", () => {
    expect(canDelegateTo(runner({ market: "texas" }), task(), ok)).toMatchObject({ ok: false });
    expect(canDelegateTo(runner(), task(), { ...ok, onRoster: () => false })).toMatchObject({ ok: false });
    expect(canDelegateTo(runner(), task(), { ...ok, activeTasksFor: () => 2 })).toMatchObject({ ok: false });
  });
  it("refuses anyone who is not a runner", () => {
    expect(canDelegateTo(runner({ role: "secretary" }), task(), ok)).toMatchObject({ ok: false });
  });
  it("refuses handing a task to the assistant already on it", () => {
    expect(canDelegateTo(runner({ id: "pa1" }), task(), ok)).toMatchObject({ ok: false });
  });
});
