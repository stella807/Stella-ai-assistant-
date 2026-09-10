import { describe, expect, it } from "vitest";
import {
  FIX_STALE_AFTER_MINUTES, VENUE_RESEARCH_METERS, describeFixAge, fixAgeMinutes,
  hasMovedVenue, isFixStale, metersBetween,
} from "../src/geo.ts";

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

describe("how old a fix is", () => {
  const now = new Date("2026-01-02T02:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  it("says it in plain words rather than a clock time", () => {
    expect(describeFixAge(minutesAgo(0), now)).toBe("just now");
    expect(describeFixAge(minutesAgo(42), now)).toBe("42 min ago");
    expect(describeFixAge(minutesAgo(75), now)).toBe("over an hour ago");
    expect(describeFixAge(minutesAgo(200), now)).toBe("3 hours ago");
  });

  it("flags a fix old enough to stop reading as current", () => {
    expect(isFixStale(minutesAgo(5), now)).toBe(false);
    expect(isFixStale(minutesAgo(FIX_STALE_AFTER_MINUTES), now)).toBe(true);
  });

  it("never reports a future fix as negative age", () => {
    expect(fixAgeMinutes(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(0);
  });
});
