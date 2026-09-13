/**
 * Picking an amount without a slider.
 *
 * Safehubby's money controls are used by people who are drinking. A range
 * input asks for a precise drag along a 32px-tall track to set a number that
 * becomes a hold on someone's card — it is the single hardest control in the
 * app to operate with impaired motor control, and the one with the most
 * expensive miss. These helpers back the replacement: a few large preset
 * amounts plus a coarse +/- stepper, where every reachable value is already
 * valid so a shaky tap cannot land on one the server will reject.
 */

export interface AmountScale {
  /** The lowest bookable amount, in cents. */
  minCents: number;
  /** The highest bookable amount, in cents. */
  maxCents: number;
  /** How far one press of +/- moves, in cents. */
  stepCents: number;
}

/**
 * The nearest valid amount on the scale. Values are snapped to the step grid
 * measured from `minCents`, so stepping and tapping a preset can never leave
 * the control on an off-grid amount that a later `+` would silently correct.
 * The ends are exact: `maxCents` is always reachable even when it does not sit
 * on the grid, because a cap you cannot quite reach is a cap that reads broken.
 */
export function clampAmount(cents: number, scale: AmountScale): number {
  const { minCents, maxCents, stepCents } = scale;
  if (!Number.isFinite(cents) || cents <= minCents) return minCents;
  if (cents >= maxCents) return maxCents;
  const snapped = minCents + Math.round((cents - minCents) / stepCents) * stepCents;
  return snapped > maxCents ? maxCents : snapped;
}

/** One press of `+` (direction 1) or `-` (direction -1). */
export function stepAmount(cents: number, direction: 1 | -1, scale: AmountScale): number {
  const current = clampAmount(cents, scale);
  return clampAmount(current + direction * scale.stepCents, scale);
}

export function canStepUp(cents: number, scale: AmountScale): boolean {
  return clampAmount(cents, scale) < scale.maxCents;
}

export function canStepDown(cents: number, scale: AmountScale): boolean {
  return clampAmount(cents, scale) > scale.minCents;
}

/**
 * The preset buttons for a scale, ascending and deduplicated.
 *
 * Candidates outside the scale collapse onto its ends rather than being
 * dropped, which is what makes one shared preset list safe across modes: the
 * $600 errand preset becomes the $50 ceiling in quick-task mode, so the row
 * still offers "the most you can spend" instead of quietly losing a button and
 * shifting every remaining one under the user's thumb.
 */
export function presetAmounts(candidatesCents: readonly number[], scale: AmountScale): number[] {
  const seen = new Set<number>();
  for (const candidate of candidatesCents) seen.add(clampAmount(candidate, scale));
  return [...seen].sort((a, b) => a - b);
}
