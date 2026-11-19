import { describe, expect, it } from "vitest";
import {
  ERRAND_MILEAGE_CENTS, ERRAND_TIERS, OPEN_POSITIONS, PA_HOURLY_RATE_CENTS, STAFF_ROLES,
  errandPayoutCents, openingsFor, payLabelFor, requirementsFor, requirementsLine,
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
      if (role.prelaunchHoursPerWeek > 0) expect(label, role.id).toContain(String(role.prelaunchHoursPerWeek));
    }
  });

  it("never promises 'about 0 hours a week': a role with no set hours is paid by the hour as work comes in", () => {
    for (const role of STAFF_ROLES.filter((r) => r.hourlyCents > 0 && r.prelaunchHoursPerWeek === 0)) {
      for (const lang of ["en", "es"] as const) {
        const label = payLabelFor(role.id, lang);
        expect(label, `${role.id} ${lang}`).not.toMatch(/\b0 (hours|horas)/);
      }
    }
    expect(payLabelFor("supervisor", "es")).toContain("según haya trabajo");
    expect(payLabelFor("supervisor", "en")).toContain("as work comes in");
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

describe("what an applicant is told they need", () => {
  const FIELD = ["personal-assistant", "caretaker", "errand-runner", "bodyguard"] as const;

  it("asks everyone who goes out to customers for the same four things, in English and Spanish", () => {
    for (const role of FIELD) {
      const en = requirementsLine(role, "en");
      expect(en, role).toContain("Certificado de Antecedentes Penales");
      expect(en, role).toMatch(/CPR certification, or a security-guard license/);
      expect(en, role).toMatch(/customer service/i);
      expect(en, role).toMatch(/older adults/i);
      const es = requirementsLine(role, "es");
      expect(es, role).toContain("Certificado de Antecedentes Penales");
      expect(es, role).toMatch(/certificaci[oó]n de RCP, o una licencia de guardia de seguridad/);
      expect(es, role).toMatch(/servicio al cliente/i);
      expect(es, role).toMatch(/personas mayores/i);
      expect(requirementsFor(role, "es").length, role).toBe(requirementsFor(role, "en").length);
    }
  });

  it("asks for firearms licenses only for armed work: a bodyguard, never an assistant, a caretaker or an errand runner", () => {
    expect(requirementsLine("bodyguard", "en")).toMatch(/firearms license/i);
    expect(requirementsLine("bodyguard", "es")).toMatch(/licencia de armas/i);
    for (const role of ["personal-assistant", "caretaker", "errand-runner"] as const) {
      expect(requirementsLine(role, "en"), role).not.toMatch(/firearm/i);
      expect(requirementsLine(role, "es"), role).not.toMatch(/arma/i);
    }
  });

  it("never screens anyone by a mental-health history: the only such rule is the firearms licence's own, which is the licensing authority's", () => {
    for (const role of STAFF_ROLES) for (const lang of ["en", "es"] as const) {
      expect(requirementsLine(role.id, lang), `${role.id} ${lang}`).not.toMatch(/mental|psychiatr|psicol|salud mental/i);
    }
  });

  it("asks desk and professional jobs only for the background-check consent and a note, not CPR or customer-facing experience", () => {
    for (const role of ["web-developer", "lawyer", "secretary", "physician"] as const) {
      const en = requirementsLine(role, "en");
      expect(en, role).toMatch(/background check/i);
      expect(en, role).not.toMatch(/CPR|older adults|Certificado/);
    }
  });

  it("is a plain list of sentences with no price in it, so it cannot go stale", () => {
    for (const role of STAFF_ROLES) for (const line of requirementsFor(role.id, "en")) {
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toMatch(/\$\d/);
    }
  });
});
