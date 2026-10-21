import {
  effectivePlan, failCharge, findPlan, formatPrice, isRenewalDue, launchDiscountCentsFor, markPastDue, recordCharge,
  renew, settleCharge, type Charge,
} from "@safehubby/core";
import type { Db, StoreLike } from "./store.ts";
import { newId } from "./store.ts";

/**
 * Renewals, run on a timer.
 *
 * A subscription with a renewal date and nothing that advances it is a field,
 * not a subscription — the period would sail past and the account would keep
 * its paid features forever. This is the thing that makes the date mean
 * something.
 *
 * It deliberately handles only card-rail subscriptions. An App Store or Play
 * subscription renews on Apple's or Google's schedule, charged by them; the
 * only correct way to learn it happened is their server-to-server
 * notification, and inventing a renewal here would put a line on the user's
 * statement for money we never took. Those are left exactly as they are until
 * that webhook exists, and `storeRailPending` reports how many are waiting on
 * it rather than letting the gap pass silently.
 */
export interface RenewalResult {
  renewed: number;
  chargedCents: number;
  /** Given away to launch-party early sign-ups this sweep — tracked so the
   *  cost of the promotion is a number somebody can look at, not a guess. */
  discountedCents: number;
  /** Store-rail subscriptions past their period that only the store can renew. */
  storeRailPending: number;
  /** Charges left pending for a card processor to take — see `collectSubscriptionCharges`. */
  toCollect: string[];
}

/**
 * `collect` is true when a card processor is set up: the renewal's charge is
 * then left pending, to be taken from the card by `collectSubscriptionCharges`
 * once this synchronous sweep has saved. Without one it is settled on the spot,
 * the way it always was, so a server with no payment processor behaves as before.
 */
export function renewDueSubscriptions(db: Db, now: Date, opts: { collect?: boolean } = {}): RenewalResult {
  const result: RenewalResult = { renewed: 0, chargedCents: 0, discountedCents: 0, storeRailPending: 0, toCollect: [] };

  for (const [travelerId, sub] of Object.entries(db.subscriptions)) {
    if (!isRenewalDue(sub, now)) continue;

    if (sub.rail !== "card") {
      result.storeRailPending += 1;
      continue;
    }

    const { subscription, due } = renew(sub, now);
    db.subscriptions[travelerId] = subscription;
    result.renewed += 1;

    if (due) {
      // The launch-party discount lands here, on the renewal, because that is
      // the only place a subscription actually charges anything — signup
      // starts a free trial. Derived from `startedAt` rather than a stored
      // flag, so it expires on its own after LAUNCH_DISCOUNT_YEARS with
      // nothing to sweep. See promotions.ts.
      const discountCents = launchDiscountCentsFor(due.cents, subscription, now);
      const chargedCents = due.cents - discountCents;
      const charge = recordCharge({
        id: newId("ch"),
        travelerId,
        kind: "subscription",
        platform: "web",
        description: discountCents > 0
          ? `${due.description} — launch-party discount ${formatPrice(discountCents)} off`
          : due.description,
        amountCents: chargedCents,
        now,
      });
      if (opts.collect) {
        db.charges.push(charge);
        result.toCollect.push(charge.id);
      } else {
        db.charges.push(settleCharge(charge, now));
      }
      result.chargedCents += chargedCents;
      result.discountedCents += discountCents;
    }
  }

  // Keep the denormalized plan on the traveler in step with the subscription,
  // since every feature gate reads that field.
  for (const traveler of db.travelers) {
    const sub = db.subscriptions[traveler.id] ?? null;
    const plan = effectivePlan(sub, now);
    if (traveler.planId !== plan) traveler.planId = findPlan(plan).id;
  }

  return result;
}

/* ---------------------------------------------------------------------------
   Taking plan charges from the card
   ------------------------------------------------------------------------ */

/** Takes a payment from a saved payment method. The PayPal charge in
 *  production; a stub in tests. */
export type CardCharger = (input: {
  processor: "paypal";
  paymentMethodId: string; method?: { brand: string; last4: string };
  amountCents: number; description: string; idempotencyKey: string;
}) => Promise<{ id: string }>;

/** Declined plan charges are retried once a day, this many tries in all. */
export const SUBSCRIPTION_CHARGE_ATTEMPTS = 3;
const RETRY_AFTER_MS = 24 * 60 * 60_000;

/**
 * Takes each pending plan charge from the member's saved PayPal account.
 *
 * A decline fails the charge with the bank's reason and puts the plan
 * past-due. Past-due keeps working (see `effectivePlan`), because cutting off
 * someone's ride home the moment a card bounces is the wrong default; the
 * retries below are what eventually settle it either way.
 */
export async function collectSubscriptionCharges(
  store: StoreLike, now: Date, chargeIds: string[], charge: CardCharger,
): Promise<{ paid: number; failed: number }> {
  let paid = 0;
  let failed = 0;
  for (const id of chargeIds) {
    const line = store.data.charges.find((c) => c.id === id);
    if (!line || line.status !== "pending") continue;
    const method = store.data.paymentMethods[line.travelerId];
    let outcome: { ref: string } | { reason: string };
    if (method?.processor !== "paypal" || !method.processorToken) {
      outcome = { reason: "There is no PayPal account on file to charge. Add one under Payments." };
    } else {
      try {
        const intent = await charge({
          processor: "paypal", paymentMethodId: method.processorToken,
          method: { brand: method.brand, last4: method.last4 }, amountCents: line.amountCents,
          description: `Safehubby — ${line.description}`, idempotencyKey: line.id,
        });
        outcome = { ref: intent.id };
      } catch (err) {
        outcome = { reason: err instanceof Error ? err.message : "Your payment could not be taken." };
      }
    }
    store.update((db) => {
      const i = db.charges.findIndex((c) => c.id === id);
      if (i < 0) return;
      const sub = db.subscriptions[line.travelerId];
      if ("ref" in outcome) {
        db.charges[i] = settleCharge(db.charges[i]!, now, undefined, outcome.ref);
        if (sub?.status === "past-due") db.subscriptions[line.travelerId] = { ...sub, status: "active" };
      } else {
        db.charges[i] = failCharge(db.charges[i]!, outcome.reason, now);
        if (sub) db.subscriptions[line.travelerId] = markPastDue(sub);
      }
    });
    if ("ref" in outcome) paid += 1; else failed += 1;
  }
  return { paid, failed };
}

/** The plan charges for the period a subscription is in, newest last. */
function periodCharges(db: Db, travelerId: string, periodStart: string): Charge[] {
  return db.charges
    .filter((c) => c.travelerId === travelerId && c.kind === "subscription" && c.createdAt >= periodStart)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Tries a past-due plan's charge again, once a day. After the last try the
 * plan ends now and the account goes back to Free — a period nobody paid for
 * is not one to keep giving away, and Free keeps SOS and check-ins working.
 *
 * `immediately` skips the day's wait, for when the member has just saved a
 * new card and the next try should be with it.
 */
export async function retryPastDueSubscriptions(
  store: StoreLike, now: Date, charge: CardCharger, opts: { travelerId?: string; immediately?: boolean } = {},
): Promise<{ paid: number; failed: number; ended: number }> {
  const retry: string[] = [];
  let ended = 0;
  store.update((db) => {
    for (const [travelerId, sub] of Object.entries(db.subscriptions)) {
      if (sub.status !== "past-due" || sub.rail !== "card") continue;
      if (opts.travelerId && opts.travelerId !== travelerId) continue;
      const lines = periodCharges(db, travelerId, sub.startedAt);
      const last = lines.at(-1);
      if (!last || last.status !== "failed") continue;
      const failures = lines.filter((c) => c.status === "failed").length;
      if (failures >= SUBSCRIPTION_CHARGE_ATTEMPTS) {
        db.subscriptions[travelerId] = { ...sub, status: "canceled", canceledAt: now.toISOString(), currentPeriodEnd: now.toISOString() };
        const traveler = db.travelers.find((t) => t.id === travelerId);
        if (traveler) traveler.planId = "free";
        ended += 1;
        continue;
      }
      const failedAt = new Date(last.settledAt ?? last.createdAt).getTime();
      if (!opts.immediately && now.getTime() - failedAt < RETRY_AFTER_MS) continue;
      const again = recordCharge({
        id: newId("ch"), travelerId, kind: "subscription", platform: "web",
        description: last.description, amountCents: last.amountCents, now,
      });
      db.charges.push(again);
      retry.push(again.id);
    }
  });
  const { paid, failed } = await collectSubscriptionCharges(store, now, retry, charge);
  return { paid, failed, ended };
}
