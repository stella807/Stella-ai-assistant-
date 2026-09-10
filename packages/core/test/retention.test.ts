import { describe, expect, it } from "vitest";
import { LOCATION_RETENTION_DAYS, sweepLocationHistory } from "../src/retention.ts";
import type { LocationPing, NightOut } from "../src/types.ts";

const NOW = new Date("2026-02-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const ping = (at: string): LocationPing => ({ lat: 40.7, lng: -74, accuracyMeters: 10, at });

const night = (pings: LocationPing[]): NightOut => ({
  id: "n1", travelerId: "sam", status: "ended", startedAt: daysAgo(30),
  body: { weightKg: 82, widmarkRatio: 0.68 }, drinkLimit: 4,
  drinks: [], checkIns: [], pings,
} as NightOut);

describe("location retention", () => {
  it("drops a trace older than the window", () => {
    const result = sweepLocationHistory([night([ping(daysAgo(30)), ping(daysAgo(20))])], NOW);
    expect(result.nights[0]!.pings).toEqual([]);
    expect(result.removed).toBe(2);
  });

  it("keeps what is inside the window", () => {
    const result = sweepLocationHistory([night([ping(daysAgo(1)), ping(daysAgo(30))])], NOW);
    expect(result.nights[0]!.pings).toHaveLength(1);
    expect(result.removed).toBe(1);
  });

  it("keeps the night itself — only the breadcrumb trail expires", () => {
    // The drink log and whether they got home are the record worth keeping.
    // The trail is operational data that stops being useful the next morning.
    const original = night([ping(daysAgo(30))]);
    const swept = sweepLocationHistory([original], NOW).nights[0]!;
    expect(swept.id).toBe(original.id);
    expect(swept.status).toBe(original.status);
    expect(swept.drinkLimit).toBe(original.drinkLimit);
  });

  it("returns the original array untouched when there is nothing to drop", () => {
    // Identity, so a no-op sweep does not rewrite the whole store document.
    const nights = [night([ping(daysAgo(1))])];
    expect(sweepLocationHistory(nights, NOW).nights).toBe(nights);
    expect(sweepLocationHistory(nights, NOW).removed).toBe(0);
  });

  it("uses a stated window rather than an implied one", () => {
    expect(LOCATION_RETENTION_DAYS).toBe(7);
    const justInside = sweepLocationHistory([night([ping(daysAgo(LOCATION_RETENTION_DAYS - 1))])], NOW);
    const justOutside = sweepLocationHistory([night([ping(daysAgo(LOCATION_RETENTION_DAYS + 1))])], NOW);
    expect(justInside.removed).toBe(0);
    expect(justOutside.removed).toBe(1);
  });
});
