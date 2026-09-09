import type { CheckIn, NightOut } from "./types.ts";
import { alcoholicDrinks } from "./drinks.ts";
import { estimateBac } from "./bac.ts";

export const CHECK_IN_BOUNDS = { minMinutes: 15, maxMinutes: 60 } as const;

/** Grace period before a pending check-in counts as missed. */
export const MISSED_GRACE_MINUTES = 10;

/**
 * Check-ins get more frequent as the night escalates. The intent is safety, not
 * surveillance: the interval floor is 15 minutes so the app cannot be tuned
 * into a constant-ping leash, and only the traveler can start a night.
 */
export function nextCheckInMinutes(night: NightOut, now: Date): number {
  const bac = estimateBac({ body: night.body, drinks: night.drinks, now });
  const drinkCount = alcoholicDrinks(night.drinks).length;

  let minutes: number = CHECK_IN_BOUNDS.maxMinutes;
  if (drinkCount >= 2) minutes = 45;
  if (drinkCount >= 4 || bac.band === "moderate") minutes = 30;
  if (drinkCount >= 6 || bac.band === "high") minutes = 20;
  if (bac.band === "severe") minutes = CHECK_IN_BOUNDS.minMinutes;

  const missed = night.checkIns.filter((c) => c.status === "missed").length;
  if (missed > 0) minutes = Math.max(CHECK_IN_BOUNDS.minMinutes, minutes - 10 * missed);

  return clamp(minutes, CHECK_IN_BOUNDS.minMinutes, CHECK_IN_BOUNDS.maxMinutes);
}

export function scheduleCheckIn(night: NightOut, now: Date, id: string): CheckIn {
  const dueAt = new Date(now.getTime() + nextCheckInMinutes(night, now) * 60_000);
  return { id, dueAt: dueAt.toISOString(), status: "pending", reportedDrinkIds: [] };
}

/**
 * Pulls a pending check-in earlier when the night has escalated since it was
 * scheduled. Without this, someone who logs four drinks right after answering
 * would not be asked again for a full hour — exactly the stretch where the
 * cadence should be tightening. Only ever moves a check-in sooner.
 */
export function retimePendingCheckIn(night: NightOut, now: Date): CheckIn[] {
  const soonest = new Date(now.getTime() + nextCheckInMinutes(night, now) * 60_000).getTime();
  return night.checkIns.map((c) =>
    c.status === "pending" && new Date(c.dueAt).getTime() > soonest
      ? { ...c, dueAt: new Date(soonest).toISOString() }
      : c,
  );
}

/** Marks pending check-ins past their grace period as missed. Pure. */
export function sweepMissedCheckIns(checkIns: CheckIn[], now: Date): CheckIn[] {
  const cutoff = now.getTime() - MISSED_GRACE_MINUTES * 60_000;
  return checkIns.map((c) =>
    c.status === "pending" && new Date(c.dueAt).getTime() < cutoff ? { ...c, status: "missed" as const } : c,
  );
}

export function answerCheckIn(
  checkIns: CheckIn[],
  checkInId: string,
  now: Date,
  reportedDrinkIds: string[] = [],
  feelingRating?: CheckIn["feelingRating"],
): CheckIn[] {
  return checkIns.map((c) =>
    c.id === checkInId
      ? { ...c, status: "answered" as const, answeredAt: now.toISOString(), reportedDrinkIds, feelingRating }
      : c,
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
