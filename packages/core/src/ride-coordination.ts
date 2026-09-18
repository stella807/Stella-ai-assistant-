import type { Iso8601 } from "./types.ts";
import { metersBetween, type Point } from "./geo.ts";
import { standardRideFareCents } from "./driver-pay.ts";

/**
 * Getting home, coordinated with a driver Safehubby actually hired —
 * replacing the old Uber/Lyft hand-off entirely rather than sitting beside
 * it. See `driver-applications.ts` for how a driver gets approved; nothing
 * there yet assigns an approved driver to a specific rider in real time, so
 * this is a request-and-coordinate flow, the same honest shape the Elite
 * desk already uses for a jet charter: a rider asks, a person on the
 * operations side matches an approved driver and relays back who's coming,
 * rather than a live-matching engine this app does not have.
 *
 * What this deliberately is not: a redo of the ride-quote/booking code in
 * fulfillment.ts, which exists to talk to Uber's own APIs, and still never
 * invents a fare on that path — see `RideEstimate.fareEstimateCents` in
 * ports.ts. This module is different: there is no third party here to quote
 * a fare from at all, so `estimateFareCents` below prices the trip off
 * Safehubby's own published rate card (`standardRideFareCents` in
 * driver-pay.ts) instead — the same "no live quote to defer to, so a
 * disclosed rate stands in for one" shape `serviceFeeFor` already uses for
 * concierge tasks. What is still missing is dispatch itself: `driverId`
 * below is filled in by a person on operations, not a matching engine, and
 * there is still no charge or hold wired to a request — the fare is a real,
 * disclosed number to expect, not something taken from anyone's card yet.
 */

export type PickupRequestStatus = "requested" | "coordinated" | "completed" | "cancelled";

export interface PickupLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface PickupRequest {
  id: string;
  travelerId: string;
  pickup: PickupLocation;
  dropoff: PickupLocation;
  note?: string;
  status: PickupRequestStatus;
  /** Stamped at request time from `estimateFareCents` below, so a past
   *  request's number stays true even if the rate card changes later —
   *  the same "price it once, keep it" reasoning concierge tasks already
   *  follow for `serviceFeeCents`. Not a charge — nothing is held against
   *  the rider's card yet, since dispatch itself is still a person on
   *  operations matching a driver by hand, not an instant booking. */
  fareEstimateCents: number;
  /** Set once operations has matched a driver — see
   *  `POST /api/master/pickup-requests/:id/coordinate` in routes.ts. */
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  createdAt: Iso8601;
  coordinatedAt?: Iso8601;
  completedAt?: Iso8601;
}

/** A request needs somewhere real to send a driver, on both ends — a
 *  missing or non-finite coordinate is the one thing this refuses outright,
 *  since there is nobody downstream who can act on "nowhere." */
export function validatePickupRequest(input: { pickup: PickupLocation; dropoff: PickupLocation }): void {
  const finite = (loc: PickupLocation | undefined) =>
    Boolean(loc) && Number.isFinite(loc!.lat) && Number.isFinite(loc!.lng);
  if (!finite(input.pickup)) throw new Error("Turn on location so a driver knows where to find you.");
  if (!finite(input.dropoff)) throw new Error("Say where you're headed.");
}

const METERS_PER_MILE = 1609.34;

/**
 * The assumed speed behind the estimate below, since no routing API is
 * configured to ask a real one. Deliberately on the slow side of ordinary
 * city driving (20 mph, not the 25-30 a highway stretch would allow) —
 * this estimate is already built on straight-line distance, which
 * undercounts a real route (streets bend, one-ways backtrack), and a fast
 * assumed speed would let both errors compound into a number that reads
 * low next to what a ride actually takes.
 */
export const ESTIMATE_AVERAGE_MPH = 20;

/**
 * A fare estimate for a pickup request, priced off Safehubby's own
 * published rate card (`standardRideFareCents`) rather than a live quote —
 * see this module's own doc comment for why there is no third party here
 * to quote one from. Built on straight-line distance between the two
 * points, since there is no routing API configured for a real driving
 * route: this is a real number, honestly disclosed as an estimate rather
 * than the exact fare a longer real route would actually run.
 */
export function estimateFareCents(pickup: PickupLocation, dropoff: PickupLocation): number {
  const miles = metersBetween(pickup as Point, dropoff as Point) / METERS_PER_MILE;
  const minutes = (miles / ESTIMATE_AVERAGE_MPH) * 60;
  return standardRideFareCents(miles, minutes);
}
