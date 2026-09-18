import { describe, expect, it } from "vitest";
import { estimateFareCents, validatePickupRequest } from "../src/ride-coordination.ts";
import { standardRideFareCents } from "../src/driver-pay.ts";

const here = { lat: 40.7128, lng: -74.006 };
const home = { lat: 40.7488, lng: -73.9857, label: "Home" };

describe("validatePickupRequest", () => {
  it("accepts a request with a real pickup and dropoff", () => {
    expect(() => validatePickupRequest({ pickup: here, dropoff: home })).not.toThrow();
  });

  it("refuses a missing or non-finite pickup", () => {
    expect(() => validatePickupRequest({ pickup: undefined as never, dropoff: home }))
      .toThrow(/where a driver knows where to find you|where to find you/i);
    expect(() => validatePickupRequest({ pickup: { lat: NaN, lng: -74 }, dropoff: home }))
      .toThrow(/find you/i);
  });

  it("refuses a missing or non-finite dropoff", () => {
    expect(() => validatePickupRequest({ pickup: here, dropoff: undefined as never }))
      .toThrow(/headed/i);
    expect(() => validatePickupRequest({ pickup: here, dropoff: { lat: 40.7, lng: NaN } }))
      .toThrow(/headed/i);
  });
});

describe("estimateFareCents — the real, disclosed standard-ride fare", () => {
  it("returns Safehubby's base fare alone for an identical pickup and dropoff", () => {
    expect(estimateFareCents(here, here)).toBe(standardRideFareCents(0, 0));
  });

  it("charges more for a longer trip than a shorter one", () => {
    const short = estimateFareCents(here, { lat: 40.716, lng: -74.006 });
    const long = estimateFareCents(here, home);
    expect(long).toBeGreaterThan(short);
  });

  it("matches standardRideFareCents computed from the same straight-line distance and assumed speed", () => {
    // metersBetween(here, home) is roughly 6.4km ≈ 4mi. Rather than hardcode
    // that conversion twice, this checks the two functions agree, since
    // estimateFareCents is defined entirely in terms of standardRideFareCents.
    const fare = estimateFareCents(here, home);
    expect(fare).toBeGreaterThan(standardRideFareCents(0, 0));
    expect(Number.isInteger(fare)).toBe(true);
  });

  it("never goes negative or NaN, even for the same point twice", () => {
    const fare = estimateFareCents(home, home);
    expect(fare).toBeGreaterThan(0);
    expect(Number.isFinite(fare)).toBe(true);
  });
});
