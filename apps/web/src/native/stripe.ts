// The `/pure` entry on purpose: plain "@stripe/stripe-js" injects js.stripe.com
// on page load, so every visitor would contact Stripe before anything asked
// them to. `/pure` loads it only when `loadStripe` is called.
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";
import { api } from "../api.ts";

/**
 * Stripe.js, loaded once and only when the server says Stripe is connected.
 * The publishable key comes from the server (STRIPE_PUBLISHABLE_KEY in
 * Railway) rather than being baked into the build, so turning Stripe on is
 * one variable and no rebuild. It is designed to ship to browsers; the secret
 * key never leaves the server.
 */
let cached: Promise<Stripe | null> | null = null;

export function loadStripeJs(): Promise<Stripe | null> {
  cached ??= api.stripeConfig()
    .then((c) => (c.ready ? loadStripe(c.publishableKey) : null))
    .catch(() => null);
  return cached;
}
