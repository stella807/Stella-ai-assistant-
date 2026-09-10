import { describe, expect, it } from "vitest";
import { VENUE_RESEARCH_METERS, hasMovedVenue, metersBetween } from "../src/geo.ts";

describe("metersBetween", () => {
  it("is zero for the same point", () => {
    expect(metersBetween({ lat: 40.714, lng: -74.003 }, { lat: 40.714, lng: -74.003 })).toBe(0);
  });

  it("matches a known distance", () => {
    // Empire State Building to Times Square, ~1.4km.
    const m = metersBetween({ lat: 40.7484, lng: -73.9857 }, { lat: 40.758, lng: -73.9855 });
    expect(m).toBeGreaterThan(1000);
    expect(m).toBeLessThan(1200);
  });

  it("is symmetric", () => {
    const a = { lat: 51.5074, lng: -0.1278 };
    const b = { lat: 48.8566, lng: 2.3522 };
    expect(metersBetween(a, b)).toBeCloseTo(metersBetween(b, a), 6);
  });
});

describe("hasMovedVenue", () => {
  const bar = { lat: 40.714, lng: -74.003 };

  it("is true with no previous fix — the first search always runs", () => {
    expect(hasMovedVenue(null, bar)).toBe(true);
  });

  it("ignores GPS jitter from a phone sitting on the bar", () => {
    // ~20m of drift, which a stationary handset produces on its own.
    expect(hasMovedVenue(bar, { lat: 40.7142, lng: -74.003 })).toBe(false);
  });

  it("fires once you have actually gone somewhere else", () => {
    // ~450m down the road.
    expect(hasMovedVenue(bar, { lat: 40.718, lng: -74.003 })).toBe(true);
  });

  it("uses the documented threshold", () => {
    expect(VENUE_RESEARCH_METERS).toBe(200);
  });
});
