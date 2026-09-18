import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Card payments, plus Apple Pay and Google Pay, through Stripe.
 *
 * Apple Pay and Google Pay are not separate integrations here — both are
 * wallets Stripe's own client-side SDK (the Payment Request Button, or the
 * Payment Element) detects and offers automatically when the browser/device
 * supports them. The wallet only changes what button the customer taps; the
 * token it produces is a normal Stripe PaymentMethod id, verified the same
 * way a typed card is. See `PaymentMethodOnFile.wallet` in payment.ts.
 *
 * The actual card entry happens entirely in the browser, via Stripe.js —
 * this server is never handed a raw card number, only the PaymentMethod id
 * Stripe's SDK produces after tokenizing it. `verifyMethod` retrieves that
 * PaymentMethod from Stripe's API to read back the brand/last4/expiry Stripe
 * itself recorded, rather than trusting whatever the browser claims.
 *
 * Verified against Stripe's public API docs (stripe.com/docs/api/payment_methods):
 *   GET https://api.stripe.com/v1/payment_methods/{id}
 * authenticated with a bearer secret key. Real capture/refund of a charge
 * against a verified method is a further step (PaymentIntents) not
 * implemented here — this adapter's job is verifying what's on file, the
 * same scope `attachPaymentMethod` in payment.ts covers for a typed card.
 */

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API = (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");

export const stripeProcessor: ChargeProcessorPort = {
  status: statusFor(
    "stripe", "Stripe", Boolean(STRIPE_KEY),
    "A Stripe account with Payment Element (and the Payment Request Button, for Apple Pay/Google Pay) enabled, then STRIPE_SECRET_KEY.",
  ),

  async verifyMethod(token: string): Promise<VerifiedMethod> {
    if (!STRIPE_KEY) throw new Error("Stripe is not configured.");

    const res = await fetch(`${STRIPE_API}/v1/payment_methods/${encodeURIComponent(token)}`, {
      headers: { authorization: `Bearer ${STRIPE_KEY}` },
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

/* ---------------------------------------------------------------------------
   Saving a method without charging for it: Customers and SetupIntents
   ------------------------------------------------------------------------ */

/**
 * Stripe's form encoding, which its API takes instead of JSON. Nested keys
 * use `a[b]` and arrays `a[0]`, which is why this is hand-rolled rather than
 * `JSON.stringify` — there is no JSON endpoint to post to.
 */
function form(fields: Record<string, string | number | boolean | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.set(k, String(v));
  return body.toString();
}

async function stripePost<T>(path: string, fields: Record<string, string | number | boolean | undefined>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${STRIPE_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form(fields),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message ?? `Stripe rejected ${path}: ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * The Stripe Customer a traveler's saved methods hang off.
 *
 * Needed because of how this app charges: a hold is placed later, when a
 * ride is actually booked, with nobody at the keyboard. Stripe will only
 * reuse a payment method off-session if it is attached to a Customer, so a
 * method saved without one is a method that can be shown on a settings
 * screen and never charged. The id is stored on the traveler (see
 * `stripeCustomerId` in store.ts) and reused, so a member ends up with one
 * Customer rather than one per visit to the payment screen.
 */
export async function ensureStripeCustomer(input: {
  existingId?: string;
  email: string;
  name?: string;
}): Promise<string> {
  if (!STRIPE_KEY) throw new Error("Stripe is not configured.");
  if (input.existingId) return input.existingId;
  const created = await stripePost<{ id: string }>("/v1/customers", {
    email: input.email,
    name: input.name,
  });
  return created.id;
}

/**
 * A SetupIntent: Stripe's "collect a payment method now, charge it later"
 * object, and the thing the Payment Element needs in order to render
 * anything other than a bare card field.
 *
 * `usage: off_session` is the honest declaration of what this app does with
 * the result — the customer will not be present when the hold is placed.
 *
 * `payment_method_types` is set to the single type the customer picked
 * rather than left to Stripe's automatic selection, because this screen
 * keeps one tab per method: a customer who tapped "Klarna" should get
 * Klarna, not a sheet offering six things. Every type passed here has to
 * support SetupIntents — see `PayBrandSpec.savable` in core's payment.ts for
 * why Affirm and Afterpay are not among them.
 */
export async function createSetupIntent(input: {
  customerId: string;
  paymentMethodType: string;
}): Promise<{ clientSecret: string }> {
  if (!STRIPE_KEY) throw new Error("Stripe is not configured.");
  const intent = await stripePost<{ client_secret?: string }>("/v1/setup_intents", {
    customer: input.customerId,
    usage: "off_session",
    "payment_method_types[0]": input.paymentMethodType,
  });
  if (!intent.client_secret) throw new Error("Stripe returned a SetupIntent with no client secret.");
  return { clientSecret: intent.client_secret };
}
