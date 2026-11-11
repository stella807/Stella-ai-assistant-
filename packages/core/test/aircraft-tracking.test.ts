import { describe, expect, it } from "vitest";
import { aircraftState, knotsToMph, normalizeTailNumber, type AircraftFix } from "../src/aircraft-tracking.ts";

describe("normalizeTailNumber", () => {
  it("accepts the ways people type a registration and tidies them up", () => {
    expect(normalizeTailNumber("n123ab")).toBe("N123AB");
    expect(normalizeTailNumber(" N 123 AB ")).toBe("N123AB");
    expect(normalizeTailNumber("hb-jfn")).toBe("HB-JFN");
    expect(normalizeTailNumber("VP-CTO")).toBe("VP-CTO");
  });
  it("turns away things that cannot be a registration", () => {
    for (const bad of ["", "N", "12345", "N123AB; DROP", "../etc", "ABCDEFGHIJKLM", "-N123"]) {
      expect(normalizeTailNumber(bad)).toBeNull();
    }
  });
});

describe("aircraftState", () => {
  const fix = (over: Partial<AircraftFix>): AircraftFix => ({ tailNumber: "N1", onGround: false, seenSecondsAgo: 5, privacyLimited: false, ...over });
  it("is airborne or on the ground while it is being heard", () => {
    expect(aircraftState(fix({}))).toBe("airborne");
    expect(aircraftState(fix({ onGround: true }))).toBe("on-ground");
  });
  it("is only last-seen once it has gone quiet", () => {
    expect(aircraftState(fix({ seenSecondsAgo: 300 }))).toBe("last-seen");
  });
  it("says nothing about where it is when the owner has limited tracking", () => {
    expect(aircraftState(fix({ privacyLimited: true }))).toBe("private");
  });
});

describe("knotsToMph", () => {
  it("converts and rounds", () => {
    expect(knotsToMph(450)).toBe(518);
    expect(knotsToMph(0)).toBe(0);
  });
});
