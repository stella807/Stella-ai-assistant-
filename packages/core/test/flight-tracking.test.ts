import { describe, expect, it } from "vitest";
import {
  FLIGHT_TRACKING_DISCLOSURES, bestTimeFor, delayMinutesFor, describeFlightStatus, hasLanded, minutesSince,
  type FlightAirportLeg, type FlightInfo,
} from "../src/flight-tracking.ts";

const now = new Date("2026-09-17T20:00:00Z");

const leg = (over: Partial<FlightAirportLeg> = {}): FlightAirportLeg => ({
  iata: "LAX", scheduledTime: "2026-09-17T19:30:00Z", ...over,
});

const flight = (over: Partial<FlightInfo> = {}): FlightInfo => ({
  flightNumber: "DL204", airlineName: "Delta", airlineIata: "DL", status: "scheduled",
  departure: leg({ iata: "JFK", scheduledTime: "2026-09-17T13:00:00Z" }),
  arrival: leg(),
  ...over,
});

describe("bestTimeFor", () => {
  it("prefers actual, then estimated, then scheduled", () => {
    expect(bestTimeFor(leg({ actualTime: "2026-09-17T19:35:00Z", estimatedTime: "2026-09-17T19:40:00Z" })))
      .toBe("2026-09-17T19:35:00Z");
    expect(bestTimeFor(leg({ estimatedTime: "2026-09-17T19:40:00Z" }))).toBe("2026-09-17T19:40:00Z");
    expect(bestTimeFor(leg())).toBe("2026-09-17T19:30:00Z");
  });
});

describe("delayMinutesFor", () => {
  it("is zero on schedule", () => {
    expect(delayMinutesFor(leg({ actualTime: "2026-09-17T19:30:00Z" }))).toBe(0);
  });

  it("is positive when running late", () => {
    expect(delayMinutesFor(leg({ estimatedTime: "2026-09-17T20:15:00Z" }))).toBe(45);
  });

  it("is negative when running early", () => {
    expect(delayMinutesFor(leg({ estimatedTime: "2026-09-17T19:10:00Z" }))).toBe(-20);
  });
});

describe("hasLanded", () => {
  it("only trusts the provider's own status, not a time", () => {
    expect(hasLanded(flight({ status: "landed" }))).toBe(true);
    expect(hasLanded(flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:00:00Z" }) }))).toBe(false);
  });
});

describe("minutesSince", () => {
  it("computes elapsed minutes against the given clock", () => {
    expect(minutesSince("2026-09-17T19:30:00Z", now)).toBe(30);
  });
});

describe("describeFlightStatus", () => {
  it("says cancelled plainly, naming the airline", () => {
    expect(describeFlightStatus(flight({ status: "cancelled" }), now)).toMatch(/cancelled.*delta/i);
  });

  it("says diverted, naming the airport it isn't landing at", () => {
    expect(describeFlightStatus(flight({ status: "diverted", arrival: leg({ iata: "SFO" }) }), now)).toMatch(/diverted.*SFO/i);
  });

  it("says landed just now for a very recent arrival", () => {
    const f = flight({ status: "landed", arrival: leg({ actualTime: "2026-09-17T19:59:30Z" }) });
    expect(describeFlightStatus(f, now)).toMatch(/landing now/i);
  });

  it("says landed N min ago for an earlier arrival", () => {
    const f = flight({ status: "landed", arrival: leg({ actualTime: "2026-09-17T19:40:00Z" }) });
    expect(describeFlightStatus(f, now)).toMatch(/landed 20 min ago/i);
  });

  it("says landed N hr ago once it's been over an hour", () => {
    const f = flight({ status: "landed", arrival: leg({ actualTime: "2026-09-17T17:00:00Z" }) });
    expect(describeFlightStatus(f, now)).toMatch(/landed 3 hr ago/i);
  });

  it("reports on-time in the air without alarming delay language", () => {
    const f = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:35:00Z" }) });
    expect(describeFlightStatus(f, now)).toMatch(/in the air, on time/i);
  });

  it("reports a real delay in the air, past the 15-minute noise floor", () => {
    const f = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T20:15:00Z" }) });
    expect(describeFlightStatus(f, now)).toMatch(/running ~45 min late/i);
  });

  it("reports not-departed-yet on schedule", () => {
    expect(describeFlightStatus(flight({ status: "scheduled" }), now)).toMatch(/not departed yet/i);
  });

  it("reports a pre-departure delay", () => {
    const f = flight({ status: "scheduled", departure: leg({ scheduledTime: "2026-09-17T13:00:00Z", estimatedTime: "2026-09-17T13:50:00Z" }) });
    expect(describeFlightStatus(f, now)).toMatch(/delayed ~50 min/i);
  });

  it("falls back honestly when the status itself is unknown", () => {
    expect(describeFlightStatus(flight({ status: "unknown" }), now)).toMatch(/not available/i);
  });
});

describe("disclosures", () => {
  it("says this can lag reality", () => {
    expect(FLIGHT_TRACKING_DISCLOSURES.join(" ")).toMatch(/lag reality/i);
  });

  it("says to confirm with the airline directly", () => {
    expect(FLIGHT_TRACKING_DISCLOSURES.join(" ")).toMatch(/confirm.*airline/i);
  });
});
