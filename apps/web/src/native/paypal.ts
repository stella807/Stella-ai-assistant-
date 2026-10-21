import { api } from "../api.ts";
import { paypalSdkUrl } from "../app/paypal-checkout.ts";

/**
 * PayPal's browser SDK, loaded once for the page. The PayPal button and the
 * card form both draw from the same `window.paypal`, and loading the script a
 * second time would replace it underneath whichever was drawn first.
 */

export interface PayPalButtons {
  render(target: HTMLElement): Promise<void>;
  close?(): Promise<void>;
}

interface CardField { render(target: HTMLElement): Promise<void>; close?(): Promise<void> }

export interface PayPalCardFields {
  isEligible(): boolean;
  NameField(options?: Record<string, unknown>): CardField;
  NumberField(options?: Record<string, unknown>): CardField;
  ExpiryField(options?: Record<string, unknown>): CardField;
  CVVField(options?: Record<string, unknown>): CardField;
  submit(): Promise<void>;
}

export interface PayPalGlobal {
  Buttons(options: {
    createVaultSetupToken: () => Promise<string>;
    onApprove: (approval: unknown) => Promise<void>;
    onError: (error: unknown) => void;
    onCancel?: () => void;
    style?: Record<string, unknown>;
  }): PayPalButtons;
  CardFields(options: {
    createVaultSetupToken: () => Promise<string>;
    onApprove: (approval: unknown) => Promise<void>;
    onError: (error: unknown) => void;
    style?: Record<string, unknown>;
  }): PayPalCardFields;
}

let loading: Promise<PayPalGlobal | null> | null = null;

/** Resolves to PayPal's SDK, or null when PayPal is not set up or its script
 *  would not load — never a half-working object. */
export function loadPaypal(): Promise<PayPalGlobal | null> {
  loading ??= (async () => {
    const config = await api.paypalConfig();
    if (!config.ready) return null;
    return await new Promise<PayPalGlobal | null>((resolve) => {
      const script = document.createElement("script");
      script.src = paypalSdkUrl(config.clientId);
      script.async = true;
      script.onload = () => resolve((window as unknown as { paypal?: PayPalGlobal }).paypal ?? null);
      script.onerror = () => resolve(null);
      document.body.appendChild(script);
    });
  })().catch(() => null);
  // A failed load is not cached, so opening the screen again tries again.
  void loading.then((p) => { if (!p) loading = null; });
  return loading;
}
