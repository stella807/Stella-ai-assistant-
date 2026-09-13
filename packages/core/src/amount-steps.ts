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
 * The nearest valid amount on the scale. Values snap to the step grid so that
 * stepping and tapping a preset can never leave the control on an off-grid
 * amount a later `+` would silently correct.
 *
 * The grid is anchored at zero, not at `minCents`. Anchoring it at the
 * minimum looked tidier and was wrong: with a $10 floor and a $25 step, every
 * reachable amount landed $10 high, so a $500 preset displayed as $510 and a
 * $1,000 one as $1,010. Money controls have to be able to show round numbers
 * — that is most of what people mean when they choose an amount.
 *
 * The ends stay exact: `minCents` and `maxCents` are always reachable even
 * when neither sits on the grid, because a cap you cannot quite reach is a cap
 * that reads broken.
 */
export function clampAmount(cents: number, scale: AmountScale): number {
  const { minCents, maxCents, stepCents } = scale;
  if (!Number.isFinite(cents) || cents <= minCents) return minCents;
  if (cents >= maxCents) return maxCents;
  const snapped = Math.round(cents / stepCents) * stepCents;
  if (snapped > maxCents) return maxCents;
  return snapped < minCents ? minCents : snapped;
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
