import type { Cadence } from "./subscription.ts";
import { TRIAL_DAYS, findPlan, type PlanId } from "./billing.ts";
import { billingStartsAt } from "./promotions.ts";
import type { Iso8601 } from "./types.ts";

/**
 * What a subscriber has to be told before a recurring charge can begin, and
 * the record that they were told it.
 *
 * California's Automatic Renewal Law (Bus. & Prof. Code §17600 et seq.) is
 * the binding one here, because Los Angeles is a launch market. It asks for
 * four things, and this module exists to make three of them impossible to
 * skip:
 *
 *  1. The renewal terms, **clearly and conspicuously**, before the charge —
 *     and in visual proximity to the thing the subscriber taps to agree.
 *  2. **Affirmative consent** to those terms specifically, not buried in a
 *     general terms-of-service acceptance.
 *  3. An **acknowledgment** afterwards, retainable, carrying the terms, the
 *     cancellation policy and how to cancel.
 *  4. Cancellation as easy as signing up, which the app already has: cancel
 *     to Free is one tap and deliberately stays self-service — see
 *     `requiresHelpDeskToDowngrade` in subscription.ts.
 *
 * The enforcement that matters is `assertRenewalConsent`: a paid subscription
 * cannot be created without a recorded consent that names the same plan,
 * cadence and price the subscriber actually saw. A disclosure somebody can
 * forget to render is not a disclosure, and a consent stored as a bare
 * boolean proves nothing about *what* was agreed to.
 *
 * Nothing here is legal advice or a substitute for counsel reviewing the
 * final wording. It is the plumbing that makes the wording enforceable.
 */

export interface AutoRenewalTerms {
  planId: PlanId;
  planName: string;
  cadence: Cadence;
  /** What recurs, in cents — the amount charged each period. */
  priceCents: number;
  /** When the first charge actually lands. Never "today" for somebody who
   *  joins before the service runs: see `billingStartsAt`. */
  firstChargeAt: Iso8601;
  /** Free-trial length in days, or 0 where there is none. */
  trialDays: number;
  /** When the trial ends and billing begins. Absent where there is no trial. */
  trialEndsAt?: Iso8601;
}

/**
 * The terms for an offer, derived rather than written down.
 *
 * `firstChargeAt` is the one worth reading twice. A subscriber joining during
 * the pre-launch window is not charged on signup and not charged when a
 * fourteen-day trial would ordinarily elapse — the trial itself starts at
 * go-live. Telling them "your first charge is today plus fourteen days" would
 * be a false disclosure, which is worse than none.
 */
export function autoRenewalTermsFor(
  planId: PlanId,
  cadence: Cadence,
  joinedAt: Date,
): AutoRenewalTerms {
  const plan = findPlan(planId);
  const priceCents = cadence === "annual" ? plan.annualCents : plan.monthlyCents;

  if (priceCents === 0) {
    // A free plan does not auto-renew into a charge, so it has no terms to
    // disclose. Callers still get a shape back rather than a null to unwrap.
    return {
      planId: plan.id, planName: plan.name, cadence, priceCents: 0,
      firstChargeAt: joinedAt.toISOString(), trialDays: 0,
    };
  }

  const trialStart = billingStartsAt(joinedAt);
  const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS * 86_400_000);
  return {
    planId: plan.id,
    planName: plan.name,
    cadence,
    priceCents,
    trialDays: TRIAL_DAYS,
    trialEndsAt: trialEnd.toISOString(),
    firstChargeAt: trialEnd.toISOString(),
  };
}

/** Whether this offer is one the ARL disclosure applies to at all. */
export function requiresRenewalDisclosure(terms: AutoRenewalTerms): boolean {
  return terms.priceCents > 0;
}

/**
 * The subscriber's recorded agreement.
 *
 * It carries the price and the plan it was given for, so a consent cannot
 * drift into covering an offer the subscriber never saw. If the price changed
 * between the screen and the submit, the consent no longer matches and the
 * subscription is refused rather than created at the new price.
 */
export interface RenewalConsent {
  planId: PlanId;
  cadence: Cadence;
  /** The price shown on the screen where consent was given. */
  priceCents: number;
  acceptedAt: Iso8601;
}

export class RenewalConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenewalConsentError";
  }
}

/**
 * Refuses a paid subscription whose consent is missing or does not match
 * what was offered. Free plans need none.
 *
 * Deliberately a throw rather than a boolean: a caller that forgets to check
 * a boolean creates the subscription anyway, which is the exact failure the
 * law is about.
 */
export function assertRenewalConsent(
  terms: AutoRenewalTerms,
  consent: RenewalConsent | undefined,
): void {
  if (!requiresRenewalDisclosure(terms)) return;
  if (!consent) {
    throw new RenewalConsentError(
      "This plan renews automatically. The renewal terms have to be shown and agreed to before it can start.",
    );
  }
  if (consent.planId !== terms.planId || consent.cadence !== terms.cadence) {
    throw new RenewalConsentError("That agreement was for a different plan.");
  }
  if (consent.priceCents !== terms.priceCents) {
    throw new RenewalConsentError(
      "The price changed since those terms were shown. Review the new terms before starting.",
    );
  }
}

/**
 * How long before a price rise a subscriber must be told. California requires
 * notice before a *materially different* amount is charged; thirty days is
 * the conventional window and leaves room for a billing cycle to turn over.
 */
export const PRICE_CHANGE_NOTICE_DAYS = 30;

export function priceChangeNoticeDueAt(effectiveAt: Date): Date {
  return new Date(effectiveAt.getTime() - PRICE_CHANGE_NOTICE_DAYS * 86_400_000);
}
