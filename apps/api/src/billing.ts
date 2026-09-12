import {
  effectivePlan, findPlan, formatPrice, isRenewalDue, launchDiscountCentsFor, recordCharge,
  renew, settleCharge,
} from "@safehubby/core";
import type { Db } from "./store.ts";
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
}

export function renewDueSubscriptions(db: Db, now: Date): RenewalResult {
  const result: RenewalResult = { renewed: 0, chargedCents: 0, discountedCents: 0, storeRailPending: 0 };

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
      // No processor is wired in, so this settles immediately. When one is,
      // this is the line that becomes an await and can come back declined —
      // and `markPastDue` is what a decline should produce.
      db.charges.push(settleCharge(charge, now));
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
