import { describe, expect, it } from "vitest";
import { TEXT_ALERT_KINDS, canText, composeText, normalizePhone, optOut, registerTextContact } from "../src/sms.ts";

const T0 = new Date("2026-12-05T15:00:00Z");

describe("normalizePhone", () => {
  it("accepts a Puerto Rico or US number however it is typed", () => {
    for (const raw of ["787-555-0142", "(787) 555 0142", "787.555.0142", "17875550142", "+1 787 555 0142"]) {
      expect(normalizePhone(raw), raw).toBe("+17875550142");
    }
  });
  it("accepts an international number written with its +", () => {
    expect(normalizePhone("+34 612 345 678")).toBe("+34612345678");
  });
  it("refuses what cannot be a phone number", () => {
    for (const raw of ["", "abc", "555-0142", "12345", "+1 787 555", "0017875550142x", "787-555-0142 ext 5"]) {
      expect(normalizePhone(raw), raw).toBeNull();
    }
  });
});

describe("consent", () => {
  it("will not register a number without the person agreeing to texts", () => {
    expect(() => registerTextContact({ phone: "787-555-0142", consent: false, language: "en", now: T0 })).toThrow(/agree/i);
  });
  it("registers a consenting person with the time they agreed", () => {
    const c = registerTextContact({ phone: "787-555-0142", consent: true, language: "es", now: T0 });
    expect(c).toMatchObject({ phone: "+17875550142", language: "es", consentedAt: T0.toISOString() });
    expect(canText(c)).toBe(true);
  });
  it("stops texting the moment someone opts out", () => {
    const c = registerTextContact({ phone: "787-555-0142", consent: true, language: "en", now: T0 });
    expect(canText(optOut(c, T0))).toBe(false);
  });
  it("never texts someone who was never registered", () => {
    expect(canText(undefined)).toBe(false);
  });
  it("defaults an unknown language to English", () => {
    expect(registerTextContact({ phone: "787-555-0142", consent: true, language: "fr" as never, now: T0 }).language).toBe("en");
  });
});

describe("composeText", () => {
  it("has a message in both languages for every kind of alert", () => {
    for (const kind of TEXT_ALERT_KINDS) {
      for (const language of ["en", "es"] as const) {
        const body = composeText(kind, { name: "María" }, language);
        expect(body, `${kind}/${language}`).toMatch(/^Safehubby/);
        expect(body.length, `${kind}/${language}`).toBeLessThanOrEqual(160);
      }
    }
  });
  it("names the person involved where that helps", () => {
    expect(composeText("customer-reply", { name: "Luis" }, "en")).toContain("Luis");
    expect(composeText("guardian-sos", { name: "María" }, "es")).toContain("María");
  });
  it("keeps a lock-screen text free of locations, amounts and medical detail", () => {
    for (const kind of TEXT_ALERT_KINDS) {
      const body = composeText(kind, { name: "María" }, "en");
      expect(body, kind).not.toMatch(/\$\d|hospital|lat|lng|\d{2,}\.\d{3,}/i);
    }
  });
  it("strips line breaks and control characters out of a name before it goes into a text", () => {
    const body = composeText("customer-reply", { name: "Lu\nis\u0007 http://evil.example" }, "en");
    expect([...body].some((ch) => ch.charCodeAt(0) < 32)).toBe(false);
    expect(body).not.toMatch(/http|:\/\//i);
  });
});
