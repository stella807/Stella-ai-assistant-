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
