import { describe, expect, it } from "vitest";
import { SENIOR_MIN_AGE, ageOn, isSeniorEligible, validateSeniorId } from "../src/index.ts";

const now = new Date("2026-10-23T12:00:00Z");
const doc = { base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString("base64"), mimeType: "image/jpeg", fileName: "id.jpg", uploadedAt: now.toISOString() };

describe("senior ID for Basic", () => {
  it("counts whole years, not yet a birthday this year", () => {
    expect(ageOn("1961-10-23", now)).toBe(65);
    expect(ageOn("1961-10-24", now)).toBe(64);
    expect(ageOn("1961-02-30", now)).toBeNaN();
  });

  it(`accepts ${SENIOR_MIN_AGE} and over with an ID attached`, () => {
    expect(() => validateSeniorId({ birthDate: "1950-05-01", document: doc }, now)).not.toThrow();
    expect(() => validateSeniorId({ birthDate: "1970-05-01", document: doc }, now)).toThrow(/65 and over/);
    expect(() => validateSeniorId({ birthDate: "1950-05-01", document: { ...doc, base64: "" } }, now)).toThrow(/ID/);
    expect(() => validateSeniorId({ birthDate: "someday", document: doc }, now)).toThrow(/date of birth/);
  });

  it("opens on submission and closes on rejection", () => {
    const check = { birthDate: "1950-05-01", document: doc, submittedAt: now.toISOString() };
    expect(isSeniorEligible(undefined)).toBe(false);
    expect(isSeniorEligible({ ...check, status: "submitted" })).toBe(true);
    expect(isSeniorEligible({ ...check, status: "approved" })).toBe(true);
    expect(isSeniorEligible({ ...check, status: "rejected" })).toBe(false);
  });
});
