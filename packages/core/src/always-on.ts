import { CONCIERGE_FEE_MARGIN, PA_HOURLY_RATE_CENTS } from "./concierge.ts";
import { LIABILITY_INSURANCE_CENTS_PER_MONTH } from "./staffing.ts";
import { MARKET_PAY, marketPayFor } from "./market-pay.ts";
import type { LaunchMarketId } from "./service-area.ts";

/**
 * What continuous cover actually costs, before anyone prices a tier around it.
 *
 * "24/7 concierge" reads like a feature and is really a payroll question. A
 * month is about 730 hours; one person can legally and humanely cover about
 * 163 of them. So round-the-clock cover for one customer is not one hire with
 * a generous attitude — it is four and a half people, their employer taxes,
 * their workers' comp and their insurance, every month, whether the customer
 * calls or not.
 *
 * This module exists so that number is computed from the same constants the
 * rest of the app pays people with, rather than estimated once in a
 * spreadsheet and then quietly diverging from the rate card. If the hourly
 * rate moves, the cost of promising 24/7 moves with it.
 */

/** 365.25 days a year, averaged over twelve months, times twenty-four. */
export const HOURS_PER_MONTH = 730.5;

/**
 * What one full-time person actually covers in a month.
 *
 * Not 173 (40 hours x 52/12). A person who works every scheduled week of the
 * year covers nothing during their holiday, and somebody promised
 * round-the-clock cover notices the gap immediately. Two weeks off and a week
 * of sick leave is 120 hours a year that still has to be someone's shift, so
 * the honest divisor is the hours actually worked, not the hours scheduled.
 */
export const FULL_TIME_HOURS_PER_YEAR = 2080;
export const UNWORKED_HOURS_PER_YEAR = 120;
export const COVERED_HOURS_PER_PERSON_PER_MONTH =
  (FULL_TIME_HOURS_PER_YEAR - UNWORKED_HOURS_PER_YEAR) / 12;

/* ---------------------------------------------------------------------------
   What an employer pays on top of the wage
   ------------------------------------------------------------------------ */

/** Social Security and Medicare, the employer's half. Statutory, not an
 *  estimate. */
export const FICA_RATE = 0.0765;
/** Federal and state unemployment, blended and effective over a year. FUTA is
 *  0.6% on the first $7,000; SUTA is state-set and varies by experience
 *  rating, so this is a planning figure rather than a quoted one. */
export const UNEMPLOYMENT_RATE = 0.015;
/** Workers' compensation for in-person personal-service work. Commonly quoted
 *  around $2-4 per $100 of payroll for this class; the middle of that. */
export const WORKERS_COMP_RATE = 0.03;

export const EMPLOYER_BURDEN_RATE = FICA_RATE + UNEMPLOYMENT_RATE + WORKERS_COMP_RATE;

export interface AlwaysOnCost {
  /** The hourly wage this was costed at. */
  hourlyRateCents: number;
  /** Hours of cover bought in a month. */
  hoursPerMonth: number;
  /** People needed to cover them without overtime or unstaffed gaps. */
  peopleNeeded: number;
  wagesCents: number;
  /** Employer taxes and workers' comp on those wages. */
  burdenCents: number;
  /** Liability cover, per head, for everyone on the rota. */
  insuranceCents: number;
  /** Wages + burden + insurance: what it costs Safehubby to keep the promise. */
  totalCostCents: number;
  /** What it has to sell for at the house margin, which sits on top of cost
   *  rather than inside it — the same rule as every other price here. */
  priceCents: number;
}

/**
 * Cost one month of continuous cover at a given hourly wage.
 *
 * `hoursPerMonth` defaults to genuine round-the-clock. Pass fewer for a
 * narrower promise — nights only, or weekends — which is the same arithmetic
 * against a smaller number and is usually the version worth selling.
 */
export function alwaysOnCost(
  hourlyRateCents: number, hoursPerMonth: number = HOURS_PER_MONTH,
): AlwaysOnCost {
  const wagesCents = Math.round(hourlyRateCents * hoursPerMonth);
  const burdenCents = Math.round(wagesCents * EMPLOYER_BURDEN_RATE);
  // Whole people carry whole policies: you cannot insure four and a half of
  // somebody, and the half-person on the rota is a real hire with a real
  // certificate.
  const peopleNeeded = hoursPerMonth / COVERED_HOURS_PER_PERSON_PER_MONTH;
  const insuranceCents = Math.ceil(peopleNeeded) * LIABILITY_INSURANCE_CENTS_PER_MONTH;
  const totalCostCents = wagesCents + burdenCents + insuranceCents;
  return {
    hourlyRateCents, hoursPerMonth, peopleNeeded,
    wagesCents, burdenCents, insuranceCents, totalCostCents,
    priceCents: Math.round(totalCostCents / (1 - CONCIERGE_FEE_MARGIN)),
  };
}

/**
 * The same month costed at what a local employer would pay in each market.
 *
 * Safehubby pays one universal rate, so its own cost does not vary by market
 * — this is the comparison, not the bill. It answers "what would a household
 * in San Juan pay a local agency for this", which is the number a price has
 * to survive being held up against.
 */
export function alwaysOnCostByMarket(
  hoursPerMonth: number = HOURS_PER_MONTH,
): Record<LaunchMarketId, AlwaysOnCost> {
  const out = {} as Record<LaunchMarketId, AlwaysOnCost>;
  for (const id of Object.keys(MARKET_PAY) as LaunchMarketId[]) {
    // The floor of the high-end band: this is not mid-level assistant work,
    // and costing it at the mid band would understate what staffing it takes.
    out[id] = alwaysOnCost(marketPayFor(id).highBandCents[0], hoursPerMonth);
  }
  return out;
}

/** What Safehubby's own rate costs, which is what it would actually pay. */
export function alwaysOnCostAtOurRate(
  hoursPerMonth: number = HOURS_PER_MONTH,
): AlwaysOnCost {
  return alwaysOnCost(PA_HOURLY_RATE_CENTS, hoursPerMonth);
}

/* ---------------------------------------------------------------------------
   The version that can actually be sold
   ------------------------------------------------------------------------ */

/**
 * Hours included in a subscription, and what the tier has to charge for them.
 *
 * Dedicated round-the-clock cover is a five-figure monthly product and cannot
 * live inside a consumer tier at any price people would pay. What does work
 * is an allowance: the subscription buys availability plus a bucket of hours,
 * and hours past the bucket bill at the same published rate. The margin still
 * sits on top of the wage, so the included hours cost the customer exactly
 * what an extra hour would.
 */
export function includedHoursPriceCents(hours: number): number {
  const wage = PA_HOURLY_RATE_CENTS * hours;
  const burden = wage * EMPLOYER_BURDEN_RATE;
  return Math.round((wage + burden) / (1 - CONCIERGE_FEE_MARGIN));
}
