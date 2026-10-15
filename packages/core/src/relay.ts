import {
  BOOKED_HOUR_STEP, MAX_BOOKED_HOURS, MIN_BOOKED_HOURS, assistantPayoutFor, serviceFeeFor,
  type ConciergeCategory,
} from "./concierge.ts";
import type { Iso8601 } from "./types.ts";

/**
 * Cover that outlasts one booking, staffed as a relay.
 *
 * A single booking stops at `MAX_BOOKED_HOURS` on purpose: past twelve hours
 * it is no longer a booking, it is employment, with the duties and the law
 * that come with that. But the thing people actually need does not stop at
 * twelve hours — somebody alone in a hospital overnight needs the whole
 * night, and the family asking for it does not care how it is divided.
 *
 * So the answer is not a longer shift, it is more than one person: three
 * eight-hour shifts, the way a ward or a care agency has always staffed a
 * day. Each leg is its own booking at its own rate, taken by its own
 * assistant, who is paid for the hours they actually worked. Nobody is awake
 * for twenty-four hours and nobody is paid a day's wage for a night's work.
 *
 * This module plans and prices the rota. It does not book it — booking is
 * `POST /api/concierge/tasks`, one call per leg, so a leg that cannot be
 * filled fails on its own rather than taking the night down with it.
 */

/** The longest span a relay will plan: a week. Beyond that, somebody needs a
 *  care agency and a contract, not a sequence of app bookings — and saying
 *  so is better than quietly producing a rota of fifty-six shifts. */
export const MAX_RELAY_HOURS = 24 * 7;

export interface RelayLeg {
  /** 1-based, so it reads as "shift 2 of 3" without arithmetic. */
  index: number;
  startAt: Iso8601;
  endAt: Iso8601;
  hours: number;
}

export interface Relay {
  startAt: Iso8601;
  endAt: Iso8601;
  totalHours: number;
  legs: RelayLeg[];
}

/**
 * Splits a span into back-to-back shifts, as evenly as the half-hour step
 * allows.
 *
 * Even, rather than filling each shift to the brim. Thirteen hours packed
 * greedily is a twelve-hour shift and a one-hour shift — and that one hour
 * lands at four in the morning, for somebody who has to travel there for it.
 * Two shifts of six and a half are the same cover and a rota a person would
 * actually take, which is the difference between a plan and a plan that gets
 * staffed.
 */
export function planRelay(input: {
  startAt: Date;
  hours: number;
  /** Shorter shifts than the law allows, if the customer wants them. Never
   *  longer: the ceiling is not ours to raise. */
  maxLegHours?: number;
}): Relay {
  const { startAt, hours } = input;
  if (!Number.isFinite(hours) || hours < MIN_BOOKED_HOURS) {
    throw new Error(`Cover has to be at least ${MIN_BOOKED_HOURS} hour.`);
  }
  if (Math.round(hours / BOOKED_HOUR_STEP) * BOOKED_HOUR_STEP !== hours) {
    throw new Error("Cover is booked on the half hour.");
  }
  if (hours > MAX_RELAY_HOURS) {
    throw new Error(
      `We do not plan cover longer than ${MAX_RELAY_HOURS / 24} days. For more than that you want a care agency, not a rota of bookings.`,
    );
  }
  const maxLeg = Math.min(input.maxLegHours ?? MAX_BOOKED_HOURS, MAX_BOOKED_HOURS);
  if (maxLeg < MIN_BOOKED_HOURS) throw new Error(`A shift has to be at least ${MIN_BOOKED_HOURS} hour.`);

  // Worked in half-hour units rather than in floating-point hours: 6.5 + 6.5
  // has to come to exactly 13, and adding tenths of an hour repeatedly does
  // not. Integers divide cleanly and the step is reapplied at the end.
  const totalSteps = Math.round(hours / BOOKED_HOUR_STEP);
  const legCount = Math.ceil(hours / maxLeg);
  const evenSteps = Math.floor(totalSteps / legCount);
  const longerLegs = totalSteps - evenSteps * legCount;

  const legs: RelayLeg[] = [];
  let cursor = startAt.getTime();
  for (let i = 0; i < legCount; i++) {
    // The longer shifts go first, so the shortest one is the last rather
    // than the one in the middle of the night.
    const legHours = (evenSteps + (i < longerLegs ? 1 : 0)) * BOOKED_HOUR_STEP;
    const endsAt = cursor + legHours * 3_600_000;
    legs.push({
      index: i + 1,
      startAt: new Date(cursor).toISOString(),
      endAt: new Date(endsAt).toISOString(),
      hours: legHours,
    });
    cursor = endsAt;
  }

  return {
    startAt: startAt.toISOString(),
    endAt: new Date(cursor).toISOString(),
    totalHours: hours,
    legs,
  };
}

export interface RelayLegPrice extends RelayLeg {
  serviceFeeCents: number;
  assistantPayoutCents: number;
}

export interface RelayPrice {
  serviceFeeCents: number;
  assistantPayoutCents: number;
  legs: RelayLegPrice[];
}

/**
 * What the whole rota costs, and what each shift pays the person working it.
 *
 * Priced per leg and summed, never by multiplying one rate across the span.
 * Each leg is a real booking that a real person takes, and that person is
 * paid for their own hours — so the arithmetic has to happen where the work
 * does, or an uneven rota would quietly pay somebody for hours they did not
 * work and somebody else for hours they did.
 */
export function relayPricing(
  category: ConciergeCategory, relay: Relay, peopleCount = 1,
): RelayPrice {
  const legs = relay.legs.map((leg): RelayLegPrice => ({
    ...leg,
    serviceFeeCents: serviceFeeFor(category, false, peopleCount, leg.hours),
    assistantPayoutCents: assistantPayoutFor(category, false, peopleCount, leg.hours),
  }));
  return {
    serviceFeeCents: legs.reduce((sum, l) => sum + l.serviceFeeCents, 0),
    assistantPayoutCents: legs.reduce((sum, l) => sum + l.assistantPayoutCents, 0),
    legs,
  };
}
