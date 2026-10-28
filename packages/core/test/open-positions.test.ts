import { describe, expect, it } from "vitest";
import {
  ERRAND_MILEAGE_CENTS, ERRAND_TIERS, OPEN_POSITIONS, PA_HOURLY_RATE_CENTS, STAFF_ROLES,
  errandPayoutCents, openingsFor, payLabelFor,
} from "../src/index.ts";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

describe("what an applicant is told a role pays", () => {
  it("quotes the errand runner's real span, from the tiers", () => {
    const pays = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
    const label = payLabelFor("errand-runner");
    expect(label).toContain(usd(Math.min(...pays)));
    expect(label).toContain(usd(Math.max(...pays)));
    expect(label).toContain(usd(ERRAND_MILEAGE_CENTS));
  });

  it("quotes the assistant's hourly rate from the same constant bookings are priced with", () => {
    expect(payLabelFor("personal-assistant")).toContain(usd(PA_HOURLY_RATE_CENTS));
  });

  it("quotes every hourly role at its own rate and hours", () => {
    for (const role of STAFF_ROLES.filter((r) => r.hourlyCents > 0)) {
      const label = payLabelFor(role.id);
      expect(label, role.id).toContain(usd(role.hourlyCents));
      expect(label, role.id).toContain(String(role.prelaunchHoursPerWeek));
    }
  });

  it("has something honest to say for every role, never an empty string", () => {
    for (const role of STAFF_ROLES) expect(payLabelFor(role.id).trim().length, role.id).toBeGreaterThan(5);
  });
});

describe("how many people we are looking for", () => {
  it("states a whole-number target for every role", () => {
    for (const role of STAFF_ROLES) {
      expect(Number.isInteger(OPEN_POSITIONS[role.id]), role.id).toBe(true);
      expect(OPEN_POSITIONS[role.id], role.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("has every role open, at ownership's direction", () => {
    // Opening a role beyond the pre-launch cost plan (PRELAUNCH_HEADCOUNT) is
    // the owner's call, not an accident: the plan is a budget, this is the ask.
    for (const role of STAFF_ROLES) expect(OPEN_POSITIONS[role.id], role.id).toBeGreaterThan(0);
  });

  it("is hiring personal assistants first", () => {
    // They cover errands as well as staying with somebody, so they are the hire
    // that opens the service and carry the most seats.
    for (const role of STAFF_ROLES) {
      expect(OPEN_POSITIONS["personal-assistant"], role.id).toBeGreaterThanOrEqual(OPEN_POSITIONS[role.id]);
    }
  });

  it("counts down as people are hired, and never goes below zero", () => {
    expect(openingsFor("personal-assistant", 0)).toBe(OPEN_POSITIONS["personal-assistant"]);
    expect(openingsFor("personal-assistant", 1)).toBe(OPEN_POSITIONS["personal-assistant"] - 1);
    expect(openingsFor("personal-assistant", 99)).toBe(0);
    // A role stays at zero once it is filled, however many more are hired.
    expect(openingsFor("errand-runner", OPEN_POSITIONS["errand-runner"])).toBe(0);
    expect(openingsFor("errand-runner", 99)).toBe(0);
  });
});
