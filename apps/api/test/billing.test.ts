import { describe, expect, it } from "vitest";
import { LAUNCH_DISCOUNT_RATE, findPlan, startSubscription } from "@safehubby/core";
import type { Subscription } from "@safehubby/core";
import { renewDueSubscriptions } from "../src/billing.ts";
import { SEED } from "../src/seed.ts";
import type { Db, Traveler } from "../src/store.ts";

const now = new Date("2026-03-01T00:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

const traveler = (id: string): Traveler => ({
  id, email: `${id}@example.com`, passwordHash: "x", displayName: id,
  planId: "free", homeLabel: "Home", emergencyContacts: [],
});

function dbWith(sub: Subscription): Db {
  const db = structuredClone(SEED);
  db.travelers.push(traveler(sub.travelerId));
  db.subscriptions[sub.travelerId] = sub;
  db.travelers[0]!.planId = sub.planId;
  return db;
}

const subFor = (planId: Parameters<typeof findPlan>[0], platform: "web" | "ios" = "web") =>
  startSubscription({ travelerId: "t1", planId, cadence: "monthly", platform, now }).subscription;

describe("renewDueSubscriptions", () => {
  it("leaves a period that has not run out alone", () => {
    const db = dbWith(subFor("premium-plus"));
    expect(renewDueSubscriptions(db, days(3))).toMatchObject({ renewed: 0, chargedCents: 0 });
    expect(db.subscriptions.t1!.status).toBe("trialing");
    expect(db.charges).toHaveLength(0);
  });

  it("converts a finished trial into a paid month and bills it", () => {
    const db = dbWith(subFor("premium-plus"));
    const result = renewDueSubscriptions(db, days(20));

    expect(result.renewed).toBe(1);
    expect(result.chargedCents).toBe(findPlan("premium-plus").monthlyCents);
    expect(db.subscriptions.t1!.status).toBe("active");
    expect(db.subscriptions.t1!.trialEndsAt).toBeUndefined();
    expect(db.charges).toHaveLength(1);
    expect(db.charges[0]).toMatchObject({ kind: "subscription", rail: "card", status: "settled" });
  });

  it("does not invent a renewal the App Store owns", () => {
    // Apple charges these on their own schedule and tells us with a server
    // notification. Renewing here would put money on a statement we never took.
    const db = dbWith(subFor("premium-plus", "ios"));
    const result = renewDueSubscriptions(db, days(20));

    expect(result).toMatchObject({ renewed: 0, chargedCents: 0, storeRailPending: 1 });
    expect(db.charges).toHaveLength(0);
    expect(db.subscriptions.t1!.status).toBe("trialing");
  });

  it("does not bill a free plan, and does not leave it stuck", () => {
    const db = dbWith(subFor("free"));
    const result = renewDueSubscriptions(db, days(45));
    expect(result.chargedCents).toBe(0);
    expect(result.renewed).toBe(1);
    expect(db.charges).toHaveLength(0);
  });

  it("drops a canceled account back to free once its period is up", () => {
    const db = dbWith({ ...subFor("family"), status: "canceled", canceledAt: now.toISOString() });
    renewDueSubscriptions(db, days(3));
    expect(db.travelers[0]!.planId).toBe("family");

    renewDueSubscriptions(db, days(20));
    expect(db.travelers[0]!.planId).toBe("free");
    // Cancelling stops the money, so nothing is charged on the way out.
    expect(db.charges).toHaveLength(0);
  });

  it("keeps the traveler's plan in step with the subscription", () => {
    const db = dbWith(subFor("premium-basic"));
    db.travelers[0]!.planId = "family";               // drifted somehow
    renewDueSubscriptions(db, days(1));
    expect(db.travelers[0]!.planId).toBe("premium-basic");
  });

  it("renews each due account once, across a whole database", () => {
    const db = dbWith(subFor("premium-basic"));
    db.travelers.push(traveler("t2"));
    db.subscriptions.t2 = startSubscription({
      travelerId: "t2", planId: "family", cadence: "monthly", platform: "web", now,
    }).subscription;

    const result = renewDueSubscriptions(db, days(20));
    expect(result.renewed).toBe(2);
    expect(db.charges).toHaveLength(2);
    expect(result.chargedCents).toBe(findPlan("premium-basic").monthlyCents + findPlan("family").monthlyCents);

    // Running it again the same instant must not double-bill.
    const again = renewDueSubscriptions(db, days(20));
    expect(again.renewed).toBe(0);
    expect(db.charges).toHaveLength(2);
  });

  it("is safe on a database with no subscriptions at all", () => {
    const db = structuredClone(SEED);
    expect(renewDueSubscriptions(db, now)).toEqual({ renewed: 0, chargedCents: 0, discountedCents: 0, storeRailPending: 0 });
  });
});

describe("the launch-party discount at renewal", () => {
  /** Renewal is the only place a subscription actually charges — signup is a
   *  free trial — so it is the only place the discount can be applied. */
  const launchSub = (startedAt: string): Subscription => ({
    ...subFor("premium-basic"),
    startedAt,
    currentPeriodEnd: startedAt,
  });

  it("takes the stated rate off an early sign-up's renewal", () => {
    const sub = launchSub("2026-10-15T00:00:00.000Z");
    const db = dbWith(sub);
    const at = new Date("2026-11-15T00:00:00.000Z");
    const result = renewDueSubscriptions(db, at);

    const full = findPlan("premium-basic").monthlyCents;
    const discount = Math.floor(full * LAUNCH_DISCOUNT_RATE);
    expect(result.renewed).toBe(1);
    expect(result.discountedCents).toBe(discount);
    expect(result.chargedCents).toBe(full - discount);
    // What the customer is charged, not just what the summary reports.
    expect(db.charges.at(-1)!.amountCents).toBe(full - discount);
  });

  it("says so on the charge, so the line item explains itself on a statement", () => {
    const db = dbWith(launchSub("2026-10-15T00:00:00.000Z"));
    renewDueSubscriptions(db, new Date("2026-11-15T00:00:00.000Z"));
    expect(db.charges.at(-1)!.description).toMatch(/launch-party discount/i);
  });

  it("charges full price outside the launch cohort, and says nothing about a discount", () => {
    const db = dbWith(launchSub("2027-05-01T00:00:00.000Z"));
    const result = renewDueSubscriptions(db, new Date("2027-06-01T00:00:00.000Z"));

    expect(result.renewed).toBe(1);
    expect(result.discountedCents).toBe(0);
    expect(result.chargedCents).toBe(findPlan("premium-basic").monthlyCents);
    expect(db.charges.at(-1)!.description).not.toMatch(/discount/i);
  });

  it("stops discounting after the first year, so the cohort is not cheap forever", () => {
    const db = dbWith(launchSub("2026-10-15T00:00:00.000Z"));
    // Thirteen months on: still an early sign-up, no longer discounted.
    const result = renewDueSubscriptions(db, new Date("2027-11-15T00:00:00.000Z"));
    expect(result.renewed).toBe(1);
    expect(result.discountedCents).toBe(0);
    expect(result.chargedCents).toBe(findPlan("premium-basic").monthlyCents);
  });
});
