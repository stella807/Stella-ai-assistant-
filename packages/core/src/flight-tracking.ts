import type { ProviderStatus } from "./fulfillment.ts";

/**
 * Tracking a commercial flight for an airport pickup.
 *
 * The gap this closes: a personal assistant sent to meet someone at the
 * airport (see `concierge.ts`'s `airport-pickup` category) used to have
 * nothing but a flight number typed into a note — no way to know the
 * flight landed early, is running late, or already touched down before
 * they got there. Unlike a rideshare (see the doc on `BookedRide` in
 * fulfillment.ts — Uber and Lyft closed their location feed to third
 * parties), a commercial aircraft's position is real, third-party-
 * accessible data: ADS-B receivers around the world report it, and flight-
 * data providers (FlightAware AeroAPI, AeroDataBox) aggregate it alongside
 * schedule and gate information. So this one is buildable for real, not a
 * "watch it on the provider's own page" substitute — see `FlightPosition`
 * below.
 *
 * Every field on `FlightInfo` is provider-sourced or a pass-through of it.
 * Safehubby computes no ETA, infers no delay beyond what the provider
 * already reports as `estimatedTime`, and draws no distance-to-airport
 * number — the customer's own map (`LiveMap`, fed `position` and the
 * arrival airport's coordinates) shows how close the plane is the same
 * honest way the ride pickup pin shows where the car is going, not a
 * number this module invented on top of a raw lat/lng.
 */

export type FlightStatus = "scheduled" | "active" | "landed" | "cancelled" | "diverted" | "unknown";

export interface FlightAirportLeg {
  iata: string;
  name?: string;
  /** The airport's own coordinates, when the provider includes them —
   *  never geocoded or guessed here. Lets the map show the plane against
   *  where it's actually headed without this module doing any distance
   *  math of its own. */
  lat?: number;
  lng?: number;
  terminal?: string;
  gate?: string;
  scheduledTime: string;
  /** The provider's own current estimate — not derived from anything else
   *  here, the same "their number, not ours" rule the ride quote uses for
   *  a fare. */
  estimatedTime?: string;
  actualTime?: string;
}

/** A live-ish position report. `updatedAt` is when the provider says this
 *  was last observed, not when Safehubby asked for it — ADS-B coverage and
 *  provider refresh both add real latency, and the age of the fix is part
 *  of being honest about what "how close is the plane" actually means. */
export interface FlightPosition {
  lat: number;
  lng: number;
  altitudeFt?: number;
  groundSpeedKts?: number;
  headingDeg?: number;
  updatedAt: string;
}

export interface FlightInfo {
  flightNumber: string;
  airlineName: string;
  airlineIata: string;
  /** The provider's own logo URL, when it returns one. Never a guessed or
   *  hot-linked path this module assembled from an airline code — an
   *  absent logo means show the name and code, not a broken image. */
  logoUrl?: string;
  /** The aircraft's registration ("tail number"), when the provider
   *  reports it — assigned to a specific airframe, not the flight number,
   *  which is why it can only ever come from the provider's own aircraft
   *  data for this specific rotation. */
  aircraftTailNumber?: string;
  aircraftType?: string;
  status: FlightStatus;
  departure: FlightAirportLeg;
  arrival: FlightAirportLeg;
  /** Present only while the provider actually has a recent position —
   *  absent before departure, after landing, or if coverage drops out. */
  position?: FlightPosition;
}

export interface FlightLookupInput {
  flightNumber: string;
  /** The flight's departure date, local to wherever it departs — a flight
   *  number alone repeats daily, so this is what actually picks one
   *  rotation out of the schedule. */
  date: string;
}

export interface FlightTrackingPort {
  readonly status: ProviderStatus;
  lookup(input: FlightLookupInput): Promise<FlightInfo | null>;
}

/** The best time this leg actually has — what happened, if it happened;
 *  otherwise the provider's live estimate; otherwise the schedule. */
export function bestTimeFor(leg: FlightAirportLeg): string {
  return leg.actualTime ?? leg.estimatedTime ?? leg.scheduledTime;
}

/** Minutes late against the schedule, using the best time available —
 *  negative when running early. Not shown as a hard fact when it comes
 *  from `estimatedTime` rather than `actualTime`; see `describeFlightStatus`. */
export function delayMinutesFor(leg: FlightAirportLeg): number {
  return Math.round((Date.parse(bestTimeFor(leg)) - Date.parse(leg.scheduledTime)) / 60_000);
}

/** Whether the flight has actually landed, by the provider's own status —
 *  never inferred from a time alone, since `estimatedTime` on `landed`
 *  data is exactly the case this exists to describe clearly. */
export function hasLanded(info: FlightInfo): boolean {
  return info.status === "landed";
}

export function minutesSince(iso: string, now: Date): number {
  return Math.round((now.getTime() - Date.parse(iso)) / 60_000);
}

/**
 * One line, in the terms a customer or their assistant actually needs:
 * whether to head to the airport yet, and whether they've already been
 * missed. Every number here traces to a provider field — this only chooses
 * which one and how to phrase it.
 */
export function describeFlightStatus(info: FlightInfo, now: Date): string {
  switch (info.status) {
    case "cancelled":
      return `Cancelled — check with ${info.airlineName} before heading to the airport.`;
    case "diverted":
      return `Diverted — this flight is not landing at ${info.arrival.iata}.`;
    case "landed": {
      const since = minutesSince(bestTimeFor(info.arrival), now);
      if (since <= 1) return "Landing now.";
      return since < 60 ? `Landed ${since} min ago.` : `Landed ${Math.round(since / 60)} hr ago.`;
    }
    case "active": {
      const delay = delayMinutesFor(info.arrival);
      const eta = new Date(bestTimeFor(info.arrival)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return delay > 15 ? `In the air, running ~${delay} min late — now landing ~${eta}.` : `In the air, on time — landing ~${eta}.`;
    }
    case "scheduled": {
      const delay = delayMinutesFor(info.departure);
      return delay > 15
        ? `Not departed yet — delayed ~${delay} min.`
        : "On schedule — not departed yet.";
    }
    default:
      return "Status not available right now.";
  }
}

/**
 * Said before anyone relies on this for a real airport trip, the same
 * discipline every other disclosure list in this codebase follows (see
 * `SECURE_TRANSPORT_DISCLOSURES`, `CLUB_DISCLOSURES`).
 */
export const FLIGHT_TRACKING_DISCLOSURES = [
  "Flight data comes from a third-party aggregator and can lag reality by a few minutes, especially for position.",
  "Always confirm a real schedule change with the airline directly — this is a planning aid, not a boarding-pass alternative.",
  "A position is only shown while the provider actually has a recent one; a gap does not mean anything went wrong.",
] as const;
