import { ERRAND_MILEAGE_CENTS, ERRAND_TIERS, errandPayoutCents } from "./errand-tiers.ts";
import { PA_HOURLY_RATE_CENTS } from "./concierge.ts";
import { STAFF_ROLES, type StaffRole } from "./staffing.ts";

/**
 * Who we are hiring right now, and what each role pays — as an applicant sees it.
 *
 * Distinct from `PRELAUNCH_HEADCOUNT` in staffing.ts, which is a budget: the
 * floors the pre-launch cost is worked out against, sized to cover a first
 * weekend across drivers, a physician and a lawyer. That is a plan for what
 * launching could cost, not an ask to the public. Telling somebody "we need
 * eight drivers" when nobody drives for Safehubby yet is how a hiring page
 * turns into a promise.
 *
 * These are the owner's to change: the number of people wanted in each role
 * today. They size a pilot in one area of Puerto Rico, with the owner doing the
 * desk work, so most roles are zero. A role at zero still takes applications —
 * it just says it is not hiring yet.
 */
export const OPEN_POSITIONS: Record<StaffRole, number> = {
  driver: 0,
  "personal-assistant": 3,
  "errand-runner": 4,
  secretary: 0,
  "social-media-manager": 0,
  lawyer: 1,
  "web-developer": 0,
  physician: 0,
  nurse: 0,
  "wingman-club-coordinator": 0,
};

/** How many openings remain once some are filled. Never negative. */
export function openingsFor(role: StaffRole, hired: number): number {
  return Math.max(0, OPEN_POSITIONS[role] - hired);
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * What the role pays, in a sentence — built from the constants the money is
 * actually paid with, never typed. An applicant deciding whether to apply is
 * the reader a stale number costs the most.
 */
export function payLabelFor(role: StaffRole): string {
  if (role === "errand-runner") {
    const pays = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
    return `${usd(Math.min(...pays))} to ${usd(Math.max(...pays))} per errand, by size, plus ${usd(ERRAND_MILEAGE_CENTS)} a mile`;
  }
  if (role === "personal-assistant") return `${usd(PA_HOURLY_RATE_CENTS)} an hour, per booking`;
  const info = STAFF_ROLES.find((r) => r.id === role);
  if (info && info.hourlyCents > 0) {
    return `${usd(info.hourlyCents)} an hour, about ${info.prelaunchHoursPerWeek} hours a week`;
  }
  // Paid per trip and not yet live: see driver-pay.ts. Said rather than skipped.
  return "Paid per trip — see the driver application for the rates";
}
