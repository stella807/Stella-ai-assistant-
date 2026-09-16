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
 * secure-transport's per-mile and per-minute numbers are set inside Uber
 * Black's own published fare-component band ($2.50-$4.00/mi, $0.40-$0.65/min
 * — the closest real comparison, since it is the same chauffeured,
 * licensed-driver product). This rate card has no margin taken out of it
 * yet (see `driverEarningsCents` below), so the driver keeps every cent of
 * it — an Uber Black driver nets roughly 75-80% of those same raw numbers
 * after Uber's 20-25% commission, so landing inside the band rather than at
 * its very top is still generous, not stingy. Base is left above the
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
  "secure-transport": { baseCents: 1500, perMileCents: 300, perMinuteCents: 60 },
};

export function driverRateFor(tier: DriverTier): DriverRate {
  return DRIVER_RATE_CARD[tier];
}

/** What one trip pays a driver, before any platform margin. There is no
 *  separate `DRIVER_FEE_MARGIN` the way concierge has one yet — Safehubby
 *  does not dispatch a driver from this list today, so there is no live
 *  customer-facing fare to take a margin against; add one here, disclosed
 *  the same way, if and when that changes. */
export function driverEarningsCents(tier: DriverTier, miles: number, minutes: number): number {
  if (miles < 0 || minutes < 0) throw new Error("Trip distance and duration cannot be negative.");
  const rate = driverRateFor(tier);
  return Math.round(rate.baseCents + rate.perMileCents * miles + rate.perMinuteCents * minutes);
}
