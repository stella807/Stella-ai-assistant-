import { describe, expect, it } from "vitest";
import {
  ARMED_CUSTOMER_HOURLY_CENTS, ARMED_HOURLY_PAYOUT_CENTS, armedUntil, assistantPayoutFor, hireFromApplication,
  isArmedAvailable, isOnRoster, serviceFeeFor, submitStaffApplication, validateConciergeRequest,
  type Credential,
} from "../src/index.ts";

const NOW = new Date("2026-10-23T12:00:00Z");
const pdf = { base64: Buffer.from("%PDF-1.4 x").toString("base64"), mimeType: "application/pdf", fileName: "doc.pdf", uploadedAt: NOW.toISOString() };
const cred = (kind: Credential["kind"], expiresAt = "2027-06-01T00:00:00Z"): Credential =>
  ({ kind, number: "N-1", issuer: "Issuer", expiresAt, document: pdf });
const apply = (credentials: Credential[], role = "personal-assistant" as const) => submitStaffApplication({
  id: "s1", role, fullName: "Ana Ruiz", email: "ana@example.com", phone: "7875550142", city: "San Juan", state: "PR",
  experience: "Five years caring for elderly patients at home.", hoursPerWeek: 20, backgroundCheckConsent: true,
  credentials, now: NOW,
});
const approved = (credentials: Credential[]) => ({ ...apply(credentials), status: "approved" as const });

describe("insurance and licences for field work", () => {
  it("requires the applicant's own liability insurance, current and documented", () => {
    expect(() => apply([])).toThrow(/liability insurance/i);
    expect(() => apply([cred("liability-insurance", "2026-01-01T00:00:00Z")])).toThrow(/expired/i);
    expect(() => apply([{ ...cred("liability-insurance"), document: { ...pdf, base64: "" } }])).toThrow(/attach a copy/i);
    expect(apply([cred("liability-insurance")]).credentials).toHaveLength(1);
  });

  it("asks for both the firearms and the guard licence, never one alone", () => {
    expect(() => apply([cred("liability-insurance"), cred("firearms-license")])).toThrow(/both/i);
    expect(apply([cred("liability-insurance"), cred("firearms-license"), cred("guard-license")]).credentials).toHaveLength(3);
  });

  it("clears for armed work until the earlier licence expires, and only when asked", () => {
    const creds = [cred("liability-insurance"), cred("firearms-license", "2027-03-01T00:00:00Z"), cred("guard-license")];
    expect(armedUntil(creds, NOW)).toBe("2027-03-01T00:00:00Z");
    const plain = hireFromApplication({ id: "a1", application: approved(creds), market: "puerto-rico", now: NOW });
    expect(isArmedAvailable(plain, NOW)).toBe(false);
    const armed = hireFromApplication({ id: "a2", application: approved(creds), market: "puerto-rico", armed: true, now: NOW });
    expect(isArmedAvailable(armed, NOW)).toBe(true);
    expect(isArmedAvailable(armed, new Date("2027-04-01T00:00:00Z"))).toBe(false);
    expect(() => hireFromApplication({ id: "a3", application: approved([cred("liability-insurance")]), market: "puerto-rico", armed: true, now: NOW }))
      .toThrow(/firearms licence/i);
  });

  it("takes somebody off the roster when their insurance runs out", () => {
    const a = hireFromApplication({ id: "a1", application: approved([cred("liability-insurance", "2027-01-01T00:00:00Z")]), market: "puerto-rico", now: NOW });
    expect(isOnRoster(a, NOW)).toBe(true);
    expect(isOnRoster(a, new Date("2027-01-02T00:00:00Z"))).toBe(false);
  });

  it("prices armed work on its own rates, and refuses it for a hospital stay or an errand", () => {
    expect(serviceFeeFor("wait-with-someone", false, 1, 2, false, true)).toBe(2 * ARMED_CUSTOMER_HOURLY_CENTS);
    expect(assistantPayoutFor("check-in-person", false, 1, 1, false, true)).toBe(ARMED_HOURLY_PAYOUT_CENTS);
    const base = { note: "Please wait with my sister", location: { lat: 18.45, lng: -66.07 }, spendCapCents: 2000, acknowledgedDisclosures: true };
    expect(() => validateConciergeRequest({ ...base, category: "wait-with-someone", hours: 2, armed: true, hospitalStay: true } as never)).toThrow(/firearms/i);
    expect(() => validateConciergeRequest({ ...base, category: "run-errand", armed: true } as never)).toThrow(/armed/i);
  });
});
