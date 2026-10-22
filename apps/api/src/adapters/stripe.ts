import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { PUERTO_RICO_IVU_RATE, statusFor } from "@safehubby/core";

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

/* ---------------------------------------------------------------------------
   Checkout Sessions: Stripe's embedded payment form for subscribing to a plan
   ------------------------------------------------------------------------ */

/** The version Checkout Studio set; the embedded form (`ui_mode: "form"`)
 *  needs 2026-03-25.dahlia or later. */
export const CHECKOUT_API_VERSION = "2026-09-30.endive";

/** One plan, priced by Safehubby rather than a Stripe Price (an external
 *  product catalog), so the app's own plan table stays the one price list. */
export interface CheckoutPlan {
  planId: string; name: string; cadence: "monthly" | "annual"; amountCents: number; travelerId: string;
  /** When the free trial the member agreed to ends — Stripe charges nothing before it. */
  trialEndsAt?: string;
  /** The launch-party discount, as a whole percent and the months of charges it covers. */
  discount?: { percentOff: number; months: number };
}

/**
 * The IVU tax rates, created in Stripe on first use and found again by their
 * metadata after that. Two, because a Puerto Rico address can reach Stripe
 * either as its own country (PR) or as a US state (US-PR); whichever matches
 * the customer's billing address is applied, and no other address gets one.
 */
let ivuRates: Promise<string[]> | null = null;

export function ivuTaxRateIds(): Promise<string[]> {
  ivuRates ??= (async () => {
    const res = await fetch(`${api()}/v1/tax_rates?active=true&limit=100`, { headers: { authorization: `Bearer ${key()}` } });
    const existing = res.ok ? ((await res.json()) as { data?: { id: string; metadata?: Record<string, string> }[] }).data ?? [] : [];
    const want = [
      { tag: "ivu-pr", fields: { country: "PR" } },
      { tag: "ivu-us-pr", fields: { country: "US", state: "PR" } },
    ];
    const ids: string[] = [];
    for (const { tag, fields } of want) {
      const found = existing.find((r) => r.metadata?.safehubby === tag);
      if (found) { ids.push(found.id); continue; }
      const created = await stripePost<{ id: string }>("/v1/tax_rates", {
        display_name: "IVU", description: "Puerto Rico sales and use tax (10.5% state + 1% municipal)",
        jurisdiction: "Puerto Rico", percentage: Math.round(PUERTO_RICO_IVU_RATE * 10000) / 100, inclusive: false,
        tax_type: "sales_tax", ...fields, "metadata[safehubby]": tag,
      }, `tax-rate:${tag}`);
      ids.push(created.id);
    }
    return ids;
  })().catch((e) => { ivuRates = null; throw e; });
  return ivuRates;
}

/**
 * A coupon for the launch-party discount, created on first use under a fixed
 * id per length so it is shared rather than duplicated; "already exists" is
 * the expected answer every time after the first.
 */
async function ensureLaunchCoupon(percentOff: number, months: number): Promise<string> {
  const id = `launch-${percentOff}pct-${months}mo`;
  try {
    await stripePost("/v1/coupons", {
      id, percent_off: percentOff, duration: "repeating", duration_in_months: months, name: `Launch party ${percentOff}% off`,
    });
  } catch (e) {
    if (!/already exists/i.test(e instanceof Error ? e.message : "")) throw e;
  }
  return id;
}

/**
 * A Checkout Session for the embedded form, subscribing the member to one
 * plan. Everything except the line item was set in Stripe's Checkout Studio
 * and is used exactly as configured. Returns the client secret the browser's
 * Checkout Form SDK mounts against.
 */
export async function createCheckoutSession(input: {
  customerId: string; returnUrl: string; plan: CheckoutPlan;
}): Promise<{ clientSecret: string }> {
  // A plan is a recurring charge, so the session subscribes; and
  // `payment_method_collection` only applies in subscription mode.
  const mode: "payment" | "subscription" = "subscription";
  const { plan } = input;
  const metadata = { travelerId: plan.travelerId, planId: plan.planId, cadence: plan.cadence };
  const coupon = plan.discount && plan.discount.months > 0
    ? await ensureLaunchCoupon(plan.discount.percentOff, plan.discount.months) : undefined;
  const taxRates = await ivuTaxRateIds();
  const trialEnd = plan.trialEndsAt ? Math.floor(Date.parse(plan.trialEndsAt) / 1000) : undefined;
  const res = await fetch(`${api()}/v1/checkout/sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key()}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": CHECKOUT_API_VERSION,
    },
    body: form({
      ui_mode: "form",
      mode,
      customer: input.customerId,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": plan.amountCents,
      "line_items[0][price_data][product_data][name]": `Safehubby ${plan.name} (${plan.cadence === "annual" ? "yearly" : "monthly"})`,
      "line_items[0][price_data][recurring][interval]": plan.cadence === "annual" ? "year" : "month",
      "line_items[0][quantity]": 1,
      // IVU, added only when the billing address is in Puerto Rico.
      ...Object.fromEntries(taxRates.map((id, i) => [`line_items[0][dynamic_tax_rates][${i}]`, id])),
      ...(trialEnd ? { "subscription_data[trial_end]": trialEnd } : {}),
      ...(coupon ? { "discounts[0][coupon]": coupon } : {}),
      // Read back by the fulfillment webhook to know whose plan to change.
      ...Object.fromEntries(Object.entries(metadata).flatMap(([k, v]) => [
        [`metadata[${k}]`, v], [`subscription_data[metadata][${k}]`, v],
      ])),
      // "required", not Checkout Studio's "auto": IVU is charged by billing
      // address, and "auto" can stop at a ZIP code with no country or state
      // to match a Puerto Rico address against.
      billing_address_collection: "required",
      "phone_number_collection[enabled]": false,
      "automatic_tax[enabled]": false,
      ...(mode === "subscription" ? { payment_method_collection: "always" } : {}),
      submit_type: "auto",
      "name_collection[individual][enabled]": true,
      "name_collection[individual][optional]": true,
      "name_collection[business][enabled]": true,
      "name_collection[business][optional]": true,
      "saved_payment_method_options[payment_method_save]": "enabled",
      integration_identifier: "custom_embedded_web_0001",
      return_url: input.returnUrl,
    }),
  });
  const data = (await res.json().catch(() => null)) as { client_secret?: string; error?: { message?: string } } | null;
  if (!res.ok || !data?.client_secret) throw new Error(data?.error?.message ?? `Stripe rejected the checkout session: ${res.status}`);
  return { clientSecret: data.client_secret };
}

/** Ends a Stripe subscription now — used when a member leaves or replaces a
 *  plan Stripe was billing, so it never renews behind the app's back. */
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  if (!key()) throw new Error("Stripe is not configured.");
  const res = await fetch(`${api()}/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE", headers: { authorization: `Bearer ${key()}` },
  });
  // Already gone is the outcome we wanted.
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(data?.error?.message ?? `Stripe could not cancel that subscription: ${res.status}`);
  }
}
