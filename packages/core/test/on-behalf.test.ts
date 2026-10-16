import { describe, expect, it } from "vitest";
import {
  LAUNCH_MARKETS, MAX_ON_BEHALF_FIELD, ON_BEHALF_DISCLOSURES, isInLaunchMarket, launchMarketFor,
  locationForOnBehalf, marketCenter, validateOnBehalfOf, validateConciergeRequest,
  type OnBehalfOf,
} from "../src/index.ts";

const valid: OnBehalfOf = {
  marketId: "puerto-rico", recipientName: "Ramón Torres", place: "Auxilio Mutuo Hospital", room: "412",
};

describe("sending somebody to someone else", () => {
  it("puts the task inside the market the customer chose, never where the customer is", () => {
    // A daughter in Orlando orders for her father in San Juan. Her phone's
    // location is irrelevant — and trusting a client-supplied one would let an
    // order outside the launch markets slip through.
    for (const m of LAUNCH_MARKETS) {
      const loc = locationForOnBehalf({ ...valid, marketId: m.id });
      expect(isInLaunchMarket(loc), m.id).toBe(true);
      expect(launchMarketFor(loc)?.id, m.id).toBe(m.id);
      expect(marketCenter(m.id)).toEqual({ lat: loc.lat, lng: loc.lng });
    }
  });

  it("labels the location with the place typed, not with a made-up pin", () => {
    // The coordinates are only the middle of the market — enough to choose a
    // roster. The assistant works from the words, and the screens must not
    // draw the market's middle as if it were the hospital.
    const loc = locationForOnBehalf(valid);
    expect(loc.label).toContain("Auxilio Mutuo Hospital");
    expect(loc.label).toContain("412");
  });

  it("needs a name and a place, and says which is missing", () => {
    expect(() => validateOnBehalfOf({ ...valid, recipientName: " " })).toThrow(/name/i);
    expect(() => validateOnBehalfOf({ ...valid, place: "" })).toThrow(/where/i);
    expect(() => validateOnBehalfOf(valid)).not.toThrow();
  });

  it("refuses a market that does not exist, and over-long fields", () => {
    expect(() => validateOnBehalfOf({ ...valid, marketId: "mars" as never })).toThrow(/area/i);
    expect(() => validateOnBehalfOf({ ...valid, place: "x".repeat(MAX_ON_BEHALF_FIELD + 1) })).toThrow(/too long|shorter/i);
    expect(() => validateOnBehalfOf({ ...valid, room: "x".repeat(MAX_ON_BEHALF_FIELD + 1) })).toThrow(/too long|shorter/i);
  });

  it("checks a recipient's phone only if one was given", () => {
    expect(() => validateOnBehalfOf({ ...valid, phone: "7875550123" })).not.toThrow();
    expect(() => validateOnBehalfOf({ ...valid, phone: "call me maybe" })).toThrow(/phone/i);
  });

  it("is validated as part of the request", () => {
    const base = {
      category: "grab-something" as const, note: "A juice", location: locationForOnBehalf(valid), spendCapCents: 500,
      quickTask: true,
    };
    expect(() => validateConciergeRequest({ ...base, onBehalfOf: valid })).not.toThrow();
    expect(() => validateConciergeRequest({ ...base, onBehalfOf: { ...valid, recipientName: "" } })).toThrow(/name/i);
  });

  it("tells the customer what they are agreeing to, including the nurse check", () => {
    const text = ON_BEHALF_DISCLOSURES.join(" ").toLowerCase();
    expect(text).toContain("nurse");
    expect(text).toMatch(/tell them|let them know/);
    expect(text).toMatch(/not guaranteed|may not be let in|cannot promise/);
  });
});
