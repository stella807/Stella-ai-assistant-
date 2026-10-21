import { describe, expect, it } from "vitest";
import { applicantEmail, type ApplicantEmailKind } from "../src/applicant-email.ts";

describe("applicantEmail", () => {
  it("greets by first name and names the role, in English then Spanish", () => {
    const { subject, body } = applicantEmail({ kind: "received", name: "  Ana María Ortiz ", roleLabel: "Personal assistant" });
    expect(subject).toMatch(/received.*Recibimos/);
    expect(body.indexOf("Hi Ana,")).toBeLessThan(body.indexOf("Hola Ana:"));
    expect(body).toContain("Personal assistant");
  });

  it("never puts a password in a hiring email", () => {
    const { body } = applicantEmail({ kind: "hired", name: "Luis", roleLabel: "Driver" });
    expect(body).toMatch(/in person/);
    expect(body).not.toMatch(/password:/i);
  });

  it("has words for every outcome", () => {
    for (const kind of ["received", "under-review", "approved", "rejected", "hired"] as ApplicantEmailKind[]) {
      const { subject, body } = applicantEmail({ kind, name: "X", roleLabel: "Nurse" });
      expect(subject.length).toBeGreaterThan(5);
      expect(body).toContain("Nurse");
    }
  });
});
