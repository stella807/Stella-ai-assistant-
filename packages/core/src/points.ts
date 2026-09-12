import type { Iso8601 } from "./types.ts";

/**
 * Points reward safe behavior, never consumption. Nothing in this table pays
 * out for drinking more — logging earns a token amount because an accurate log
 * is what makes the safety features work, and the big awards sit on getting
 * home without driving.
 */
export const POINT_RULES = {
  checkInOnTime: 10,
  logDrink: 5,
  loggedWaterBetweenDrinks: 15,
  bookedRideInsteadOfDriving: 100,
  homeSafe: 50,
  completedNightUnderLimit: 40,
  // Growth rather than safety, and the one entry here that isn't about the
  // night itself. It stays inside the rule above that matters: it pays for
  // bringing someone onto the app, never for anything they drink once
  // they're on it, and it must never be restructured into the latter.
  referredAFriend: 200,
} as const;

export type PointReason = keyof typeof POINT_RULES;

export interface PointEntry {
  id: string;
  reason: PointReason;
  points: number;
  awardedAt: Iso8601;
  note?: string;
}

export interface Reward {
  id: string;
  name: string;
  partner: string;
  cost: number;
  description: string;
}

/** Redemption catalog — funded by venue partners, not by user data. */
export const REWARD_CATALOG: Reward[] = [
  { id: "rw-ride-5", name: "$5 off your ride home", partner: "Ride partners", cost: 400, description: "Applied to your next ride booked in Safehubby." },
  { id: "rw-water", name: "Free water & snack delivery", partner: "Delivery partners", cost: 250, description: "One electrolyte drink and a snack, delivered." },
  { id: "rw-app", name: "One month of Premium Plus", partner: "Safehubby", cost: 1200, description: "Skip a month's subscription." },
  { id: "rw-bar-app", name: "Free appetizer at partner bars", partner: "Local venues", cost: 600, description: "Redeem at participating venues." },
  { id: "rw-coffee", name: "Morning-after coffee", partner: "Local cafes", cost: 300, description: "Because you earned it." },
];

export function award(id: string, reason: PointReason, at: Date, note?: string): PointEntry {
  return { id, reason, points: POINT_RULES[reason], awardedAt: at.toISOString(), note };
}

export function balance(entries: PointEntry[], redemptions: Redemption[] = []): number {
  const earned = entries.reduce((sum, e) => sum + e.points, 0);
  const spent = redemptions.reduce((sum, r) => sum + r.cost, 0);
  return earned - spent;
}

export interface Redemption {
  id: string;
  rewardId: string;
  cost: number;
  redeemedAt: Iso8601;
}

export function redeem(
  rewardId: string,
  entries: PointEntry[],
  redemptions: Redemption[],
  id: string,
  now: Date,
): Redemption {
  const reward = REWARD_CATALOG.find((r) => r.id === rewardId);
  if (!reward) throw new Error(`Unknown reward: ${rewardId}`);
  if (balance(entries, redemptions) < reward.cost) throw new Error("Not enough points.");
  return { id, rewardId, cost: reward.cost, redeemedAt: now.toISOString() };
}
