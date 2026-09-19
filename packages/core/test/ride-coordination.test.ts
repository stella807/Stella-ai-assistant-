import { describe, expect, it } from "vitest";
import {
  ARRANGE_RIDE_FEE_CENTS, ARRANGE_RIDE_PAYOUT_CENTS, arrangeRideMarginCents,
  recordRideCost, totalRideCents, validatePickupRequest, type PickupRequest,
} from "../src/ride-coordination.ts";

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

const request = (over: Partial<PickupRequest> = {}): PickupRequest => ({
  id: "pr1", travelerId: "sam", pickup: here, dropoff: home, status: "requested",
  arrangeFeeCents: ARRANGE_RIDE_FEE_CENTS, createdAt: "2026-09-19T12:00:00.000Z", ...over,
});

describe("what an arranged ride costs", () => {
  it("keeps Safehubby's whole margin in the fee, taking nothing on the fare", () => {
    expect(arrangeRideMarginCents()).toBe(ARRANGE_RIDE_FEE_CENTS - ARRANGE_RIDE_PAYOUT_CENTS);
    // The assistant keeps their rate and Safehubby's cut is added on top,
    // never taken out of it — the same rule concierge pay follows.
    expect(ARRANGE_RIDE_PAYOUT_CENTS).toBeLessThan(ARRANGE_RIDE_FEE_CENTS);
    expect(arrangeRideMarginCents()).toBeGreaterThan(0);
  });

  it("knows nothing about the fare until the ride is booked", () => {
    const r = request();
    expect(r.rideCostCents).toBeUndefined();
    expect(totalRideCents(r)).toBeUndefined();
  });

  it("passes the real cost straight through once it is known", () => {
    const booked = recordRideCost(request(), 2340, "Uber");
    expect(booked.rideCostCents).toBe(2340);
    expect(booked.bookedOn).toBe("Uber");
    // Fee plus fare, with nothing added in between.
    expect(totalRideCents(booked)).toBe(ARRANGE_RIDE_FEE_CENTS + 2340);
  });

  it("refuses a cost that is not a whole, non-negative number of cents", () => {
    expect(() => recordRideCost(request(), -1, "Uber")).toThrow(/negative/i);
    expect(() => recordRideCost(request(), 12.5, "Uber")).toThrow(/whole number/i);
  });

  it("refuses to restate a cost already recorded", () => {
    // The price the rider was shown is the price they pay. A fare that moves
    // after the fact is the one thing this flow exists not to do.
    const booked = recordRideCost(request(), 2340, "Uber");
    expect(() => recordRideCost(booked, 9900, "Uber")).toThrow(/already been recorded/i);
  });

  it("refuses a booking with no service named, so the receipt says where it went", () => {
    expect(() => recordRideCost(request(), 2340, "  ")).toThrow(/which service/i);
  });
});
