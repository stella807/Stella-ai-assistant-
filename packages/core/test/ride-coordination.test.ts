import { describe, expect, it } from "vitest";
import { validatePickupRequest } from "../src/ride-coordination.ts";

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
