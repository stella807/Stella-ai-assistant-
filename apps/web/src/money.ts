/**
 * One money formatter for the whole web app.
 *
 * There were ten copies of this, each a one-liner, and they drifted exactly
 * the way ten copies of a one-liner do: some grouped thousands and some did
 * not, so the Elite ladder's prices rendered as "$199999.99" on the plans
 * screen while the same amount read "$199,999.99" two tabs away. A price
 * nobody can parse at a glance is a real defect, and the fix that stops it
 * recurring is having one of these rather than a better one.
 */

/** Exact, to the cent, grouped. For anything a customer is charged. */
export const money = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Whole dollars, grouped. For amounts that step in dollars and so have no
 *  cents to lose — spend caps, sliders, round rate-card figures. */
export const dollars = (cents: number): string =>
  `$${Math.round(cents / 100).toLocaleString("en-US")}`;
