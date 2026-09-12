import { describe, expect, it } from "vitest";
import {
  ROLE_CATEGORIES, categoriesForRole, hireFromApplication, isFieldRole, isOnRoster,
  roleCovers, rosterFor, standDown, type HiredAssistant,
} from "../src/roster.ts";
import { STAFF_ROLES } from "../src/staffing.ts";
import { ASSISTANT_MAX_CAPACITY, CONCIERGE_CATEGORIES } from "../src/concierge.ts";

const now = new Date("2026-12-05T18:00:00Z");

const approved = (over: Record<string, unknown> = {}) => ({
  id: "sa1", role: "personal-assistant" as const, fullName: "Rosa Delgado",
  status: "approved", hoursPerWeek: 20, ...over,
});

const hire = (over: Record<string, unknown> = {}) => hireFromApplication({
  id: "asst1", application: approved() as never, market: "texas", now, ...over,
});

describe("what each role may be sent to", () => {
  it("gives a personal assistant every category, an errand runner only the errands", () => {
    expect(categoriesForRole("personal-assistant").sort())
      .toEqual(CONCIERGE_CATEGORIES.map((c) => c.id).sort());
    expect(categoriesForRole("errand-runner").sort()).toEqual(["grab-something", "run-errand"]);
  });

  it("never sends an errand runner to wait with or check on someone", () => {
    /**
     * The line this module exists to draw. An errand runner is hired to
     * fetch a thing. The moment the job is sitting with a stranger who has
     * had too much and judging whether they need an ambulance, it is a
     * different job with a different duty of care — and sending the cheapest
     * available person to it would be the most consequential shortcut here.
     */
    expect(roleCovers("errand-runner", "wait-with-someone")).toBe(false);
    expect(roleCovers("errand-runner", "check-in-person")).toBe(false);
    expect(roleCovers("personal-assistant", "wait-with-someone")).toBe(true);
    expect(roleCovers("personal-assistant", "check-in-person")).toBe(true);
  });

  it("sends neither a secretary nor a driver to a concierge task", () => {
    for (const role of ["secretary", "driver"] as const) {
      expect(categoriesForRole(role)).toEqual([]);
      expect(isFieldRole(role)).toBe(false);
      for (const c of CONCIERGE_CATEGORIES) expect(roleCovers(role, c.id)).toBe(false);
    }
  });

  it("has a decision for every role the company hires", () => {
    for (const role of STAFF_ROLES) expect(ROLE_CATEGORIES[role.id]).toBeDefined();
  });
});

describe("hiring somebody onto the roster", () => {
  it("turns an approved application into somebody dispatchable", () => {
    const a = hire();
    expect(a.name).toBe("Rosa Delgado");
    expect(a.applicationId).toBe("sa1");
    expect(a.market).toBe("texas");
    expect(a.categories).toEqual(categoriesForRole("personal-assistant"));
    expect(a.hiredAt).toBe(now.toISOString());
    expect(isOnRoster(a, now)).toBe(true);
  });

  it("refuses anything that has not been approved — hired never runs ahead of reviewed", () => {
    for (const status of ["submitted", "under-review", "rejected", "withdrawn"]) {
      expect(() => hire({ application: approved({ status }) }))
        .toThrow(/approved application/i);
    }
  });

  it("refuses a role that takes no concierge work", () => {
    // A secretary belongs on payroll, not on a dispatch roster — putting one
    // there would offer a customer somebody never vetted for going to an
    // address.
    expect(() => hire({ application: approved({ role: "secretary" }) }))
      .toThrow(/does not take concierge tasks/i);
  });

  it("bounds capacity to what an assistant said they were comfortable with", () => {
    expect(hire({ maxConcurrentCustomers: 3 }).maxConcurrentCustomers).toBe(3);
    expect(() => hire({ maxConcurrentCustomers: 0 })).toThrow(/capacity/i);
    expect(() => hire({ maxConcurrentCustomers: ASSISTANT_MAX_CAPACITY + 1 })).toThrow(/capacity/i);
    expect(() => hire({ maxConcurrentCustomers: 1.5 })).toThrow(/capacity/i);
  });

  it("starts at one customer at a time unless told otherwise", () => {
    expect(hire().maxConcurrentCustomers).toBe(1);
  });
});

describe("who gets offered for a task", () => {
  const roster: HiredAssistant[] = [
    hire({ id: "pa-tx" }),
    hire({ id: "pa-la", market: "los-angeles" }),
    hire({ id: "runner-tx", application: approved({ id: "sa2", role: "errand-runner", fullName: "Kit" }) }),
  ];

  it("offers only people who work this market", () => {
    const found = rosterFor(roster, { category: "grab-something", market: "texas", now });
    expect(found.map((a) => a.id).sort()).toEqual(["pa-tx", "runner-tx"]);
  });

  it("offers only people whose role covers the task", () => {
    const found = rosterFor(roster, { category: "wait-with-someone", market: "texas", now });
    expect(found.map((a) => a.id)).toEqual(["pa-tx"]);
  });

  it("stops offering somebody who has been stood down", () => {
    const gone = roster.map((a) => (a.id === "pa-tx" ? standDown(a, now) : a));
    const later = new Date(now.getTime() + 60_000);
    expect(rosterFor(gone, { category: "wait-with-someone", market: "texas", now: later })).toEqual([]);
  });

  it("keeps a stood-down record rather than deleting it", () => {
    // They are still attached to every task they worked and the pay owed for
    // it, so the row has to survive them leaving.
    const stood = standDown(roster[0]!, now);
    expect(stood.id).toBe(roster[0]!.id);
    expect(stood.activeUntil).toBe(now.toISOString());
    expect(isOnRoster(stood, new Date(now.getTime() - 1))).toBe(true);
    expect(isOnRoster(stood, new Date(now.getTime() + 1))).toBe(false);
  });

  it("offers nobody when the roster is empty, rather than falling back to anyone", () => {
    expect(rosterFor([], { category: "grab-something", market: "texas", now })).toEqual([]);
  });
});
