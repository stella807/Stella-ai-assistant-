import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleStripeWebhook, verifyStripeSignature } from "../src/stripe-webhook.ts";
import { renewDueSubscriptions } from "../src/billing.ts";
import { SEED } from "../src/seed.ts";
import type { Db, StoreLike } from "../src/store.ts";

const ENV = { ...process.env };
const SECRET = "whsec_test";
const NOW = new Date("2027-01-01T00:00:00Z");

const sign = (raw: string, at = NOW, secret = SECRET) => {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
};
const event = (type: string, object: Record<string, unknown>) => JSON.stringify({ id: `evt_${type}`, type, data: { object } });

function storeWithMember(): { db: Db; store: StoreLike } {
  const db: Db = structuredClone(SEED);
  db.travelers.push({ id: "t1", email: "t1@example.com", passwordHash: "x", displayName: "t1", planId: "free", homeLabel: "Home", emergencyContacts: [] });
  return { db, store: { data: db, update: (fn) => fn(db), reset: () => {}, save: () => {} } };
}
const completed = {
  id: "cs_1", mode: "subscription", subscription: "sub_1", payment_status: "paid", amount_total: 9399,
  metadata: { travelerId: "t1", planId: "premium-basic", cadence: "monthly" },
};
const deliver = (store: StoreLike, raw: string, at = NOW) => handleStripeWebhook(store, raw, sign(raw, at), at);

describe("Stripe webhook", () => {
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = SECRET; });
  afterEach(() => { process.env = { ...ENV }; });

  it("refuses anything unsigned, forged, stale, or with no secret configured", () => {
    const raw = event("checkout.session.completed", completed);
    expect(() => verifyStripeSignature(raw, undefined, SECRET, NOW)).toThrow(/missing/i);
    expect(() => verifyStripeSignature(raw, sign(raw, NOW, "whsec_wrong"), SECRET, NOW)).toThrow(/does not match/i);
    expect(() => verifyStripeSignature(`${raw} `, sign(raw), SECRET, NOW)).toThrow(/does not match/i);
    expect(() => verifyStripeSignature(raw, sign(raw, new Date(NOW.getTime() - 10 * 60_000)), SECRET, NOW)).toThrow(/too old/i);
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { store } = storeWithMember();
    expect(() => deliver(store, raw)).toThrow(/not set up/i);
  });

  it("puts the member on the plan they paid for, once, and records the payment", () => {
    const { db, store } = storeWithMember();
    const raw = event("checkout.session.completed", completed);
    expect(deliver(store, raw).handled).toBe(true);
    deliver(store, raw); // Stripe retries
    expect(db.subscriptions.t1).toMatchObject({ planId: "premium-basic", status: "active", stripeSubscriptionId: "sub_1", rail: "card" });
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("premium-basic");
    expect(db.charges.filter((c) => c.id === "stripe_cs_1")).toHaveLength(1);
    expect(db.charges.find((c) => c.id === "stripe_cs_1")).toMatchObject({ status: "settled", amountCents: 9399 });
  });

  it("starts the agreed free trial when checkout took nothing", () => {
    const { db, store } = storeWithMember();
    deliver(store, event("checkout.session.completed", { ...completed, amount_total: 0, payment_status: "no_payment_required" }));
    expect(db.subscriptions.t1).toMatchObject({ status: "trialing", planId: "premium-basic" });
    expect(db.subscriptions.t1!.currentPeriodEnd).toBe(db.subscriptions.t1!.trialEndsAt);
    expect(db.charges.some((c) => c.id === "stripe_cs_1")).toBe(false);
  });

  it("asks Stripe to cancel a plan a newer checkout replaced", () => {
    const { store } = storeWithMember();
    deliver(store, event("checkout.session.completed", completed));
    const second = deliver(store, event("checkout.session.completed", {
      ...completed, id: "cs_2", subscription: "sub_2", metadata: { ...completed.metadata, planId: "premium-plus" },
    }));
    expect(second.cancelStripeSubscriptions).toEqual(["sub_1"]);
  });

  describe("the Wingman Club subscription", () => {
    const club = {
      id: "cs_club", mode: "subscription", subscription: "sub_club", payment_status: "paid", amount_total: 9900,
      metadata: { travelerId: "t1", planId: "wingman-club", cadence: "monthly" },
    };

    it("makes the member, once, records the $99, and leaves their plan alone", () => {
      const { db, store } = storeWithMember();
      const raw = event("checkout.session.completed", club);
      expect(deliver(store, raw).handled).toBe(true);
      deliver(store, raw); // Stripe retries
      const t = db.travelers.find((x) => x.id === "t1")!;
      expect(t.clubMember).toBe(true);
      expect(t.planId).toBe("free");
      expect(db.subscriptions.t1).toBeUndefined();
      expect(db.clubSubscriptions!.t1).toMatchObject({ status: "active", stripeSubscriptionId: "sub_club" });
      expect(db.charges.filter((c) => c.id === "stripe_cs_club")).toHaveLength(1);
      expect(db.charges.find((c) => c.id === "stripe_cs_club")).toMatchObject({ amountCents: 9900, status: "settled" });
    });

    it("does not make anyone a member for a payment that did not go through", () => {
      const { db, store } = storeWithMember();
      expect(deliver(store, event("checkout.session.completed", { ...club, payment_status: "unpaid" })).handled).toBe(false);
      expect(db.travelers.find((x) => x.id === "t1")!.clubMember).toBeFalsy();
    });

    it("keeps a paid renewal running, marks a failed one past-due without ending membership, and ends it when Stripe does", () => {
      const { db, store } = storeWithMember();
      deliver(store, event("checkout.session.completed", club));
      deliver(store, event("invoice.payment_failed", { id: "in_f", subscription: "sub_club" }));
      expect(db.clubSubscriptions!.t1!.status).toBe("past-due");
      expect(db.travelers.find((x) => x.id === "t1")!.clubMember).toBe(true);
      deliver(store, event("invoice.paid", { id: "in_2", subscription: "sub_club", billing_reason: "subscription_cycle", amount_paid: 9900 }));
      expect(db.clubSubscriptions!.t1!.status).toBe("active");
      expect(db.charges.find((c) => c.id === "stripe_in_2")).toMatchObject({ amountCents: 9900 });
      deliver(store, event("customer.subscription.deleted", { id: "sub_club" }));
      expect(db.clubSubscriptions!.t1!.status).toBe("canceled");
      expect(db.travelers.find((x) => x.id === "t1")!.clubMember).toBe(false);
    });
  });

  it("is not billed again by the app's own renewal sweep", () => {
    const { db, store } = storeWithMember();
    deliver(store, event("checkout.session.completed", completed));
    const later = new Date(NOW.getTime() + 40 * 86_400_000);
    const result = renewDueSubscriptions(db, later, { collect: true });
    expect(result.renewed).toBe(0);
    expect(result.toCollect).toEqual([]);
  });

  it("extends on a paid renewal, marks past-due on a failed one, and ends on deletion", () => {
    const { db, store } = storeWithMember();
    deliver(store, event("checkout.session.completed", completed));
    const later = new Date(NOW.getTime() + 31 * 86_400_000);

    deliver(store, event("invoice.payment_failed", { id: "in_f", parent: { subscription_details: { subscription: "sub_1" } } }), later);
    expect(db.subscriptions.t1!.status).toBe("past-due");

    deliver(store, event("invoice.paid", { id: "in_2", billing_reason: "subscription_cycle", subscription: "sub_1", amount_paid: 9399 }), later);
    expect(db.subscriptions.t1!.status).toBe("active");
    expect(new Date(db.subscriptions.t1!.currentPeriodEnd).getTime()).toBeGreaterThan(later.getTime());
    expect(db.charges.some((c) => c.id === "stripe_in_2")).toBe(true);

    deliver(store, event("customer.subscription.deleted", { id: "sub_1", cancellation_details: { reason: "payment_failed" } }), later);
    expect(db.subscriptions.t1!.status).toBe("canceled");
    expect(db.travelers.find((t) => t.id === "t1")!.planId).toBe("free");
  });

  it("ignores checkouts that are not paid, not ours, or for an unknown plan", () => {
    const { db, store } = storeWithMember();
    expect(deliver(store, event("checkout.session.completed", { ...completed, payment_status: "unpaid" })).handled).toBe(false);
    expect(deliver(store, event("checkout.session.completed", { ...completed, metadata: { ...completed.metadata, planId: "nope" } })).handled).toBe(false);
    expect(deliver(store, event("checkout.session.completed", { ...completed, metadata: { ...completed.metadata, travelerId: "ghost" } })).handled).toBe(false);
    expect(db.subscriptions.t1).toBeUndefined();
  });
});
