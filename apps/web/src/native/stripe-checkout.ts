import { api } from "../api.ts";

/**
 * Stripe.js (Dahlia), for the embedded Checkout form.
 *
 * Loaded from js.stripe.com into <head> and never bundled — Stripe requires
 * that for PCI, and `initCheckoutFormSdk` exists only from the Dahlia release.
 * Added only when a member opens the form, so other visitors never contact
 * Stripe. The publishable key comes from the server (STRIPE_PUBLISHABLE_KEY).
 */
const STRIPE_JS = "https://js.stripe.com/dahlia/stripe.js";

export interface CheckoutForm {
  mount: (selector: string | HTMLElement) => void;
  on: (event: "confirm", handler: (event: unknown) => void) => void;
  destroy?: () => void;
}
export interface CheckoutFormSdk {
  createForm: (options: { layout: "expanded" | "accordion" }) => CheckoutForm;
  loadActions: () => Promise<
    | { type: "success"; actions: { confirm: (args: { formConfirmEvent: unknown }) => Promise<unknown> } }
    | { type: "error"; error: { message?: string } }
  >;
}
interface StripeDahlia {
  initCheckoutFormSdk: (options: { clientSecret: Promise<string> | string; appearance?: unknown }) => CheckoutFormSdk;
}
/** The Dahlia script's global, read through this shape rather than a global
 *  declaration, which would clash with @stripe/stripe-js's own typing of it. */
const stripeGlobal = () => (window as unknown as { Stripe?: (publishableKey: string) => StripeDahlia }).Stripe;

let loading: Promise<StripeDahlia | null> | null = null;

export function loadStripeDahlia(): Promise<StripeDahlia | null> {
  loading ??= api.stripeConfig().then((config) => {
    if (!config.ready) return null;
    return new Promise<StripeDahlia>((resolve, reject) => {
      const ready = () => {
        const make = stripeGlobal();
        return make ? resolve(make(config.publishableKey)) : reject(new Error("Stripe.js did not load."));
      };
      if (stripeGlobal()) return ready();
      const script = document.createElement("script");
      script.src = STRIPE_JS;
      script.onload = ready;
      script.onerror = () => reject(new Error("Stripe.js could not be loaded."));
      document.head.appendChild(script);
    });
  }).catch((e) => { loading = null; throw e; });
  return loading;
}
