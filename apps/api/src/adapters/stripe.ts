import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Cards through Stripe, beside PayPal. Three Stripe products are used:
 *
 * - Payments: a card is saved with a SetupIntent (Stripe's Payment Element
 *   collects it in the browser; this server only ever sees the PaymentMethod
 *   id), and a task's money is a manual-capture PaymentIntent — held when
 *   booked, captured for what was spent, cancelled if it was not.
 * - Invoicing: a plan's monthly or yearly charge is a Stripe invoice, paid off
 *   the saved card, so every member gets a proper invoice and receipt.
 * - Tax: with STRIPE_TAX=on, those invoices have Stripe Tax compute the tax.
 *   Plan prices are tax-inclusive (`tax_behavior: inclusive`), so the member
 *   pays exactly the advertised price and the tax is carved out of it rather
 *   than added on top — the ledger amount and the card charge never differ.
 *   Stripe Tax only collects where the account is registered, so this is safe
 *   to switch on before any registration exists.
 *
 * Every key is read at call time, so setting it in Railway takes effect on the
 * next request without a restart, and tests can toggle it.
 */

const key = () => process.env.STRIPE_SECRET_KEY ?? "";
const api = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");
const taxOn = () => process.env.STRIPE_TAX === "on";

export const stripePublishableKey = () => process.env.STRIPE_PUBLISHABLE_KEY ?? "";
export const cardChargingReady = () => Boolean(key());

/** Stripe's own ids for what it holds. A hold reference is the PaymentIntent
 *  id (`pi_…`) and a plan charge the invoice id (`in_…`). */
export const isStripeRef = (ref: string) => ref.startsWith("pi_") || ref.startsWith("in_");

export const stripeProcessor: ChargeProcessorPort = {
  get status() {
    return statusFor(
      "stripe", "Stripe", Boolean(key() && stripePublishableKey()),
      "A Stripe account's secret and publishable keys, then STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.",
    );
  },

  /** Reads the card back from Stripe rather than trusting the browser. */
  async verifyMethod(token: string): Promise<VerifiedMethod> {
    if (!key()) throw new Error("Stripe is not configured.");
    if (!token.startsWith("pm_")) throw new Error("That is not a Stripe payment method.");
    const res = await fetch(`${api()}/v1/payment_methods/${encodeURIComponent(token)}`, {
      headers: { authorization: `Bearer ${key()}` },
    });
    if (!res.ok) throw new Error(`Stripe could not verify that payment method: ${res.status}`);
    const data = (await res.json()) as { card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } };
    const card = data.card ?? {};
    return {
      brand: String(card.brand ?? "card"),
      last4: String(card.last4 ?? ""),
      expMonth: Number(card.exp_month ?? 0),
      expYear: Number(card.exp_year ?? 0),
    };
  },
};

/** The Customer a saved card is attached to, or null. */
export async function stripeMethodCustomer(token: string): Promise<string | null> {
  const res = await fetch(`${api()}/v1/payment_methods/${encodeURIComponent(token)}`, {
    headers: { authorization: `Bearer ${key()}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { customer?: string | null };
  return data.customer ?? null;
}

/** Stripe takes form encoding, with nested keys spelled `a[b]`. */
function form(fields: Record<string, string | number | boolean | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.set(k, String(v));
  return body.toString();
}

async function stripePost<T>(
  path: string, fields: Record<string, string | number | boolean | undefined>, idempotencyKey?: string,
): Promise<T> {
  if (!key()) throw new Error("Stripe is not configured.");
  const res = await fetch(`${api()}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key()}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: form(fields),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data) throw new Error(data?.error?.message ?? `Stripe rejected ${path}: ${res.status}`);
  return data;
}

/**
 * The Stripe Customer a member's card hangs off. Stripe only reuses a card
 * off-session — which is every charge here, since nobody is at the keyboard
 * when a hold is placed or a plan renews — when it is attached to one.
 */
export async function ensureStripeCustomer(input: { existingId?: string; email: string; name?: string; travelerId: string }): Promise<string> {
  if (input.existingId) return input.existingId;
  const created = await stripePost<{ id: string }>("/v1/customers", {
    email: input.email, name: input.name, "metadata[travelerId]": input.travelerId,
  }, `customer:${input.travelerId}`);
  return created.id;
}

/** Collect a card now, charge it later. `usage: off_session` is the honest
 *  declaration: the customer will not be present when it is charged. */
export async function createSetupIntent(customerId: string): Promise<{ clientSecret: string }> {
  const intent = await stripePost<{ client_secret?: string }>("/v1/setup_intents", {
    customer: customerId, usage: "off_session", "payment_method_types[0]": "card",
  });
  if (!intent.client_secret) throw new Error("Stripe returned a SetupIntent with no client secret.");
  return { clientSecret: intent.client_secret };
}

export interface StripeCharge {
  customerId: string; paymentMethodId: string; amountCents: number; description: string; idempotencyKey: string;
}

const BANK_WANTS_APPROVAL = "Your bank wants to approve this payment itself. Open your banking app, or use a different card.";

/** A task's reservation: exactly the amount, held, charged later. */
export async function holdOnCard(input: StripeCharge): Promise<{ id: string }> {
  const intent = await stripePost<{ id: string; status: string }>("/v1/payment_intents", {
    amount: input.amountCents, currency: "usd", customer: input.customerId, payment_method: input.paymentMethodId,
    capture_method: "manual", confirm: true, off_session: true, description: input.description.slice(0, 200),
  }, `hold:${input.idempotencyKey}`);
  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    // Usually 3-D Secure. Nobody is there to approve it, so say so rather than book.
    await stripePost(`/v1/payment_intents/${encodeURIComponent(intent.id)}/cancel`, {}).catch(() => {});
    throw new Error(BANK_WANTS_APPROVAL);
  }
  return { id: intent.id };
}

export async function captureOnCard(intentId: string, amountCents: number): Promise<void> {
  if (amountCents <= 0) return releaseOnCard(intentId);
  await stripePost(`/v1/payment_intents/${encodeURIComponent(intentId)}/capture`, { amount_to_capture: amountCents },
    `capture:${intentId}`);
}

export async function releaseOnCard(intentId: string): Promise<void> {
  await stripePost(`/v1/payment_intents/${encodeURIComponent(intentId)}/cancel`, {}, `cancel:${intentId}`);
}

/**
 * A plan's charge, as a Stripe invoice paid off the saved card.
 *
 * The invoice and its line are created under idempotency keys built from the
 * charge's own id, so a sweep that runs twice reuses the same invoice instead
 * of billing twice. Paying is deliberately not keyed: a daily retry of a
 * declined invoice has to be a real new attempt, and Stripe itself refuses to
 * pay an invoice that is already paid.
 */
export async function chargeOnCard(input: StripeCharge): Promise<{ id: string }> {
  const invoice = await stripePost<{ id: string; status: string }>("/v1/invoices", {
    customer: input.customerId,
    collection_method: "charge_automatically",
    default_payment_method: input.paymentMethodId,
    auto_advance: false,
    pending_invoice_items_behavior: "exclude",
    description: input.description.slice(0, 500),
    "metadata[chargeId]": input.idempotencyKey,
    ...(taxOn() ? { "automatic_tax[enabled]": true } : {}),
  }, `invoice:${input.idempotencyKey}`);
  if (invoice.status === "paid") return { id: invoice.id };
  if (invoice.status === "draft") {
    await stripePost("/v1/invoiceitems", {
      customer: input.customerId, invoice: invoice.id, amount: input.amountCents, currency: "usd",
      description: input.description.slice(0, 500), tax_behavior: "inclusive",
    }, `invoice-item:${input.idempotencyKey}`);
    await stripePost(`/v1/invoices/${encodeURIComponent(invoice.id)}/finalize`, { auto_advance: false },
      `finalize:${input.idempotencyKey}`);
  }
  const paid = await stripePost<{ id: string; status: string }>(`/v1/invoices/${encodeURIComponent(invoice.id)}/pay`, {
    payment_method: input.paymentMethodId, off_session: true,
  }).catch((e: Error) => {
    if (/already paid/i.test(e.message)) return { id: invoice.id, status: "paid" };
    throw new Error(/authentication|requires_action/i.test(e.message) ? BANK_WANTS_APPROVAL : e.message);
  });
  if (paid.status !== "paid") throw new Error("Stripe could not take that payment.");
  return { id: invoice.id };
}
