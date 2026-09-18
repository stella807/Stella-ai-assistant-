// The `/pure` entry point on purpose: importing plain "@stripe/stripe-js"
// injects js.stripe.com on page load, which would mean every visitor —
// including free users who never open this screen — makes a third-party
// request to Stripe before anything asks them to. `/pure` loads the script
// only when `loadStripe` is actually called.
import { loadStripe } from "@stripe/stripe-js/pure";
import type {
  PaymentRequest, Stripe, StripeCardElement, StripeElements, StripePaymentElement,
} from "@stripe/stripe-js";

/**
 * Stripe.js, loaded lazily and only when it is actually configured.
 *
 * The publishable key is baked into the bundle at build time, the same way
 * `VITE_API_URL` is (see platform.ts) — it is a publishable key, designed to
 * ship to browsers, and is not a secret. The *secret* key stays on the
 * server, where `apps/api/src/adapters/stripe.ts` uses it to verify whatever
 * token this module produces; the browser never sees it, and this server
 * never sees a raw card number. Both halves have to be configured for a real
 * payment method to be attachable, which is why the UI checks the server's
 * `GET /api/payment/processors` status as well as this key.
 *
 * Nothing here fabricates a capability: with no key set, `stripe()` returns
 * null and the UI says plainly that Stripe isn't connected rather than
 * offering a button that cannot work.
 */

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

export const isStripeConfigured = (): boolean => Boolean(PUBLISHABLE_KEY);

let cached: Promise<Stripe | null> | null = null;

/** The Stripe.js instance, or null when this build has no publishable key.
 *  Memoized because `loadStripe` injects a script tag — calling it per render
 *  would add one every time. */
export function stripe(): Promise<Stripe | null> {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  cached ??= loadStripe(String(PUBLISHABLE_KEY));
  return cached;
}

export type { StripeCardElement, StripeElements, StripePaymentElement };

/**
 * Mounts Stripe's Payment Element against a SetupIntent from our own server
 * (`POST /api/payment/setup-intent`).
 *
 * The Card Element this screen already uses renders card fields and nothing
 * else — it is why Klarna, Cash App Pay, Amazon Pay and Link could not be
 * offered before. The Payment Element renders whichever method the intent
 * was created for, which is why the server scopes each intent to a single
 * `payment_method_types` entry: one tab, one method, no sheet of six.
 */
export async function mountPaymentElement(
  clientSecret: string,
  node: HTMLElement,
): Promise<{ elements: StripeElements; element: StripePaymentElement } | null> {
  const s = await stripe();
  if (!s) return null;
  const elements = s.elements({ clientSecret });
  const element = elements.create("payment");
  element.mount(node);
  return { elements, element };
}

/**
 * Completes the setup and returns the saved method's id.
 *
 * `redirect: "if_required"` matters: Klarna, Cash App Pay and Amazon Pay all
 * send the customer to the provider to authorise, and come back through
 * `return_url`. Stripe resolves in place for anything that does not need
 * that hop, so this handles both without the caller branching — and the
 * `return_url` is this same screen, so a customer who does get redirected
 * lands back where they started rather than on a blank page.
 */
export async function confirmSetup(
  elements: StripeElements,
  returnUrl: string,
): Promise<string> {
  const s = await stripe();
  if (!s) throw new Error("Stripe isn't configured in this build.");

  const submitted = await elements.submit();
  if (submitted.error) throw new Error(submitted.error.message ?? "Those details were not accepted.");

  const result = await s.confirmSetup({
    elements,
    confirmParams: { return_url: returnUrl },
    redirect: "if_required",
  });
  if (result.error) throw new Error(result.error.message ?? "Stripe could not save that method.");

  const method = result.setupIntent?.payment_method;
  // A string id is what this app stores; an expanded object would mean the
  // intent was created differently than `createSetupIntent` creates it.
  if (typeof method !== "string" || !method) {
    throw new Error("Stripe saved the method but returned no id for it.");
  }
  return method;
}

/**
 * A wallet request for the amount-less case: attaching a payment method is
 * not a purchase, but Stripe's Payment Request API requires a total, so this
 * asks for the smallest chargeable amount and never confirms it. The wallet
 * sheet is used purely to obtain a tokenized payment method, which is then
 * stored for the real holds that happen later at booking time (see
 * payment.ts's `authorizeExactHold`).
 */
export async function walletRequest(): Promise<PaymentRequest | null> {
  const s = await stripe();
  if (!s) return null;
  return s.paymentRequest({
    country: "US",
    currency: "usd",
    total: { label: "Save payment method", amount: 0, pending: true },
    requestPayerName: true,
    requestPayerEmail: false,
  });
}

/**
 * Which wallets this browser can actually complete, straight from Stripe
 * rather than guessed. This replaces the earlier `ApplePaySession` sniff for
 * Apple Pay and the "Google Pay's own button decides" hand-wave for Google
 * Pay — `canMakePayment()` is the real answer for both, and returns null when
 * neither is available.
 */
export async function availableWallets(): Promise<{ applePay: boolean; googlePay: boolean }> {
  const none = { applePay: false, googlePay: false };
  try {
    const request = await walletRequest();
    if (!request) return none;
    const result = await request.canMakePayment();
    if (!result) return none;
    return { applePay: Boolean(result.applePay), googlePay: Boolean(result.googlePay) };
  } catch {
    // A blocked or unavailable payment sheet is a "no", not a crash.
    return none;
  }
}
