import { describe, expect, it } from "vitest";
import {
  reviewStaffApplication, submitStaffApplication, withdrawStaffApplication,
} from "../src/staff-applications.ts";

const now = new Date("2026-10-05T12:00:00Z");

const input = (over: Partial<Parameters<typeof submitStaffApplication>[0]> = {}) => ({
  id: "sa1",
  role: "personal-assistant" as const,
  fullName: "Rosa Delgado",
  email: "Rosa@Example.COM",
  phone: "(212) 555-0147",
  city: "Hoboken",
  state: "nj",
  experience: "Six years as a home health aide, plus weekend shifts at a community shelter.",
  hoursPerWeek: 20,
  backgroundCheckConsent: true,
  now,
  ...over,
});

describe("applying for a non-driving role", () => {
  it("accepts a complete application and normalizes it", () => {
    const app = submitStaffApplication(input());
    expect(app.status).toBe("submitted");
    expect(app.email).toBe("rosa@example.com");
    expect(app.state).toBe("NJ");
    expect(app.phone).toBe("2125550147");
    expect(app.submittedAt).toBe(now.toISOString());
  });

  it("covers each of the roles being hired", () => {
    for (const role of ["personal-assistant", "errand-runner", "secretary"] as const) {
      expect(submitStaffApplication(input({ role })).role).toBe(role);
    }
  });

  it("sends drivers to the driver form instead of taking an application with no vehicle", () => {
    expect(() => submitStaffApplication(input({ role: "driver" })))
      .toThrow(/driver application/i);
  });

  it("refuses a role that is not a job here", () => {
    expect(() => submitStaffApplication(input({ role: "astronaut" as never })))
      .toThrow(/unknown staff role/i);
  });
});

describe("what the form insists on", () => {
  it("names the field that is wrong, since the applicant has no account to fall back on", () => {
    expect(() => submitStaffApplication(input({ fullName: "R" }))).toThrow(/full name/i);
    expect(() => submitStaffApplication(input({ email: "nope" }))).toThrow(/email/i);
    expect(() => submitStaffApplication(input({ phone: "555" }))).toThrow(/phone/i);
    expect(() => submitStaffApplication(input({ city: "  " }))).toThrow(/city/i);
    expect(() => submitStaffApplication(input({ state: "" }))).toThrow(/state/i);
    expect(() => submitStaffApplication(input({ experience: "none" }))).toThrow(/experience/i);
  });

  it("wants real availability, not zero and not a hundred hours", () => {
    expect(() => submitStaffApplication(input({ hoursPerWeek: 0 }))).toThrow(/hours a week/i);
    expect(() => submitStaffApplication(input({ hoursPerWeek: -5 }))).toThrow(/hours a week/i);
    expect(() => submitStaffApplication(input({ hoursPerWeek: 100 }))).toThrow(/80 hours/i);
    expect(submitStaffApplication(input({ hoursPerWeek: 80 })).hoursPerWeek).toBe(80);
  });

  it("requires background-check consent — this is in-person work with vulnerable people", () => {
    expect(() => submitStaffApplication(input({ backgroundCheckConsent: false })))
      .toThrow(/background check/i);
  });
});

describe("review, on the same pipeline as drivers", () => {
  const app = submitStaffApplication(input());
  const later = new Date(now.getTime() + 86_400_000);

  it("will not approve anything sight-unseen", () => {
    expect(() => reviewStaffApplication(app, "approved", later))
      .toThrow(/under-review before approving/i);
  });

  it("approves after a look, and records who said so and when", () => {
    const seen = reviewStaffApplication(app, "under-review", later);
    const ok = reviewStaffApplication(seen, "approved", later, "  References checked.  ");
    expect(ok.status).toBe("approved");
    expect(ok.reviewedAt).toBe(later.toISOString());
    expect(ok.reviewerNote).toBe("References checked.");
  });

  it("lets an applicant withdraw, and then nobody can review it", () => {
    const gone = withdrawStaffApplication(app, later);
    expect(gone.status).toBe("withdrawn");
    expect(() => reviewStaffApplication(gone, "under-review", later)).toThrow(/withdrawn/i);
    expect(() => withdrawStaffApplication(gone, later)).toThrow(/already withdrawn/i);
  });

  it("can reopen a decided application, because people appeal", () => {
    const seen = reviewStaffApplication(app, "under-review", later);
    const no = reviewStaffApplication(seen, "rejected", later);
    expect(reviewStaffApplication(no, "under-review", later).status).toBe("under-review");
  });
});
