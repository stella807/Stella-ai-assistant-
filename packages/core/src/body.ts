import type { BodyProfile } from "./types.ts";

/**
 * Validating the two numbers the whole estimate rests on.
 *
 * `estimateBac` guards against zero and negatives, but it guards by throwing —
 * and it runs on every read of a night. A night stored with a bad profile is
 * therefore not a bad estimate, it is a night that throws forever: every
 * subsequent GET fails, and the record is unrecoverable through the API. The
 * guard has to be at the point of entry instead.
 *
 * The bounds are wide on purpose. This is not the place to tell someone their
 * weight is wrong; it is the place to catch a typo, a unit mix-up, or a client
 * sending nonsense, any of which produce an estimate that is not merely
 * imprecise but meaningless. A tenth of a kilogram yields a number that would
 * frighten someone; a thousand kilograms yields one that would reassure them.
 * Both are worse than refusing.
 */

/** Roughly the lightest and heaviest recorded adults, rounded outward. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;

/**
 * Widmark's r for adults sits near 0.55 (typical female) to 0.68 (typical
 * male), with outliers either side by body composition. Anything beyond this
 * is not a body, it is a client sending noise into the divisor.
 */
export const MIN_WIDMARK_RATIO = 0.4;
export const MAX_WIDMARK_RATIO = 0.9;

export const DEFAULT_WIDMARK_RATIO = 0.68;
export const MAX_DRINK_LIMIT = 50;

export function validateBody(input: { weightKg: unknown; widmarkRatio?: unknown }): BodyProfile {
  const weightKg = Number(input.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) {
    throw new Error(`Enter a weight between ${MIN_WEIGHT_KG}kg and ${MAX_WEIGHT_KG}kg.`);
  }

  const widmarkRatio = input.widmarkRatio === undefined || input.widmarkRatio === null
    ? DEFAULT_WIDMARK_RATIO
    : Number(input.widmarkRatio);
  if (!Number.isFinite(widmarkRatio) || widmarkRatio < MIN_WIDMARK_RATIO || widmarkRatio > MAX_WIDMARK_RATIO) {
    throw new Error(`The body-water ratio must be between ${MIN_WIDMARK_RATIO} and ${MAX_WIDMARK_RATIO}.`);
  }

  return { weightKg, widmarkRatio };
}

/**
 * A limit of zero or less would mean the "you have reached your limit" alert
 * fires on the first drink and every one after, which trains someone to ignore
 * the alerts that matter.
 */
export function validateDrinkLimit(value: unknown, fallback = 4): number {
  if (value === undefined || value === null) return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DRINK_LIMIT) {
    throw new Error(`Set a drink limit between 1 and ${MAX_DRINK_LIMIT}.`);
  }
  return limit;
}
