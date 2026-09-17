import { describe, expect, it } from "vitest";
import {
  FLIGHT_ESTIMATE_SHIFT_MINUTES, FLIGHT_TRACKING_DISCLOSURES, bestTimeFor, delayMinutesFor, describeFlightStatus,
  diffFlight, hasLanded, minutesSince,
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

describe("diffFlight", () => {
  const kinds = (before: FlightInfo, after: FlightInfo) => diffFlight(before, after).map((u) => u.kind);

  it("says nothing when nothing changed", () => {
    expect(diffFlight(flight({ status: "active" }), flight({ status: "active" }))).toEqual([]);
  });

  it("reports a landing, once", () => {
    const airborne = flight({ status: "active" });
    const down = flight({ status: "landed", arrival: leg({ actualTime: "2026-09-17T19:32:00Z" }) });
    expect(kinds(airborne, down)).toContain("landed");
    // The sweep runs on a timer, so a flight that was already down last time
    // must not re-announce itself every pass.
    expect(kinds(down, down)).not.toContain("landed");
  });

  it("treats a landing as time-sensitive — it is the whole point of the sweep", () => {
    const update = diffFlight(flight({ status: "active" }), flight({ status: "landed" }))
      .find((u) => u.kind === "landed");
    expect(update?.urgency).toBe("time-sensitive");
  });

  it("reports a cancellation and a diversion once each", () => {
    const scheduled = flight({ status: "scheduled" });
    expect(kinds(scheduled, flight({ status: "cancelled" }))).toContain("cancelled");
    expect(kinds(flight({ status: "cancelled" }), flight({ status: "cancelled" }))).not.toContain("cancelled");
    expect(kinds(scheduled, flight({ status: "diverted" }))).toContain("diverted");
  });

  it("ignores estimate jitter below the notify threshold", () => {
    const before = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:30:00Z" }) });
    const after = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:35:00Z" }) });
    expect(kinds(before, after)).toEqual([]);
  });

  it("reports a delay once it clears the threshold", () => {
    const before = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:30:00Z" }) });
    const after = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T20:10:00Z" }) });
    const update = diffFlight(before, after).find((u) => u.kind === "delayed");
    expect(update?.message).toMatch(/40 min later/i);
  });

  it("reports an early arrival too — that is the one that strands someone", () => {
    const before = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:30:00Z" }) });
    const after = flight({ status: "active", arrival: leg({ estimatedTime: "2026-09-17T19:05:00Z" }) });
    expect(kinds(before, after)).toContain("earlier");
  });

  it("uses exactly the published threshold as the boundary", () => {
    const base = "2026-09-17T19:30:00Z";
    const shifted = new Date(Date.parse(base) + FLIGHT_ESTIMATE_SHIFT_MINUTES * 60_000).toISOString();
    const before = flight({ status: "active", arrival: leg({ estimatedTime: base }) });
    const after = flight({ status: "active", arrival: leg({ estimatedTime: shifted }) });
    expect(kinds(before, after)).toContain("delayed");
  });

  it("does not chase the estimate of a flight that already landed", () => {
    const before = flight({ status: "landed", arrival: leg({ actualTime: "2026-09-17T19:30:00Z" }) });
    const after = flight({ status: "landed", arrival: leg({ actualTime: "2026-09-17T20:30:00Z" }) });
    expect(kinds(before, after)).toEqual([]);
  });

  it("reports a gate change, because it is where to stand", () => {
    const before = flight({ status: "active", arrival: leg({ gate: "20B" }) });
    const after = flight({ status: "active", arrival: leg({ gate: "31A" }) });
    const update = diffFlight(before, after).find((u) => u.kind === "gate-changed");
    expect(update?.message).toMatch(/31A/);
  });

  it("does not call a newly-filled-in gate a change of plan", () => {
    const before = flight({ status: "active", arrival: leg({}) });
    const after = flight({ status: "active", arrival: leg({ gate: "20B" }) });
    expect(kinds(before, after)).not.toContain("gate-changed");
  });

  it("reports a terminal change", () => {
    const before = flight({ status: "active", arrival: leg({ terminal: "2" }) });
    const after = flight({ status: "active", arrival: leg({ terminal: "5" }) });
    expect(kinds(before, after)).toContain("terminal-changed");
  });

  it("never puts a position in a message — a lock screen is the wrong place for one", () => {
    const before = flight({ status: "active" });
    const after = flight({
      status: "landed",
      position: { lat: 33.94, lng: -118.4, updatedAt: "2026-09-17T19:30:00Z" },
    });
    for (const u of diffFlight(before, after)) {
      expect(u.message).not.toMatch(/-?\d+\.\d{3,}/);
    }
  });
});
