import type { LaunchMarketId } from "./service-area.ts";

/**
 * What an assistant's task pays in each launch market.
 *
 * One flat national rate was the starting point, and it was wrong in both
 * directions at once. Measured against local mid-level personal-assistant
 * rates, the flat card paid roughly **50% over market in Texas and 75% over
 * in Puerto Rico** — which sounds generous until you notice the customer fee
 * is derived from it (`serviceFeeFor`), so the same flat number also made the
 * service most expensive, relative to local wages, in the two markets least
 * able to absorb it. A rate card that overpays the worker and overcharges the
 * customer in the same breath is not generous, it is just untethered.
 *
 * So pay is indexed to the market the task actually happens in, with one hard
 * guarantee: **no market pays below the top of its own local mid-level band.**
 * That is the floor in `payoutCentsFor`, and it is a floor rather than a
 * multiplier chosen carefully, because a multiplier is a number a future edit
 * can nudge without noticing what it broke. Being at or above the top of the
 * local mid band means Safehubby is a premium option for an assistant
 * everywhere it operates, not merely in the expensive city.
 *
 * Bands are mid-level personal-assistant hourly rates as surveyed across
 * Indeed/ZipRecruiter/Glassdoor market data. They are the input to a pay
 * decision, not a measurement of our own work, and they are the thing to
 * re-check when these markets move.
 *
 * This module deliberately imports nothing from `concierge.ts`, even though
 * that is where the rate card lives: concierge already imports from here, and
 * a cycle between the two would make the rate card's initialization order
 * depend on which file happened to be loaded first. Callers pass the base
 * rate and the minutes in.
 */

export interface MarketPay {
  id: LaunchMarketId;
  label: string;
  /** Local mid-level hourly band, in cents: [low, high]. */
  midBandCents: [number, number];
  /**
   * Where this market's task rates sit relative to the reference market.
   * Derived from the ratio of band midpoints, then rounded to something a
   * person can hold in their head — the floor below is what actually
   * guarantees the outcome, so this only has to be approximately right.
   */
  multiplier: number;
}

/** Los Angeles is the reference market at 1.00: it has the highest local
 *  band, so every other market scales down from it rather than up. */
export const MARKET_PAY: Record<LaunchMarketId, MarketPay> = {
  "los-angeles": { id: "los-angeles", label: "Los Angeles", midBandCents: [2400, 2700], multiplier: 1.0 },
  texas: { id: "texas", label: "Texas", midBandCents: [1800, 2200], multiplier: 0.8 },
  "puerto-rico": { id: "puerto-rico", label: "Puerto Rico", midBandCents: [1500, 1900], multiplier: 0.7 },
};

/** The market a task is priced against when its location is unknown or
 *  outside every launch market. The most expensive one, deliberately: an
 *  unknown location must never be the cheap path to underpaying somebody. */
export const DEFAULT_PAY_MARKET: LaunchMarketId = "los-angeles";

export function marketPayFor(market: LaunchMarketId | null | undefined): MarketPay {
  return MARKET_PAY[market ?? DEFAULT_PAY_MARKET] ?? MARKET_PAY[DEFAULT_PAY_MARKET];
}

/** Rounds up to the nearest quarter, so a rounding cent always lands on the
 *  worker's side — the mirror of `commissionCentsFor` rounding down so it
 *  never lands on the house's. */
function roundUpToQuarter(cents: number): number {
  return Math.ceil(cents / 25) * 25;
}

/** The least a task of this length may pay in this market: the top of the
 *  local mid-level band, for the minutes the task actually takes. */
export function marketFloorCents(minutes: number, market?: LaunchMarketId | null): number {
  const [, bandTop] = marketPayFor(market).midBandCents;
  return roundUpToQuarter((bandTop * minutes) / 60);
}

export interface ScalePayoutInput {
  /** The national rate-card figure for this task, in cents. */
  baseCents: number;
  /** How long the task typically takes, for working out the hourly floor.
   *  A reduced tier passes its own shorter duration, so its floor is the
   *  local band applied to the shorter job. */
  minutes: number;
  market?: LaunchMarketId | null;
}

/**
 * What one task pays in one market, before the household multiplier. Never
 * below the market's floor.
 */
export function scalePayoutCents(input: ScalePayoutInput): number {
  const { multiplier } = marketPayFor(input.market);
  const scaled = roundUpToQuarter(input.baseCents * multiplier);
  return Math.max(scaled, marketFloorCents(input.minutes, input.market));
}

/** The hourly rate a payout works out to — the number that has to stay
 *  competitive, and the one the tests assert against. */
export function impliedHourlyCents(payoutCents: number, minutes: number): number {
  return Math.round((payoutCents * 60) / minutes);
}
