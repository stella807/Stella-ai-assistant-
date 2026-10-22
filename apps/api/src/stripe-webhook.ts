import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PLANS, effectivePlan, findPlan, isElitePlan, periodEnd, recordCharge, settleCharge,
  type Cadence, type PlanId, type Subscription,
} from "@safehubby/core";
import type { StoreLike } from "./store.ts";

/**
 * Stripe's notifications about plans bought through Stripe Checkout.
 *
 * Stripe bills those subscriptions itself, so this is how the app learns what
 * happened: a finished checkout switches the member onto the plan they paid
 * for, a paid renewal keeps it running, a failed one marks it past-due (Stripe
 * retries on its own schedule), and an ended subscription returns them to
 * Free at the end of what they paid for.
 *
 * Nothing is trusted unsigned. Each request must carry a `Stripe-Signature`
 * made with STRIPE_WEBHOOK_SECRET over the exact raw body, within five
 * minutes; without the secret configured, every request is refused rather
 * than accepted on faith. Each handler is safe to receive twice — Stripe
 * retries — because charges are keyed by Stripe's own ids.
 */

const TOLERANCE_SECONDS = 300;

export class WebhookRejected extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Checks Stripe's signature header (`t=…,v1=…`) against the raw body. */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, now: Date): void {
  if (!header) throw new WebhookRejected(400, "Missing Stripe signature.");
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new WebhookRejected(400, "Malformed Stripe signature.");
  if (Math.abs(now.getTime() / 1000 - timestamp) > TOLERANCE_SECONDS) throw new WebhookRejected(400, "Stripe signature is too old.");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"));
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookRejected(400, "Stripe signature does not match.");
}

interface StripeEvent { id: string; type: string; data: { object: Record<string, any> } }

/** The subscription id an invoice belongs to — its location moved between API versions. */
const invoiceSubscriptionId = (invoice: Record<string, any>): string | undefined =>
  invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? undefined;

/** Verifies and applies one event. Returns what cancellations Stripe should
 *  still be told about (a plan replaced by a newer checkout). */
export function handleStripeWebhook(
  store: StoreLike, raw: string, signature: string | undefined, now: Date,
): { handled: boolean; cancelStripeSubscriptions: string[] } {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new WebhookRejected(503, "Stripe webhooks are not set up on this server (STRIPE_WEBHOOK_SECRET).");
  verifyStripeSignature(raw, signature, secret, now);
  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; } catch { throw new WebhookRejected(400, "Invalid JSON."); }
  const object = event.data?.object ?? {};
  const toCancel: string[] = [];

  const byStripeId = (id: string | undefined) =>
    id ? Object.values(store.data.subscriptions).find((s) => s.stripeSubscriptionId === id) : undefined;
  const syncPlan = (travelerId: string) => {
    const traveler = store.data.travelers.find((t) => t.id === travelerId);
    if (!traveler) return;
    const plan = effectivePlan(store.data.subscriptions[travelerId] ?? null, now);
    traveler.planId = findPlan(plan).id;
    if (isElitePlan(plan)) traveler.clubMember = true;
  };
  const recordPaid = (db: StoreLike["data"], id: string, travelerId: string, cents: number, description: string) => {
    if (cents <= 0 || db.charges.some((c) => c.id === id)) return;
    const charge = recordCharge({ id, travelerId, kind: "subscription", platform: "web", description, amountCents: cents, now });
    db.charges.push(settleCharge(charge, now, undefined, id.replace(/^stripe_/, "")));
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const meta = object.metadata ?? {};
      const travelerId = String(meta.travelerId ?? "");
      const planId = String(meta.planId ?? "") as PlanId;
      const cadence: Cadence = meta.cadence === "annual" ? "annual" : "monthly";
      const stripeSubscriptionId = typeof object.subscription === "string" ? object.subscription : undefined;
      if (object.mode !== "subscription" || !stripeSubscriptionId || !PLANS.some((p) => p.id === planId)) {
        return { handled: false, cancelStripeSubscriptions: [] };
      }
      if (!store.data.travelers.some((t) => t.id === travelerId)) return { handled: false, cancelStripeSubscriptions: [] };
      // `payment_status` is "paid" for a card that went through at once.
      if (object.payment_status !== "paid" && object.payment_status !== "no_payment_required") {
        return { handled: false, cancelStripeSubscriptions: [] };
      }
      store.update((db) => {
        const existing = db.subscriptions[travelerId];
        if (existing?.stripeSubscriptionId === stripeSubscriptionId) return; // already applied
        if (existing?.stripeSubscriptionId) toCancel.push(existing.stripeSubscriptionId);
        const plan = findPlan(planId);
        const next: Subscription = {
          travelerId, planId: plan.id, cadence, rail: "card", status: "active",
          // The renewal terms were agreed to in the app before checkout opened.
          renewalTermsAcceptedAt: now.toISOString(),
          startedAt: now.toISOString(),
          joinedAt: existing?.joinedAt ?? existing?.startedAt ?? now.toISOString(),
          currentPeriodEnd: periodEnd(cadence, now).toISOString(),
          stripeSubscriptionId,
        };
        db.subscriptions[travelerId] = next;
        recordPaid(db, `stripe_${object.id}`, travelerId, Number(object.amount_total ?? 0),
          `${plan.name} (${cadence === "annual" ? "yearly" : "monthly"}) — paid through Stripe`);
      });
      store.update(() => syncPlan(travelerId));
      return { handled: true, cancelStripeSubscriptions: toCancel };
    }

    case "invoice.paid": {
      // The first invoice is the checkout itself, already handled above.
      if (object.billing_reason === "subscription_create") return { handled: true, cancelStripeSubscriptions: [] };
      const sub = byStripeId(invoiceSubscriptionId(object));
      if (!sub) return { handled: false, cancelStripeSubscriptions: [] };
      store.update((db) => {
        const current = db.subscriptions[sub.travelerId]!;
        const chargeId = `stripe_${object.id}`;
        if (db.charges.some((c) => c.id === chargeId)) return;
        current.status = "active";
        current.startedAt = now.toISOString();
        current.currentPeriodEnd = periodEnd(current.cadence, now).toISOString();
        recordPaid(db, chargeId, sub.travelerId, Number(object.amount_paid ?? 0),
          `${findPlan(current.planId).name} renewal — paid through Stripe`);
      });
      store.update(() => syncPlan(sub.travelerId));
      return { handled: true, cancelStripeSubscriptions: [] };
    }

    case "invoice.payment_failed": {
      const sub = byStripeId(invoiceSubscriptionId(object));
      if (!sub) return { handled: false, cancelStripeSubscriptions: [] };
      // Features stay on while past-due; Stripe retries the card itself.
      store.update((db) => { db.subscriptions[sub.travelerId]!.status = "past-due"; });
      return { handled: true, cancelStripeSubscriptions: [] };
    }

    case "customer.subscription.deleted": {
      const sub = byStripeId(typeof object.id === "string" ? object.id : undefined);
      if (!sub) return { handled: false, cancelStripeSubscriptions: [] };
      store.update((db) => {
        const current = db.subscriptions[sub.travelerId]!;
        current.status = "canceled";
        current.canceledAt ??= now.toISOString();
        // Ended for non-payment (Stripe's retries ran out): off now. Ended
        // any other way: keep what was paid for, to the end of the period.
        if (object.cancellation_details?.reason === "payment_failed") current.currentPeriodEnd = now.toISOString();
      });
      store.update(() => syncPlan(sub.travelerId));
      return { handled: true, cancelStripeSubscriptions: [] };
    }

    default:
      return { handled: false, cancelStripeSubscriptions: [] };
  }
}
