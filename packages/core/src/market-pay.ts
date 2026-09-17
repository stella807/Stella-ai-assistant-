import type { LaunchMarketId } from "./service-area.ts";

/**
 * The local wage bands in each market Safehubby operates in, and the check
 * that its pay clears them.
 *
 * This module used to *scale* pay down to each market. That was reversed.
 * Indexing meant paying somebody in San Juan less than somebody in Los
 * Angeles for the identical job — going to a stranger at night and sitting
 * with them until they are steady — and the research it was built from
 * actually recommended the opposite: **one flat rate set by the complexity
 * of the role, which is automatically a premium where the local market is
 * cheaper.** See `CONCIERGE_ASSISTANT_PAYOUT_CENTS`.
 *
 * So the bands survive, and their job changed. They are no longer an input
 * to what anyone is paid; they are the evidence that one universal rate is a
 * good rate in every market — checked in `market-pay.test.ts` against every
 * category and tier, so a future rate cut cannot quietly drop below a local
 * market without a test going red.
 *
 * Deliberately imports nothing from `concierge.ts`, which imports the check
 * from here; callers pass the payout and the minutes in.
 */

export interface MarketPay {
  id: LaunchMarketId;
  label: string;
  /** Local mid-level personal-assistant hourly band, in cents: [low, high]. */
  midBandCents: [number, number];
  /** Local high-end / executive band, in cents. The anchor rate is set
   *  against this one, because this work is not mid-level assistant work. */
  highBandCents: [number, number];
}

export const MARKET_PAY: Record<LaunchMarketId, MarketPay> = {
  "los-angeles": {
    id: "los-angeles", label: "Los Angeles",
    midBandCents: [2400, 2700], highBandCents: [3500, 5000],
  },
  texas: {
    id: "texas", label: "Texas",
    midBandCents: [1800, 2200], highBandCents: [3000, 4000],
  },
  "puerto-rico": {
    id: "puerto-rico", label: "Puerto Rico",
    midBandCents: [1500, 1900], highBandCents: [2500, 3200],
  },
};

/** The most expensive market, and so the one the universal rate has to clear
 *  to be a premium everywhere else by construction. */
export const REFERENCE_MARKET: LaunchMarketId = "los-angeles";

export function marketPayFor(market?: LaunchMarketId | null): MarketPay {
  return MARKET_PAY[market ?? REFERENCE_MARKET] ?? MARKET_PAY[REFERENCE_MARKET];
}

/** What a payout works out to per hour, for a task of this length. */
export function impliedHourlyCents(payoutCents: number, minutes: number): number {
  if (minutes <= 0) throw new Error("A task's length must be positive to price it hourly.");
  return Math.round((payoutCents * 60) / minutes);
}

/**
 * The rate this whole card is anchored on: the floor of the reference
 * market's high-end band. Every personal-assistant-rate task lands at or
 * above this, whatever its length — except the errand-runner role's quick
 * tasks, which are deliberately priced against their own, separate labor
 * market instead. See `QUICK_TASK_ASSISTANT_PAYOUT_CENTS` in concierge.ts
 * and the test this exception is recorded against in market-pay.test.ts.
 */
export const ANCHOR_HOURLY_CENTS = MARKET_PAY[REFERENCE_MARKET].highBandCents[0];

/** Whether a payout clears the top of a market's mid-level band — the
 *  minimum any rate here must satisfy in every market. */
export function clearsMidBand(payoutCents: number, minutes: number, market: LaunchMarketId): boolean {
  return impliedHourlyCents(payoutCents, minutes) >= marketPayFor(market).midBandCents[1];
}

/** Whether a payout reaches a market's high-end band, which is where this
 *  work actually sits in complexity. */
export function reachesHighBand(payoutCents: number, minutes: number, market: LaunchMarketId): boolean {
  return impliedHourlyCents(payoutCents, minutes) >= marketPayFor(market).highBandCents[0];
}

/** How a payout compares to a market, as something a person can read — used
 *  in the employee portal so an assistant can see what their rate is worth
 *  where they work, rather than being told a number with no context. */
export function describePayAgainstMarket(
  payoutCents: number, minutes: number, market: LaunchMarketId,
): string {
  const hourly = impliedHourlyCents(payoutCents, minutes);
  const band = marketPayFor(market);
  const dollars = (c: number) => `$${(c / 100).toFixed(0)}`;
  if (hourly > band.highBandCents[1]) {
    return `Above the top of the ${band.label} range for this work (${dollars(band.highBandCents[0])}-${dollars(band.highBandCents[1])}/hr).`;
  }
  if (hourly >= band.highBandCents[0]) {
    return `In the high-end ${band.label} range for this work (${dollars(band.highBandCents[0])}-${dollars(band.highBandCents[1])}/hr).`;
  }
  return `Above the typical ${band.label} rate (${dollars(band.midBandCents[0])}-${dollars(band.midBandCents[1])}/hr).`;
}
