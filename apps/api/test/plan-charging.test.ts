import { describe, expect, it, vi } from "vitest";
import { autoRenewalTermsFor, findPlan, startSubscription } from "@safehubby/core";
import {
  SUBSCRIPTION_CHARGE_ATTEMPTS, collectSubscriptionCharges, renewDueSubscriptions, retryPastDueSubscriptions,
  type CardCharger,
} from "../src/billing.ts";
import { SEED } from "../src/seed.ts";
import type { Db, StoreLike } from "../src/store.ts";

const now = new Date("2027-01-01T00:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

function storeWith(opts: { card?: boolean } = { card: true }): StoreLike {
  const db: Db = structuredClone(SEED);
  db.travelers.push({ id: "t1", email: "t1@example.com", passwordHash: "x", displayName: "t1", planId: "premium-plus", homeLabel: "Home", emergencyContacts: [] });
  db.subscriptions.t1 = startSubscription({
    travelerId: "t1", planId: "premium-plus", cadence: "monthly", platform: "web", now,
    renewalConsent: {
      planId: "premium-plus", cadence: "monthly",
      priceCents: autoRenewalTermsFor("premium-plus", "monthly", now).priceCents, acceptedAt: now.toISOString(),
    },
  }).subscription;
  if (opts.card) {
    db.paymentMethods.t1 = { id: "pm_local", processor: "stripe", processorToken: "pm_1", brand: "visa", last4: "4242", addedAt: now.toISOString() };
    db.stripeCustomers.t1 = "cus_1";
  }
  return { data: db, update: (fn) => fn(db), reset: () => {}, save: () => {} };
}

/** Renews past the trial, leaving the charge for the card. */
function renewForCard(store: StoreLike, at: Date): string[] {
  let ids: string[] = [];
  store.update((db) => { ids = renewDueSubscriptions(db, at, { collect: true }).toCollect; });
  return ids;
}

const approves: CardCharger = vi.fn(async () => ({ id: "pi_ok" }));
const declines: CardCharger = async () => { throw new Error("Your card was declined."); };

describe("taking plan charges from the card", () => {
  it("leaves the renewal pending until the card is actually charged", () => {
    const store = storeWith();
    const ids = renewForCard(store, days(20));
    expect(ids).toHaveLength(1);
    expect(store.data.charges[0]).toMatchObject({ status: "pending", amountCents: findPlan("premium-plus").monthlyCents });
  });

  it("charges the saved card once, for the exact amount, keyed so a re-run never bills twice", async () => {
    const store = storeWith();
    const ids = renewForCard(store, days(20));
    const charger = vi.fn<CardCharger>(async () => ({ id: "pi_ok" }));
    await collectSubscriptionCharges(store, days(20), ids, charger);
    await collectSubscriptionCharges(store, days(20), ids, charger);

    expect(charger).toHaveBeenCalledTimes(1);
    expect(charger.mock.calls[0]![0]).toMatchObject({
      customerId: "cus_1", paymentMethodId: "pm_1", amountCents: findPlan("premium-plus").monthlyCents, idempotencyKey: ids[0],
    });
    expect(store.data.charges[0]).toMatchObject({ status: "settled", reference: "pi_ok" });
    expect(store.data.subscriptions.t1!.status).toBe("active");
  });

  it("fails the charge with the bank's reason and puts the plan past due — but keeps it working", async () => {
    const store = storeWith();
    const ids = renewForCard(store, days(20));
    expect(await collectSubscriptionCharges(store, days(20), ids, declines)).toEqual({ paid: 0, failed: 1 });
    expect(store.data.charges[0]).toMatchObject({ status: "failed", failureReason: "Your card was declined." });
    expect(store.data.subscriptions.t1!.status).toBe("past-due");
    expect(store.data.travelers.find((t) => t.id === "t1")!.planId).toBe("premium-plus");
  });

  it("says plainly when there is no card to charge", async () => {
    const store = storeWith({ card: false });
    await collectSubscriptionCharges(store, days(20), renewForCard(store, days(20)), approves);
    expect(store.data.charges[0]!.failureReason).toMatch(/no card or PayPal account on file/i);
    expect(store.data.subscriptions.t1!.status).toBe("past-due");
  });

  it("retries a decline a day later, not sooner, and recovers when it goes through", async () => {
    const store = storeWith();
    await collectSubscriptionCharges(store, days(20), renewForCard(store, days(20)), declines);

    expect(await retryPastDueSubscriptions(store, new Date(days(20).getTime() + 3_600_000), approves)).toEqual({ paid: 0, failed: 0, ended: 0 });
    expect(await retryPastDueSubscriptions(store, days(21), approves)).toEqual({ paid: 1, failed: 0, ended: 0 });
    expect(store.data.subscriptions.t1!.status).toBe("active");
    expect(store.data.charges.map((c) => c.status)).toEqual(["failed", "settled"]);
  });

  it("tries a new card straight away", async () => {
    const store = storeWith();
    await collectSubscriptionCharges(store, days(20), renewForCard(store, days(20)), declines);
    const r = await retryPastDueSubscriptions(store, days(20), approves, { travelerId: "t1", immediately: true });
    expect(r.paid).toBe(1);
  });

  it(`ends the plan after ${SUBSCRIPTION_CHARGE_ATTEMPTS} declined tries, back to Free`, async () => {
    const store = storeWith();
    await collectSubscriptionCharges(store, days(20), renewForCard(store, days(20)), declines);
    for (let d = 21; d < 20 + SUBSCRIPTION_CHARGE_ATTEMPTS; d++) await retryPastDueSubscriptions(store, days(d), declines);
    expect(store.data.charges.filter((c) => c.status === "failed")).toHaveLength(SUBSCRIPTION_CHARGE_ATTEMPTS);

    const r = await retryPastDueSubscriptions(store, days(20 + SUBSCRIPTION_CHARGE_ATTEMPTS), declines);
    expect(r.ended).toBe(1);
    expect(store.data.subscriptions.t1!.status).toBe("canceled");
    expect(store.data.travelers.find((t) => t.id === "t1")!.planId).toBe("free");
    expect(store.data.charges).toHaveLength(SUBSCRIPTION_CHARGE_ATTEMPTS);
  });

  it("still settles on the spot when no card processor is set up", () => {
    const store = storeWith();
    store.update((db) => { renewDueSubscriptions(db, days(20)); });
    expect(store.data.charges[0]!.status).toBe("settled");
  });
});
