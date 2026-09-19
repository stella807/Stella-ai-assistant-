import type { DriverTier } from "./driver-applications.ts";

/**
 * A driver's own pay scale — deliberately separate from
 * `CONCIERGE_ASSISTANT_PAYOUT_CENTS` in concierge.ts, not a shared number reused
 * across two different jobs.
 *
 * A concierge task is a bounded, discrete job — grab this, wait here for a
 * stated block — so it is priced per task, flat by category, and explicitly
 * never metered by the minute (see `hourlyRateCentsFor`'s doc comment in
 * concierge.ts). Driving is the opposite: the same "standard" trip can be
 * six blocks or across town, so pricing it with one flat number would either
 * overpay the short hop or underpay the long one. It is priced the way real
 * per-trip driving already is instead — a base, plus what the trip actually
 * cost in distance and time.
 *
 * Not live yet: `docs/driving.md` is explicit that nobody is dispatched from
 * the "Drive for Safehubby" list today. This rate card exists so the number
 * is real, disclosed on the application screen, and tested before a driver
 * is ever assigned an actual trip — the same "vetting pipeline built ahead
 * of need" reasoning that file already states for the application form
 * itself. There is no payroll wiring here to match — `payroll.ts`'s biweekly
 * sweep is for concierge assistants, who exist and work tasks today; adding
 * a driver payout pipeline before there is a single trip to run it against
 * would be scaffolding with nothing to hold up.
 */

export interface DriverRate {
  /** Paid on every trip regardless of length — covers showing up. */
  baseCents: number;
  perMileCents: number;
  perMinuteCents: number;
}

/**
 * Secure transport pays a materially higher base, per-mile, and per-minute
 * rate than standard — not a multiplier applied at compute time, but its own
 * stated numbers, for the same reason the customer-facing fare is
 * "substantially higher" for that tier (`SECURE_TRANSPORT_DISCLOSURES` in
 * fulfillment.ts): a licensed protective-services driver's insurance,
 * training, and ongoing certification are real overhead standard driving
 * doesn't carry, not a premium charged just because the job sounds riskier.
 *
 * secure-transport's per-mile rate now sits just above Uber Black's own
 * published fare-component band ($2.50-$4.00/mi — the closest real
 * comparison, since it is the same chauffeured, licensed-driver product):
 * $4.50/mi, a deliberate above-market move rather than a lands-inside-the-
 * band one. This rate card has no margin taken out of it (see
 * `driverEarningsCents` below), so the driver keeps every cent of it — an
 * Uber Black driver nets roughly 75-80% of the comparable raw number after
 * Uber's 20-25% commission, so $4.50/mi here is a real premium over what an
 * Uber Black driver actually takes home per mile, not just what the rider
 * is quoted. Per-minute stays inside Uber Black's band ($0.40-$0.65/min);
 * only the per-mile component was asked to move. Base is left above the
 * comparable range on purpose: it is what a driver is guaranteed for simply
 * showing up, and Uber Black's is bundled with a per-trip minimum a
 * standalone base number should not undercut.
 *
 * Standard is deliberately not moved to match. It is a different product —
 * everyday driving, not a chauffeured black-car tier — and inflating it to
 * Black's numbers would misprice the one thing this rate card already gets
 * right: that secure-transport costs more for real, stated reasons, not
 * because a number elsewhere went up.
 */
export const DRIVER_RATE_CARD: Record<DriverTier, DriverRate> = {
  standard: { baseCents: 300, perMileCents: 90, perMinuteCents: 18 },
  "secure-transport": { baseCents: 1500, perMileCents: 450, perMinuteCents: 60 },
};

export function driverRateFor(tier: DriverTier): DriverRate {
  return DRIVER_RATE_CARD[tier];
}

/** What one trip pays a driver, before any platform margin. */
export function driverEarningsCents(tier: DriverTier, miles: number, minutes: number): number {
  if (miles < 0 || minutes < 0) throw new Error("Trip distance and duration cannot be negative.");
  const rate = driverRateFor(tier);
  return Math.round(rate.baseCents + rate.perMileCents * miles + rate.perMinuteCents * minutes);
}

/**
 * There is deliberately no customer-facing fare here any more.
 *
 * There was one: a published Safehubby rate priced at the floor of Uber
 * Black's band, which made sense while a ride meant dispatching a driver
 * from Safehubby's own roster. It no longer does. Rides are arranged on a
 * rideshare the customer already has access to (see ride-coordination.ts),
 * so a third party sets the price and `RideEstimate.fareEstimateCents` in
 * ports.ts applies in full: Safehubby never computes a fare it does not
 * control. What the ride costs is read off the booking once it exists and
 * passed through; what Safehubby charges is the arranging fee, which is its
 * own published number and not a guess about anybody else's pricing.
 *
 * `DRIVER_RATE_CARD` above stays, unused by any live path and disclosed on
 * the driver application screen exactly as before. It is what Safehubby
 * pays a driver it hires, and hiring drivers is a later chapter rather than
 * a cancelled one — deleting the rate card would mean re-deriving it from
 * scratch, and it is still the honest answer to "what would you pay me?"
 * for anyone who applies today.
 */
