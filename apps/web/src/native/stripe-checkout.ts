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
declare global {
  interface Window { Stripe?: (publishableKey: string) => StripeDahlia }
}

let loading: Promise<StripeDahlia | null> | null = null;

export function loadStripeDahlia(): Promise<StripeDahlia | null> {
  loading ??= api.stripeConfig().then((config) => {
    if (!config.ready) return null;
    return new Promise<StripeDahlia>((resolve, reject) => {
      const ready = () => (window.Stripe ? resolve(window.Stripe(config.publishableKey)) : reject(new Error("Stripe.js did not load.")));
      if (window.Stripe) return ready();
      const script = document.createElement("script");
      script.src = STRIPE_JS;
      script.onload = ready;
      script.onerror = () => reject(new Error("Stripe.js could not be loaded."));
      document.head.appendChild(script);
    });
  }).catch((e) => { loading = null; throw e; });
  return loading;
}
