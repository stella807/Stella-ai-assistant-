import { describe, expect, it } from "vitest";
import { teamActivity } from "../src/team-activity.ts";
import type { ConciergeTask } from "../src/concierge.ts";
import type { HiredAssistant } from "../src/roster.ts";
import type { PickupRequest } from "../src/ride-coordination.ts";

const NOW = new Date("2026-06-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const person = (id: string, name: string, role: HiredAssistant["role"] = "personal-assistant", over: Partial<HiredAssistant> = {}) =>
  ({ id, applicationId: `app_${id}`, name, role, market: "san-juan", categories: [], maxConcurrentCustomers: 2,
    hiredAt: hoursAgo(24 * 60), ...over }) as HiredAssistant;

const task = (over: Partial<ConciergeTask> = {}): ConciergeTask => ({
  id: "ct1", travelerId: "usr1", category: "grab-something", note: "Grab a burger",
  location: { lat: 18.4, lng: -66.0, label: "Condado" }, spendCapCents: 2500,
  serviceFeeCents: 1125, assistantPayoutCents: 900, peopleCount: 1,
  status: "in-progress", provider: "Nearby Aide", assistantId: "a1", assistantName: "Ana",
  createdAt: hoursAgo(1), ...over,
} as ConciergeTask);

describe("teamActivity", () => {
  it("shows who is on a job, as lead or runner, and who is free", () => {
    const r = teamActivity({
      assistants: [person("a1", "Ana"), person("r1", "Rui", "errand-runner"), person("b1", "Bea")],
      tasks: [task({ runnerId: "r1", runnerName: "Rui" })], now: NOW,
    });
    const by = Object.fromEntries(r.members.map((m) => [m.id, m]));
    expect(by.a1!.status).toBe("on-job");
    expect(by.a1!.current[0]).toMatchObject({ as: "assistant", place: "Condado" });
    expect(by.r1!.current[0]).toMatchObject({ as: "runner" });
    expect(by.b1!.status).toBe("available");
    expect(r.counts).toEqual({ onJob: 2, available: 1, offRoster: 0 });
  });

  it("credits finished work, unpaid pay and disputes to whoever did it", () => {
    const r = teamActivity({
      assistants: [person("a1", "Ana"), person("r1", "Rui", "errand-runner")],
      tasks: [
        task({ id: "t1", status: "completed", completedAt: hoursAgo(2), runnerId: "r1", disputed: true }),
        task({ id: "t2", status: "completed", completedAt: hoursAgo(24 * 5), payoutId: "po1" }),
        task({ id: "t3", status: "canceled", declinedByAssistant: true, completedAt: hoursAgo(3) }),
      ], now: NOW,
    });
    const by = Object.fromEntries(r.members.map((m) => [m.id, m]));
    expect(by.r1).toMatchObject({ doneLastDay: 1, doneLast14Days: 1, disputed: 1, unpaidCents: 900 });
    expect(by.a1).toMatchObject({ doneLastDay: 0, doneLast14Days: 1, declined: 1, unpaidCents: 0 });
  });

  it("feeds purchases and completions newest first", () => {
    const r = teamActivity({
      assistants: [person("a1", "Ana")],
      tasks: [task({
        status: "completed", createdAt: hoursAgo(3), completedAt: hoursAgo(1),
        spendRequests: [{ id: "s1", amountCents: 1500, note: "Pharmacy", status: "approved", createdAt: hoursAgo(2), decidedAt: hoursAgo(1.5) }],
      } as Partial<ConciergeTask>)], now: NOW,
    });
    expect(r.events.map((e) => e.kind)).toEqual(["completed", "purchase-approved", "purchase-requested", "assigned"]);
    expect(r.events[1]).toMatchObject({ memberName: "Ana", amountCents: 1500 });
  });

  it("tracks drivers through their pickups, and people off the roster last", () => {
    const pickup = { id: "p1", travelerId: "u", pickup: { lat: 1, lng: 1, label: "Airport" }, dropoff: { lat: 2, lng: 2 },
      status: "coordinated", driverId: "d1", driverName: "Dan", createdAt: hoursAgo(2), coordinatedAt: hoursAgo(1) } as PickupRequest;
    const r = teamActivity({
      assistants: [person("x1", "Xen", "personal-assistant", { activeUntil: hoursAgo(5) } as Partial<HiredAssistant>)],
      tasks: [], drivers: [{ id: "d1", name: "Dan" }], pickups: [pickup], now: NOW,
    });
    expect(r.members.map((m) => [m.id, m.status])).toEqual([["d1", "on-job"], ["x1", "off-roster"]]);
    expect(r.members[0]!.current[0]).toMatchObject({ kind: "pickup", place: "Airport" });
  });
});
