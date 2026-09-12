import type { Subscription } from "./subscription.ts";

/**
 * The launch party, and the referral loop it exists to start.
 *
 * **The discount is deliberately not a lifetime one.** "Early sign-ups get a
 * discount" most naturally reads as a founding-member rate locked forever,
 * and that is the version to avoid: it is a permanent liability on every
 * renewal, for a cohort that will never be re-priced, in exchange for a
 * one-time conversion bump. `LAUNCH_DISCOUNT_YEARS` scopes it to the first
 * year instead — long enough to be a real reason to join now, bounded enough
 * that it stops costing once the cohort has proved it will stay.
 *
 * **Whether 3% is the right number is a separate question from whether the
 * mechanism works.** The arithmetic is in `discountBreakEvenLift` below,
 * which exists so the claim in docs/billing.md is checkable rather than
 * asserted: a discount of rate `d` pays for itself the moment it lifts
 * sign-ups by `d / (1 - d)`. At 3% that is a 3.1% lift, which is a low bar.
 * The risk is not the maths, it is that 3% of Premium is 54 cents a month and
 * the app already gives 15% for paying annually — five times more — so a
 * price-sensitive person has already taken the bigger discount and will not
 * notice this one. The rate is a single constant precisely so it can be
 * raised once there is real conversion data.
 *
 * Nothing here is a stored field on the subscription. Eligibility is derived
 * from `startedAt`, which the subscription already carries, so there is no
 * schema to migrate and no way for a stored flag to drift out of agreement
 * with when someone actually joined.
 */

/** The launch window: sign up inside it and the discount applies. */
export const LAUNCH_WINDOW_START = "2026-10-01T00:00:00.000Z";
export const LAUNCH_WINDOW_END = "2026-12-01T00:00:00.000Z";

/** 3%, as asked. One constant, because this is the number most likely to
 *  change once there is conversion data to change it against. */
export const LAUNCH_DISCOUNT_RATE = 0.03;

/** How long an early sign-up keeps the discount. Not forever — see the
 *  module doc for why a founding-member rate is the expensive version. */
export const LAUNCH_DISCOUNT_YEARS = 1;

/**
 * The sign-up lift a discount has to produce to pay for itself.
 *
 * Revenue with the discount is `N(1 + L) × P(1 - d)`; without it, `N × P`.
 * Those are equal when `(1 + L)(1 - d) = 1`, so the break-even lift is
 * `d / (1 - d)`. Encoded rather than described because a pricing claim that
 * cannot be checked is just a nice sentence.
 */
export function discountBreakEvenLift(rate: number): number {
  if (rate <= 0 || rate >= 1) throw new Error("A discount rate is between 0 and 1.");
  return rate / (1 - rate);
}

export function joinedDuringLaunch(startedAt: string): boolean {
  const at = new Date(startedAt).getTime();
  return at >= Date.parse(LAUNCH_WINDOW_START) && at < Date.parse(LAUNCH_WINDOW_END);
}

/** When an early sign-up's discount runs out — a year after they joined. */
export function launchDiscountEndsAt(startedAt: string): Date {
  const end = new Date(startedAt);
  end.setUTCFullYear(end.getUTCFullYear() + LAUNCH_DISCOUNT_YEARS);
  return end;
}

/** Whether this subscription is still inside its launch discount. */
export function launchDiscountApplies(sub: Pick<Subscription, "startedAt">, now: Date): boolean {
  if (!joinedDuringLaunch(sub.startedAt)) return false;
  return now.getTime() < launchDiscountEndsAt(sub.startedAt).getTime();
}

/**
 * What comes off a renewal for an early sign-up. Rounded down, so the
 * discount is never a fraction of a cent larger than the stated rate — the
 * same direction `commissionCentsFor` rounds, and for the same reason: a
 * rounding cent should never quietly favour the house.
 */
export function launchDiscountCentsFor(
  priceCents: number, sub: Pick<Subscription, "startedAt">, now: Date,
): number {
  if (!launchDiscountApplies(sub, now)) return 0;
  if (!Number.isInteger(priceCents) || priceCents <= 0) return 0;
  return Math.floor(priceCents * LAUNCH_DISCOUNT_RATE);
}

/** What an early sign-up actually pays. */
export function discountedPriceCents(
  priceCents: number, sub: Pick<Subscription, "startedAt">, now: Date,
): number {
  return priceCents - launchDiscountCentsFor(priceCents, sub, now);
}

/* ---------------------------------------------------------------------------
   Sharing
   ------------------------------------------------------------------------ */

/**
 * A referral code, in the same shape as the crew join code and share-grant
 * invite code already in the app (`ABC-DE4`): no I, O, 0 or 1, because these
 * get read aloud across a table and a code that needs spelling out defeats
 * the point.
 *
 * The referral is what the launch party is actually for. A discount buys one
 * cohort; a share loop buys the cohort after that at roughly zero
 * acquisition cost, which is the only growth line here that gets cheaper as
 * it grows.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 6;

export function isReferralCodeShaped(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/.test(code.trim().toUpperCase());
}

/** Case and spacing are forgiven; a code read off a phone screen at 1am
 *  should not fail on a lowercase letter or a missing hyphen. */
export function normalizeReferralCode(code: string): string {
  const bare = code.trim().toUpperCase().replace(/[^A-Z2-9]/g, "");
  if (bare.length !== REFERRAL_CODE_LENGTH) return "";
  return `${bare.slice(0, 3)}-${bare.slice(3)}`;
}

export function newReferralCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

/** One person's referral, recorded when a new account signs up with a code. */
export interface Referral {
  id: string;
  /** Whose code was used. */
  referrerId: string;
  /** The account that used it. */
  referredId: string;
  code: string;
  createdAt: string;
}

/** What a visitor is invited with. Kept here rather than in the web app so
 *  the wording is in one place across the share sheet, any email, and any
 *  future push. */
export function shareMessage(code: string, url: string): string {
  return `I'm using Safehubby to get home safe on a night out — check-ins, a ride when you need one, and someone who can actually show up. Use my code ${code} when you join: ${url}`;
}
