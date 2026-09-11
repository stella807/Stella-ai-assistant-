import type { Iso8601 } from "./types.ts";
import { TRIAL_DAYS, findPlan, type Plan, type PlanId } from "./billing.ts";
import { railFor, type BillingRail, type Platform } from "./wallet.ts";

/**
 * Subscription lifecycle, on the same ledger as everything else.
 *
 * The plan is no longer a field that flips instantly with no money attached.
 * It is a subscription with a period, a renewal date, a trial, and a rail —
 * and every amount it produces becomes an ordinary line in wallet.ts alongside
 * the rides and the pharmacy runs, so one screen can show the whole account.
 *
 * What this module does not do is take money; it says what is owed and when.
 * Settling that is the processor's job (a card on the web, the store's billing
 * inside a store app), and the ledger records the outcome either way.
 */

export type SubscriptionStatus = "trialing" | "active" | "past-due" | "canceled";
export type Cadence = "monthly" | "annual";

export interface Subscription {
  travelerId: string;
  planId: PlanId;
  cadence: Cadence;
  rail: BillingRail;
  status: SubscriptionStatus;
  startedAt: Iso8601;
  /** When the current paid (or trial) period runs out. */
  currentPeriodEnd: Iso8601;
  trialEndsAt?: Iso8601;
  canceledAt?: Iso8601;
}

/** What a plan change or renewal wants charged, and what to call the line. */
export interface AmountDue {
  cents: number;
  description: string;
}

export interface SubscriptionChange {
  subscription: Subscription;
  due: AmountDue | null;
}

export function priceOf(plan: Plan, cadence: Cadence): number {
  return cadence === "annual" ? plan.annualCents : plan.monthlyCents;
}

export function periodEnd(cadence: Cadence, from: Date): Date {
  const end = new Date(from.getTime());
  if (cadence === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

/**
 * Starts a subscription.
 *
 * A paid plan starts in a trial and is not charged today. Charging on the way
 * into a trial is the kind of thing that gets an app a reputation, and on a
 * safety product the trust matters more than the fortnight of revenue.
 */
export function startSubscription(input: {
  travelerId: string;
  planId: PlanId;
  cadence: Cadence;
  platform: Platform;
  now: Date;
}): SubscriptionChange {
  const plan = findPlan(input.planId);
  const rail = railFor("subscription", input.platform);
  const price = priceOf(plan, input.cadence);

  if (price === 0) {
    return {
      subscription: {
        travelerId: input.travelerId,
        planId: plan.id,
        cadence: input.cadence,
        rail,
        status: "active",
        startedAt: input.now.toISOString(),
        // A free plan does not lapse, so its period end is a formality.
        currentPeriodEnd: periodEnd(input.cadence, input.now).toISOString(),
      },
      due: null,
    };
  }

  const trialEnd = new Date(input.now.getTime() + TRIAL_DAYS * 86_400_000);
  return {
    subscription: {
      travelerId: input.travelerId,
      planId: plan.id,
      cadence: input.cadence,
      rail,
      status: "trialing",
      startedAt: input.now.toISOString(),
      currentPeriodEnd: trialEnd.toISOString(),
      trialEndsAt: trialEnd.toISOString(),
    },
    due: null,
  };
}

/** The share of the current period still unused, 0–1. */
export function unusedFraction(sub: Subscription, now: Date): number {
  const end = new Date(sub.currentPeriodEnd).getTime();
  const start = new Date(sub.startedAt).getTime();
  const span = end - start;
  if (span <= 0) return 0;
  const left = end - now.getTime();
  return Math.min(1, Math.max(0, left / span));
}

/**
 * Credit for the part of the current period already paid for and not used.
 *
 * Someone upgrading mid-month has already paid for days they are about to stop
 * using; billing the new plan in full on top of that charges twice for the same
 * days. A trial has no credit because nothing was paid.
 */
export function prorationCreditCents(sub: Subscription, now: Date): number {
  if (sub.status !== "active") return 0;
  const paid = priceOf(findPlan(sub.planId), sub.cadence);
  return Math.floor(paid * unusedFraction(sub, now));
}

/**
 * Switches plans. The period restarts, the unused remainder of the old one
 * comes off the price, and a downgrade never produces a bill — a negative
 * difference is carried as nothing owed rather than as a refund, because
 * refunding through a store rail is the store's decision, not ours.
 */
export function changePlan(input: {
  subscription: Subscription;
  planId: PlanId;
  cadence: Cadence;
  platform: Platform;
  now: Date;
}): SubscriptionChange {
  const plan = findPlan(input.planId);
  const price = priceOf(plan, input.cadence);
  const rail = railFor("subscription", input.platform);

  if (price === 0) {
    return {
      subscription: {
        ...input.subscription,
        planId: plan.id,
        cadence: input.cadence,
        rail,
        status: "active",
        startedAt: input.now.toISOString(),
        currentPeriodEnd: periodEnd(input.cadence, input.now).toISOString(),
        trialEndsAt: undefined,
        canceledAt: undefined,
      },
      due: null,
    };
  }

  // Still inside a trial: keep the trial, swap the plan, charge nothing. The
  // trial is on the account, not on the plan they happened to pick first.
  if (input.subscription.status === "trialing") {
    return {
      subscription: {
        ...input.subscription,
        planId: plan.id,
        cadence: input.cadence,
        rail,
        status: "trialing",
        canceledAt: undefined,
      },
      due: null,
    };
  }

  const credit = prorationCreditCents(input.subscription, input.now);
  const cents = Math.max(0, price - credit);
  return {
    subscription: {
      ...input.subscription,
      planId: plan.id,
      cadence: input.cadence,
      rail,
      status: "active",
      startedAt: input.now.toISOString(),
      currentPeriodEnd: periodEnd(input.cadence, input.now).toISOString(),
      trialEndsAt: undefined,
      canceledAt: undefined,
    },
    due: cents > 0
      ? {
        cents,
        description: credit > 0
          ? `${plan.name} ${input.cadence} — ${formatCents(credit)} credit applied`
          : `${plan.name} ${input.cadence}`,
      }
      : null,
  };
}

/** Renews at the end of a period or a trial, producing the line to charge. */
export function renew(sub: Subscription, now: Date): SubscriptionChange {
  const plan = findPlan(sub.planId);
  const price = priceOf(plan, sub.cadence);
  const next = {
    ...sub,
    status: "active" as SubscriptionStatus,
    startedAt: now.toISOString(),
    currentPeriodEnd: periodEnd(sub.cadence, now).toISOString(),
    trialEndsAt: undefined,
  };
  return { subscription: next, due: price > 0 ? { cents: price, description: `${plan.name} ${sub.cadence}` } : null };
}

/**
 * Cancels without cutting anyone off mid-period. Access runs to the end of
 * what was paid for; on a product people rely on to get home, revoking paid
 * features the instant someone clicks cancel is the wrong default.
 */
export function cancelSubscription(sub: Subscription, now: Date): Subscription {
  if (sub.status === "canceled") return sub;
  return { ...sub, status: "canceled", canceledAt: now.toISOString() };
}

export function markPastDue(sub: Subscription): Subscription {
  return sub.status === "canceled" ? sub : { ...sub, status: "past-due" };
}

/**
 * The plan actually in effect right now.
 *
 * A canceled subscription keeps its plan until the period it paid for runs
 * out, then falls back to free. Past-due keeps working: locking a paid safety
 * feature the moment a card bounces means someone finds out their ride home is
 * gone at 1am, and SOS and check-ins are free regardless.
 */
export function effectivePlan(sub: Subscription | null, now: Date): PlanId {
  if (!sub) return "free";
  if (sub.status === "canceled" && now.getTime() >= new Date(sub.currentPeriodEnd).getTime()) return "free";
  return sub.planId;
}

/** Whether the period has run out and a renewal is owed. */
export function isRenewalDue(sub: Subscription, now: Date): boolean {
  if (sub.status === "canceled") return false;
  return now.getTime() >= new Date(sub.currentPeriodEnd).getTime();
}

export function describeSubscription(sub: Subscription | null, now: Date): string {
  if (!sub || sub.planId === "free") return "You are on the free plan. SOS, check-ins, location sharing and drink count never cost anything.";
  const when = new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (sub.status === "trialing") return `Free trial — first charge on ${when}. Cancel before then and you are not billed.`;
  if (sub.status === "canceled") {
    return now.getTime() >= new Date(sub.currentPeriodEnd).getTime()
      ? "Canceled. You are back on the free plan."
      : `Canceled — your plan stays on until ${when}, then goes back to free.`;
  }
  if (sub.status === "past-due") return `Payment did not go through. Your features are still on; update your card to keep them past ${when}.`;
  return `Renews ${when}.`;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
