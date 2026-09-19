import type { Iso8601 } from "./types.ts";


/**
 * Getting home: Safehubby arranges the ride, on a rideshare the customer
 * already has access to.
 *
 * This used to dispatch a driver from Safehubby's own roster. That needs
 * eight insured drivers before anyone can be taken anywhere, and commercial
 * auto exposure carried by a company with no revenue yet — so it is a later
 * chapter, not the way this starts. `driver-applications.ts` and
 * `DRIVER_RATE_CARD` are kept intact and dormant for when it is.
 *
 * What happens instead is the thing a concierge has always been able to do
 * and an app cannot: a person opens the rideshare app and books the trip on
 * the customer's behalf. Worth being exact about why that is not a cheat —
 * Uber retired its Ride Request API for third-party consumer apps (see
 * docs/mobile.md), so no amount of integration work would let *this app*
 * book a ride. A human being with a phone needs no API at all. The
 * capability that is impossible to automate is trivial to perform.
 *
 * The money follows from that, and only two numbers are involved:
 *
 * - **`arrangeFeeCents`** is Safehubby's own, published up front. Known
 *   before anyone agrees to anything, the same way every concierge fee is.
 * - **`rideCostCents`** is what the ride actually cost, read off the booking
 *   once it exists. It is absent until then and is *never* estimated —
 *   Safehubby does not set this price and cannot predict it, which is
 *   exactly the rule `RideEstimate.fareEstimateCents` states in ports.ts.
 *
 * An earlier version of this module did estimate the fare, from straight-line
 * distance and an assumed speed, back when Safehubby's own rate card set the
 * price. Against a third party's surge-priced, route-dependent fare that
 * arithmetic would be fabrication with a decimal point on it, so it is gone.
 * The customer is told the real price before the ride is booked, because by
 * then the assistant is looking at it.
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
  /** What Safehubby charges to arrange this, stamped at request time so a
   *  past request's fee stays true if the published fee changes later — the
   *  same "price it once, keep it" rule concierge tasks follow for
   *  `serviceFeeCents`. */
  arrangeFeeCents: number;
  /** What the ride itself cost, once it has been booked and there is a real
   *  number to read. Absent until then, and never estimated — see this
   *  module's doc comment. Passed straight through: Safehubby takes its fee
   *  above and no margin on the fare. */
  rideCostCents?: number;
  /** Which rideshare it was booked on, for the receipt. */
  bookedOn?: string;
  /** Set once an assistant has picked the request up. Named for the driver
   *  only in the dormant own-roster case; today it is the Safehubby person
   *  who arranged the trip. */
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

/**
 * What Safehubby charges to arrange a ride.
 *
 * The same shape and the same money as a quick concierge task, because it is
 * the same job: a few minutes of somebody's attention, with a defined end.
 * Mirrors `QUICK_TASK_ASSISTANT_PAYOUT_CENTS` in concierge.ts rather than
 * inventing a second price for ten minutes of the same person's time — the
 * assistant keeps $4.00 and Safehubby's $1.00 is added on top of their rate,
 * never taken out of it.
 *
 * Charged on every plan including Free. `ride-booking` is in
 * `FREE_FEATURES`, and there is no cheaper version of getting somebody home
 * safely to hold back for a subscription.
 */
export const ARRANGE_RIDE_FEE_CENTS = 500;
export const ARRANGE_RIDE_PAYOUT_CENTS = 400;

/** What Safehubby keeps for arranging one ride. The fare is not in here:
 *  it is passed through at cost, so this is the whole of the margin. */
export function arrangeRideMarginCents(): number {
  return ARRANGE_RIDE_FEE_CENTS - ARRANGE_RIDE_PAYOUT_CENTS;
}

/**
 * Records what the ride actually cost, once it is booked and there is a real
 * figure to read off the rideshare app.
 *
 * Refuses a negative, and refuses to overwrite a cost already recorded: the
 * number a customer was shown is what they are charged, and a booking whose
 * price moves after the fact is the thing this whole flow exists not to do.
 */
export function recordRideCost(request: PickupRequest, costCents: number, bookedOn: string): PickupRequest {
  if (!Number.isInteger(costCents) || costCents < 0) {
    throw new Error("A ride cost has to be a whole number of cents, and cannot be negative.");
  }
  if (request.rideCostCents !== undefined) {
    throw new Error("This ride's cost has already been recorded.");
  }
  if (!bookedOn.trim()) throw new Error("Say which service the ride was booked on.");
  return { ...request, rideCostCents: costCents, bookedOn: bookedOn.trim() };
}

/** Fee plus fare — what the rider actually pays, once the ride is booked.
 *  Undefined until then, because half of it is not known yet. */
export function totalRideCents(request: PickupRequest): number | undefined {
  if (request.rideCostCents === undefined) return undefined;
  return request.arrangeFeeCents + request.rideCostCents;
}
