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

import { aircraftTypeName, projectPosition } from "../src/aircraft-tracking.ts";

describe("projectPosition", () => {
  it("goes nowhere at no speed or no time", () => {
    expect(projectPosition(18.4, -66, 90, 0, 60)).toEqual({ lat: expect.closeTo(18.4, 9), lng: expect.closeTo(-66, 9) });
    expect(projectPosition(18.4, -66, 90, 480, 0).lat).toBeCloseTo(18.4, 9);
  });
  it("moves a degree of latitude for every 60 nautical miles flown north", () => {
    const p = projectPosition(18, -66, 0, 600, 360); // 600 kt for 6 minutes = 60 nm
    expect(p.lat).toBeCloseTo(19, 2);
    expect(p.lng).toBeCloseTo(-66, 6);
  });
  it("heads east when the heading is 90°", () => {
    const p = projectPosition(18, -66, 90, 480, 60);
    expect(p.lng).toBeGreaterThan(-66);
    expect(p.lat).toBeCloseTo(18, 2);
  });
});

describe("aircraftTypeName", () => {
  it("names the jets people charter, and falls back to the code", () => {
    expect(aircraftTypeName("GLF6")).toBe("Gulfstream G650");
    expect(aircraftTypeName("c68a")).toBe("Citation Latitude");
    expect(aircraftTypeName("ZZZZ")).toBe("ZZZZ");
    expect(aircraftTypeName(undefined)).toBeUndefined();
  });
});
