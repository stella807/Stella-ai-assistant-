import {
  appStoreReference, cancelSubscription, effectivePlan, findPlan, joinedAtOf, markPastDue,
  parseAppStoreProductId, priceOf, recordCharge, refundCharge, settleCharge,
  type Subscription,
} from "@safehubby/core";
import type { AppStoreNotification, AppStoreTransaction } from "./app-store.ts";
import { newId, type Db } from "./store.ts";

/**
 * Turns verified App Store purchases and notifications into the account's
 * subscription and ledger lines.
 *
 * Everything arriving here has already passed app-store.ts, so it really came
 * from Apple. What this module decides is which account it belongs to, and
 * that is where the remaining abuse lives: one Apple ID's subscription
 * unlocking many accounts, or one transaction settling someone else's charge.
 * Apple is the source of truth for dates on this rail, so period ends come
 * from its transactions, never from our own calendar arithmetic.
 */

/** Apple retries a failed renewal for up to 60 days. Past that with no word,
 *  the notification URL is broken, not the subscriber still paying. */
export const APP_STORE_SILENCE_DAYS = 60;

export class AppStoreBillingError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

function ownerOf(db: Db, originalTransactionId: string): string | null {
  for (const [travelerId, sub] of Object.entries(db.subscriptions)) {
    if (sub.appStoreOriginalTransactionId === originalTransactionId) return travelerId;
  }
  return null;
}

function syncTravelerPlan(db: Db, travelerId: string, now: Date): void {
  const traveler = db.travelers.find((t) => t.id === travelerId);
  if (traveler) traveler.planId = effectivePlan(db.subscriptions[travelerId] ?? null, now);
}

/**
 * Puts a settled line on the ledger for a paid Apple transaction, once.
 *
 * Settles `chargeId` (or the account's latest pending in-app subscription
 * line) when there is one, so a plan change bought in the app shows as one
 * line rather than a pending one plus a paid one. Apple charged its own
 * localized price; the ledger records our price for the plan, the same
 * number every other screen shows.
 */
function settleTransaction(
  db: Db, travelerId: string, transaction: AppStoreTransaction, sub: Subscription, now: Date,
  pendingLine: { chargeId?: string; allowed: boolean } = { allowed: false },
): void {
  const reference = appStoreReference(transaction.transactionId);
  if (db.charges.some((c) => c.reference === reference)) return;

  const pending = pendingLine.allowed
    ? db.charges
      .filter((c) => c.travelerId === travelerId && c.rail === "app-store" && c.kind === "subscription" && c.status === "pending")
      .filter((c) => pendingLine.chargeId === undefined || c.id === pendingLine.chargeId)
    : [];
  const target = pending[pending.length - 1];
  if (target) {
    const index = db.charges.indexOf(target);
    db.charges[index] = settleCharge(target, now, undefined, reference);
    return;
  }

  const plan = findPlan(sub.planId);
  const charge = recordCharge({
    id: newId("ch"),
    travelerId,
    kind: "subscription",
    platform: "ios",
    description: `${plan.name} ${sub.cadence}`,
    amountCents: priceOf(plan, sub.cadence),
    now,
  });
  db.charges.push(settleCharge(charge, now, undefined, reference));
}

/**
 * Links a purchase the app just made (StoreKit's jwsRepresentation, verified)
 * to the signed-in account.
 */
export function linkAppStorePurchase(
  db: Db, travelerId: string, transaction: AppStoreTransaction, now: Date, options: { chargeId?: string } = {},
): Subscription {
  const product = parseAppStoreProductId(transaction.productId);
  if (!product) throw new AppStoreBillingError(400, `"${transaction.productId}" is not sold by Safehubby.`);
  if (transaction.revocationDate !== undefined) {
    throw new AppStoreBillingError(409, "Apple has refunded or revoked this purchase.");
  }
  if (transaction.expiresDate <= now.getTime()) {
    throw new AppStoreBillingError(409, "This App Store subscription period has already ended.");
  }

  // One Apple subscription, one account. Family Sharing and a shared Apple ID
  // are real, but the plan is per person and priced that way.
  const owner = ownerOf(db, transaction.originalTransactionId);
  const reference = appStoreReference(transaction.transactionId);
  const settledElsewhere = db.charges.find((c) => c.reference === reference && c.travelerId !== travelerId);
  if ((owner && owner !== travelerId) || settledElsewhere) {
    throw new AppStoreBillingError(409, "This App Store subscription already belongs to another Safehubby account.");
  }

  const existing = db.subscriptions[travelerId];
  // A pending in-app line was recorded for the plan the account is on; only a
  // purchase of that same plan may settle it.
  const samePlan = existing?.planId === product.planId && existing?.cadence === product.cadence;
  if (options.chargeId !== undefined && !samePlan) {
    throw new AppStoreBillingError(409, "This purchase is for a different plan than the one this charge is for.");
  }
  const freeTrial = transaction.offerDiscountType === "FREE_TRIAL";
  const subscription: Subscription = {
    travelerId,
    planId: product.planId,
    cadence: product.cadence,
    rail: "app-store",
    status: freeTrial ? "trialing" : "active",
    startedAt: iso(transaction.purchaseDate),
    joinedAt: existing ? joinedAtOf(existing) : iso(transaction.purchaseDate),
    currentPeriodEnd: iso(transaction.expiresDate),
    ...(freeTrial ? { trialEndsAt: iso(transaction.expiresDate) } : {}),
    appStoreOriginalTransactionId: transaction.originalTransactionId,
  };
  db.subscriptions[travelerId] = subscription;
  if (!freeTrial) {
    settleTransaction(db, travelerId, transaction, subscription, now, {
      ...(options.chargeId !== undefined ? { chargeId: options.chargeId } : {}),
      allowed: samePlan,
    });
  }
  syncTravelerPlan(db, travelerId, now);
  return subscription;
}

export type NotificationOutcome =
  | "renewed" | "past-due" | "canceled" | "reactivated" | "expired" | "refunded" | "unlinked" | "ignored";

/** Applies an App Store Server Notification V2 (verified) to the account it names. */
export function applyAppStoreNotification(
  db: Db, notification: AppStoreNotification, now: Date,
): { outcome: NotificationOutcome; travelerId?: string } {
  const transaction = notification.transaction;
  if (!transaction) return { outcome: "ignored" };
  // Apple can notify before the app has linked the purchase (SUBSCRIBED in
  // particular). Acknowledged rather than failed: a non-2xx makes Apple retry
  // for days, and the link that follows carries the same information.
  const travelerId = ownerOf(db, transaction.originalTransactionId);
  if (!travelerId) return { outcome: "unlinked" };
  const sub = db.subscriptions[travelerId]!;

  let outcome: NotificationOutcome = "ignored";
  switch (notification.notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW": {
      // The renewal's product is what Apple charged for, which is how a plan
      // change made in iOS Settings reaches the account.
      const product = parseAppStoreProductId(transaction.productId);
      const renewed: Subscription = {
        ...sub,
        ...(product ? { planId: product.planId, cadence: product.cadence } : {}),
        status: transaction.offerDiscountType === "FREE_TRIAL" ? "trialing" : "active",
        startedAt: iso(transaction.purchaseDate),
        currentPeriodEnd: iso(transaction.expiresDate),
        trialEndsAt: undefined,
        canceledAt: undefined,
      };
      db.subscriptions[travelerId] = renewed;
      if (renewed.status === "active") settleTransaction(db, travelerId, transaction, renewed, now);
      outcome = "renewed";
      break;
    }
    case "DID_FAIL_TO_RENEW":
      // Access stays on, as for a bounced card: see effectivePlan.
      db.subscriptions[travelerId] = markPastDue(sub);
      outcome = "past-due";
      break;
    case "DID_CHANGE_RENEWAL_STATUS":
      if (notification.subtype === "AUTO_RENEW_DISABLED") {
        db.subscriptions[travelerId] = cancelSubscription(sub, now);
        outcome = "canceled";
      } else if (notification.subtype === "AUTO_RENEW_ENABLED" && sub.status === "canceled"
        && new Date(sub.currentPeriodEnd).getTime() > now.getTime()) {
        db.subscriptions[travelerId] = { ...sub, status: "active", canceledAt: undefined };
        outcome = "reactivated";
      }
      break;
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
      db.subscriptions[travelerId] = {
        ...cancelSubscription(sub, now),
        currentPeriodEnd: iso(Math.min(transaction.expiresDate, now.getTime())),
      };
      outcome = "expired";
      break;
    case "REFUND":
    case "REVOKE": {
      const reference = appStoreReference(transaction.transactionId);
      const index = db.charges.findIndex((c) => c.reference === reference && c.status === "settled");
      if (index !== -1) db.charges[index] = refundCharge(db.charges[index]!, now);
      // Refunded means not paid for, so access ends now rather than at the
      // end of a period Apple has handed the money back for.
      db.subscriptions[travelerId] = { ...cancelSubscription(sub, now), currentPeriodEnd: now.toISOString() };
      outcome = "refunded";
      break;
    }
    default:
      break;
  }
  syncTravelerPlan(db, travelerId, now);
  return { outcome, travelerId };
}
