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

import { isSharedFlightCurrent, readTrackedAircraft } from "../src/aircraft-tracking.ts";

describe("readTrackedAircraft", () => {
  const now = new Date("2026-11-11T20:00:00Z");
  it("tidies what an assistant typed", () => {
    const r = readTrackedAircraft({ tailNumber: " n650gx ", from: "sju", to: "Teterboro, NJ", departsAt: "2026-11-12T19:40:00Z" }, now);
    expect(r).toEqual({ ok: true, value: { tailNumber: "N650GX", from: "SJU", to: "Teterboro, NJ", departsAt: "2026-11-12T19:40:00.000Z", sharedAt: now.toISOString() } });
  });
  it("needs only the tail number", () => {
    expect(readTrackedAircraft({ tailNumber: "N650GX" }, now)).toEqual({ ok: true, value: { tailNumber: "N650GX", sharedAt: now.toISOString() } });
  });
  it("says what to fix", () => {
    expect(readTrackedAircraft({ tailNumber: "123" }, now)).toMatchObject({ ok: false, error: expect.stringMatching(/tail number/) });
    expect(readTrackedAircraft({ tailNumber: "N1", from: "<script>" }, now)).toMatchObject({ ok: false, error: expect.stringMatching(/leaves from/) });
    expect(readTrackedAircraft({ tailNumber: "N1", departsAt: "tomorrow-ish" }, now)).toMatchObject({ ok: false, error: expect.stringMatching(/date and time/) });
    expect(readTrackedAircraft(null, now).ok).toBe(false);
  });
});

describe("isSharedFlightCurrent", () => {
  const shared = { tailNumber: "N1", sharedAt: "2026-11-10T12:00:00Z", departsAt: "2026-11-11T12:00:00Z" };
  it("shows it while the task is open and never once it is cancelled", () => {
    expect(isSharedFlightCurrent(shared, "in-progress", new Date("2027-01-01T00:00:00Z"))).toBe(true);
    expect(isSharedFlightCurrent(shared, "canceled", new Date("2026-11-11T13:00:00Z"))).toBe(false);
  });
  it("keeps it for two days after departure once the task is done", () => {
    expect(isSharedFlightCurrent(shared, "completed", new Date("2026-11-13T11:00:00Z"))).toBe(true);
    expect(isSharedFlightCurrent(shared, "completed", new Date("2026-11-13T13:00:00Z"))).toBe(false);
  });
});
