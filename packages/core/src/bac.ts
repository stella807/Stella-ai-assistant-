import { GRAMS_PER_STANDARD_DRINK, type BodyProfile, type LoggedDrink } from "./types.ts";
import { alcoholicDrinks } from "./drinks.ts";

/**
 * Widmark elimination rate, %BAC per hour. Real rates range roughly
 * 0.012-0.020; we model the slow end so the estimate errs toward "still
 * impaired" rather than toward "you're fine".
 */
const ELIMINATION_RATE_PER_HOUR = 0.013;

/**
 * Widmark is a population model fit to controlled dosing studies. Applied to
 * a phone-typed drink log it is wrong often and by a lot: food, carbonation,
 * medication, pour size, and individual metabolism all move it. This band is
 * deliberately wide so the UI can never present a single confident number.
 */
const UNCERTAINTY_FRACTION = 0.35;

export type ImpairmentBand = "none" | "low" | "moderate" | "high" | "severe";

export interface BacEstimate {
  /** Point estimate, %BAC. Presentational only — always show the range too. */
  estimate: number;
  low: number;
  high: number;
  band: ImpairmentBand;
  /** Hours until the *high* end of the range reaches ~0.00. */
  hoursUntilLikelySober: number;
  /**
   * Always true. Safehubby does not tell anyone they are OK to drive, at any
   * estimate, including 0.00 — the model cannot know, and a false clear here
   * kills people. Consumers must render the accompanying guidance.
   */
  neverAdviseDriving: true;
  guidance: string;
}

export interface BacInput {
  body: BodyProfile;
  drinks: LoggedDrink[];
  /** Evaluation time. */
  now: Date;
}

/**
 * Widmark: BAC% = (grams / (weight_g * r)) * 100, decayed linearly from each
 * drink's own timestamp. Summing per-drink decay (rather than decaying the
 * total from the first drink) keeps a late shot from being erased by an early
 * beer's elapsed time.
 */
export function estimateBac({ body, drinks, now }: BacInput): BacEstimate {
  if (body.weightKg <= 0) throw new Error("weightKg must be positive");
  if (body.widmarkRatio <= 0) throw new Error("widmarkRatio must be positive");

  const weightGrams = body.weightKg * 1000;
  const nowMs = now.getTime();

  let bac = 0;
  for (const drink of alcoholicDrinks(drinks)) {
    const drinkMs = new Date(drink.loggedAt).getTime();
    if (Number.isNaN(drinkMs) || drinkMs > nowMs) continue;

    const grams = drink.standardDrinks * GRAMS_PER_STANDARD_DRINK;
    const peak = (grams / (weightGrams * body.widmarkRatio)) * 100;
    const hoursElapsed = (nowMs - drinkMs) / 3_600_000;
    bac += Math.max(0, peak - ELIMINATION_RATE_PER_HOUR * hoursElapsed);
  }

  const estimate = round3(bac);
  const low = round3(bac * (1 - UNCERTAINTY_FRACTION));
  const high = round3(bac * (1 + UNCERTAINTY_FRACTION));

  return {
    estimate,
    low,
    high,
    band: impairmentBand(estimate),
    hoursUntilLikelySober: round2(high / ELIMINATION_RATE_PER_HOUR),
    neverAdviseDriving: true,
    guidance: guidanceFor(impairmentBand(estimate)),
  };
}

export function impairmentBand(bac: number): ImpairmentBand {
  if (bac <= 0.001) return "none";
  if (bac < 0.03) return "low";
  if (bac < 0.06) return "moderate";
  if (bac < 0.12) return "high";
  return "severe";
}

/**
 * Guidance never resolves to "you can drive". The "none" band says the estimate
 * is at zero, not that the person is fit to drive — the log may be incomplete,
 * and impairment outlasts measurable alcohol.
 */
function guidanceFor(band: ImpairmentBand): string {
  switch (band) {
    case "none":
      return "Nothing logged recently. This is an estimate from what was typed in, not a measurement — if you have been drinking at all tonight, get a ride.";
    case "low":
      return "Alcohol is in your system. Get a ride home — do not drive.";
    case "moderate":
      return "You are impaired. Line up a ride now, have some water, and eat something.";
    case "high":
      return "You are significantly impaired. Do not drive. Stay put, tell someone where you are, and book a ride home.";
    case "severe":
      return "This level is dangerous. Stop drinking, drink water, and stay with someone you trust. If they are confused, vomiting, or hard to wake, call 911 — that is alcohol poisoning, not just a rough night.";
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
