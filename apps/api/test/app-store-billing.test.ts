import { describe, expect, it } from "vitest";
import { appStoreReference, findPlan, startSubscription } from "@safehubby/core";
import type { AppStoreNotification, AppStoreTransaction } from "../src/app-store.ts";
import {
  APP_STORE_SILENCE_DAYS,
  AppStoreBillingError,
  applyAppStoreNotification,
  linkAppStorePurchase,
} from "../src/app-store-billing.ts";
import { renewDueSubscriptions } from "../src/billing.ts";
import { SEED } from "../src/seed.ts";
import type { Db, Traveler } from "../src/store.ts";

const now = new Date("2027-03-01T12:00:00Z");
const DAY = 86_400_000;

const traveler = (id: string): Traveler => ({
  id, email: `${id}@example.com`, passwordHash: "x", displayName: id,
  planId: "free", homeLabel: "Home", emergencyContacts: [],
});

const freshDb = (): Db => {
  const db = structuredClone(SEED);
  db.travelers.push(traveler("t1"), traveler("t2"));
  return db;
};

const tx = (overrides: Partial<AppStoreTransaction> = {}): AppStoreTransaction => ({
  transactionId: "2000000100",
  originalTransactionId: "2000000001",
  bundleId: "app.safehubby",
  productId: "app.safehubby.premium-plus.monthly",
  purchaseDate: now.getTime() - 60_000,
  expiresDate: now.getTime() + 30 * DAY,
  environment: "Production",
  ...overrides,
});

const notification = (
  notificationType: string,
  transaction: AppStoreTransaction | null,
  subtype?: string,
): AppStoreNotification => ({
  notificationType, notificationUUID: `n-${notificationType}`, environment: "Production", transaction,
  ...(subtype ? { subtype } : {}),
});

describe("linkAppStorePurchase", () => {
  it("puts the account on the plan Apple sold, for the period Apple charged", () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx(), now);

    expect(db.subscriptions.t1).toMatchObject({
      planId: "premium-plus", cadence: "monthly", rail: "app-store", status: "active",
      currentPeriodEnd: new Date(now.getTime() + 30 * DAY).toISOString(),
      appStoreOriginalTransactionId: "2000000001",
    });
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("premium-plus");
    expect(db.charges).toEqual([
      expect.objectContaining({
        travelerId: "t1", rail: "app-store", status: "settled",
        amountCents: findPlan("premium-plus").monthlyCents, reference: appStoreReference("2000000100"),
      }),
    ]);
  });

  it("records an introductory free trial as a trial, with nothing charged", () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx({ offerDiscountType: "FREE_TRIAL" }), now);
    expect(db.subscriptions.t1).toMatchObject({ status: "trialing" });
    expect(db.charges).toEqual([]);
  });

  it("settles the pending in-app line instead of adding a second one", () => {
    const db = freshDb();
    db.subscriptions.t1 = startSubscription({
      travelerId: "t1", planId: "premium-plus", cadence: "monthly", platform: "ios", now,
    }).subscription;
    db.charges.push({
      id: "ch-pending", travelerId: "t1", kind: "subscription", rail: "app-store",
      description: "Premium Plus monthly", amountCents: 999, currency: "USD", status: "pending",
      createdAt: now.toISOString(),
    });
    linkAppStorePurchase(db, "t1", tx(), now, { chargeId: "ch-pending" });
    expect(db.charges).toHaveLength(1);
    expect(db.charges[0]).toMatchObject({ id: "ch-pending", status: "settled", reference: "apple:2000000100" });
  });

  it("will not settle a pending line with a purchase of a different plan", () => {
    const db = freshDb();
    db.subscriptions.t1 = startSubscription({
      travelerId: "t1", planId: "family", cadence: "monthly", platform: "ios", now,
    }).subscription;
    db.charges.push({
      id: "ch-family", travelerId: "t1", kind: "subscription", rail: "app-store",
      description: "Family monthly", amountCents: 1999, currency: "USD", status: "pending",
      createdAt: now.toISOString(),
    });
    // A cheaper product cannot pay for the Family line it was not bought for.
    expect(() => linkAppStorePurchase(db, "t1", tx(), now, { chargeId: "ch-family" })).toThrow(/different plan/);
    expect(db.charges[0]!.status).toBe("pending");

    // Linked without naming the line, it records its own and leaves Family pending.
    linkAppStorePurchase(db, "t1", tx(), now);
    expect(db.charges.map((c) => [c.id === "ch-family", c.status])).toEqual([[true, "pending"], [false, "settled"]]);
  });

  it("is idempotent when the app sends the same purchase twice", () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx(), now);
    linkAppStorePurchase(db, "t1", tx(), now);
    expect(db.charges).toHaveLength(1);
  });

  it("will not let one Apple subscription unlock a second account", () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx(), now);
    expect(() => linkAppStorePurchase(db, "t2", tx({ transactionId: "2000000999" }), now))
      .toThrow(AppStoreBillingError);
    expect(db.subscriptions.t2).toBeUndefined();
  });

  it("will not let a captured transaction settle someone else's charge", () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx(), now);
    delete db.subscriptions.t1!.appStoreOriginalTransactionId; // even if the link were lost
    expect(() => linkAppStorePurchase(db, "t2", tx(), now)).toThrow(/another/);
  });

  it("refuses products it does not sell, refunded purchases, and lapsed periods", () => {
    const db = freshDb();
    expect(() => linkAppStorePurchase(db, "t1", tx({ productId: "app.safehubby.platinum.monthly" }), now))
      .toThrow(/not sold/);
    expect(() => linkAppStorePurchase(db, "t1", tx({ revocationDate: now.getTime() }), now)).toThrow(/refunded/);
    expect(() => linkAppStorePurchase(db, "t1", tx({ expiresDate: now.getTime() - 1 }), now)).toThrow(/ended/);
    expect(db.subscriptions.t1).toBeUndefined();
  });
});

describe("applyAppStoreNotification", () => {
  const linked = () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx(), now);
    return db;
  };

  it("renews: new period, new settled line, and follows a plan change made in Settings", () => {
    const db = linked();
    const renewal = tx({
      transactionId: "2000000200",
      productId: "app.safehubby.family.annual",
      purchaseDate: now.getTime() + 30 * DAY,
      expiresDate: now.getTime() + 395 * DAY,
    });
    expect(applyAppStoreNotification(db, notification("DID_RENEW", renewal), now).outcome).toBe("renewed");

    expect(db.subscriptions.t1).toMatchObject({
      planId: "family", cadence: "annual", status: "active",
      currentPeriodEnd: new Date(now.getTime() + 395 * DAY).toISOString(),
    });
    expect(db.charges.map((c) => c.reference)).toEqual(["apple:2000000100", "apple:2000000200"]);

    // Apple retries notifications; a repeat must not bill twice.
    applyAppStoreNotification(db, notification("DID_RENEW", renewal), now);
    expect(db.charges).toHaveLength(2);
  });

  it("marks a failed renewal past-due without cutting off access", () => {
    const db = linked();
    applyAppStoreNotification(db, notification("DID_FAIL_TO_RENEW", tx()), now);
    expect(db.subscriptions.t1!.status).toBe("past-due");
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("premium-plus");
  });

  it("turning off auto-renew keeps the paid period; turning it back on restores it", () => {
    const db = linked();
    applyAppStoreNotification(db, notification("DID_CHANGE_RENEWAL_STATUS", tx(), "AUTO_RENEW_DISABLED"), now);
    expect(db.subscriptions.t1!.status).toBe("canceled");
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("premium-plus");

    applyAppStoreNotification(db, notification("DID_CHANGE_RENEWAL_STATUS", tx(), "AUTO_RENEW_ENABLED"), now);
    expect(db.subscriptions.t1!.status).toBe("active");
  });

  it("expiry ends the plan at Apple's expiry date", () => {
    const db = linked();
    const expired = tx({ expiresDate: now.getTime() - 1 });
    applyAppStoreNotification(db, notification("EXPIRED", expired, "VOLUNTARY"), now);
    expect(db.subscriptions.t1!.status).toBe("canceled");
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("free");
  });

  it("a refund marks the line refunded and ends access now", () => {
    const db = linked();
    applyAppStoreNotification(db, notification("REFUND", tx({ revocationDate: now.getTime() })), now);
    expect(db.charges[0]!.status).toBe("refunded");
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("free");
  });

  it("acknowledges notifications for purchases no account has linked yet", () => {
    const db = freshDb();
    expect(applyAppStoreNotification(db, notification("DID_RENEW", tx()), now).outcome).toBe("unlinked");
    expect(applyAppStoreNotification(db, notification("TEST", null), now).outcome).toBe("ignored");
  });
});

describe("renewDueSubscriptions and store subscriptions", () => {
  it("lapses an in-app subscription nobody ever bought from Apple once its trial ends", () => {
    // Otherwise `platform: "ios"` alone would be a paid plan forever: the
    // server never renews store subscriptions, so nothing would end it.
    const db = freshDb();
    const { subscription } = startSubscription({
      travelerId: "t1", planId: "premium-plus", cadence: "monthly", platform: "ios", now,
    });
    db.subscriptions.t1 = subscription;
    const after = new Date(new Date(subscription.currentPeriodEnd).getTime() + DAY);

    const result = renewDueSubscriptions(db, after);
    expect(result).toMatchObject({ lapsedUnverified: 1, storeRailPending: 0 });
    expect(db.subscriptions.t1!.status).toBe("canceled");
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("free");
    expect(db.charges).toEqual([]);
  });

  it("waits for Apple on a linked subscription, but not forever", () => {
    const db = freshDb();
    linkAppStorePurchase(db, "t1", tx(), now);
    const end = new Date(db.subscriptions.t1!.currentPeriodEnd).getTime();

    expect(renewDueSubscriptions(db, new Date(end + DAY))).toMatchObject({ storeRailPending: 1 });
    expect(db.subscriptions.t1!.status).toBe("active");

    // Apple retries a failed renewal for up to 60 days; silence past that
    // means the notification URL is broken, not that they are still paying.
    renewDueSubscriptions(db, new Date(end + (APP_STORE_SILENCE_DAYS + 1) * DAY));
    expect(db.subscriptions.t1!.status).toBe("canceled");
  });
});
