import { describe, expect, it } from "vitest";
import { canEmail, composeEmail, optOutEmail, registerEmailContact } from "../src/email-alerts.ts";

const now = new Date("2026-12-05T12:00:00Z");

describe("email alerts", () => {
  it("refuses an address without consent", () => {
    expect(() => registerEmailContact({ email: "a@b.co", consent: false, language: "en", now })).toThrow(/agree/i);
  });

  it("refuses an address that is not one", () => {
    expect(() => registerEmailContact({ email: "not-an-email", consent: true, language: "en", now })).toThrow(/email/i);
  });

  it("stores a normalised address with the moment of consent", () => {
    const c = registerEmailContact({ email: "  Maria@Example.COM ", consent: true, language: "es", now });
    expect(c).toEqual({ email: "maria@example.com", language: "es", consentedAt: now.toISOString() });
    expect(canEmail(c)).toBe(true);
  });

  it("stops at once on opt-out", () => {
    const c = registerEmailContact({ email: "a@b.co", consent: true, language: "en", now });
    expect(canEmail(optOutEmail(c, now))).toBe(false);
    expect(canEmail(undefined)).toBe(false);
  });

  it("writes the same discreet message as the text, with a subject, and no place, amount or link", () => {
    const m = composeEmail("customer-spend-request", { name: "Camila" }, "en");
    expect(m.subject).toMatch(/Safehubby/);
    expect(m.body).toContain("Camila is asking you to approve a purchase");
    expect(m.body).not.toMatch(/https?:|\$\d/);
  });

  it("speaks Spanish when asked", () => {
    expect(composeEmail("guardian-sos", { name: "Ana" }, "es").body).toContain("activó un SOS");
  });
});
