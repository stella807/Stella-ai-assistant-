import type { Iso8601 } from "./types.ts";

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
 * fulfillment.ts, which exists to talk to Uber's own APIs. Once Safehubby is
 * dispatching its own hired drivers, there is no fare to quote and no
 * third-party trip id to hold — just a pickup, a destination, and who ends
 * up covering it.
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
