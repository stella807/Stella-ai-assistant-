import {
  captureOnCard, cardChargingReady as stripeReady, chargeOnCard as chargeStripe, holdOnCard, releaseOnCard,
} from "./stripe.ts";
import {
  PAYPAL_REF_PREFIX, authorizeWithPaypal, capturePaypalHold, chargeWithPaypal, paypalChargingReady, voidPaypalHold,
} from "./paypal.ts";

/**
 * One front door for taking money from a customer's saved payment method.
 *
 * Which processor does the work is decided by how the customer saved it, not
 * by a global setting: a Stripe card is charged through Stripe and a PayPal
 * account through PayPal, so customers on either can coexist, and switching
 * Stripe off is just not setting its key. A hold remembers its processor in
 * its reference (`paypal:…` for PayPal, Stripe's own `pi_…` otherwise), so a
 * later capture or release goes to the same place.
 */
export type Processor = "stripe" | "paypal";

export const processorReady = (processor: string): boolean =>
  processor === "stripe" ? stripeReady() : processor === "paypal" ? paypalChargingReady() : false;

/** Whether at least one processor can take money right now. */
export const chargingReady = (): boolean => stripeReady() || paypalChargingReady();

export interface SavedCharge {
  processor: Processor;
  /** Stripe only: the customer the saved method hangs off. */
  customerId?: string;
  /** Stripe's PaymentMethod id, or PayPal's vaulted payment token. */
  paymentMethodId: string;
  /** What kind of PayPal source it is (account, Venmo or card). */
  method?: { brand: string; last4: string };
  amountCents: number;
  description: string;
  idempotencyKey: string;
}

/** A plan's charge, taken in one step. */
export function chargeSaved(input: SavedCharge): Promise<{ id: string }> {
  if (input.processor === "paypal") {
    return chargeWithPaypal({
      paymentTokenId: input.paymentMethodId, method: input.method ?? { brand: "PayPal", last4: "" },
      amountCents: input.amountCents, description: input.description, idempotencyKey: input.idempotencyKey,
    });
  }
  return chargeStripe({ ...input, customerId: input.customerId ?? "" });
}

/** A reservation for a task: the exact amount held, taken later. */
export function holdSaved(input: SavedCharge): Promise<{ id: string }> {
  if (input.processor === "paypal") {
    return authorizeWithPaypal({
      paymentTokenId: input.paymentMethodId, method: input.method ?? { brand: "PayPal", last4: "" },
      amountCents: input.amountCents, description: input.description, idempotencyKey: input.idempotencyKey,
    });
  }
  return holdOnCard({ ...input, customerId: input.customerId ?? "" });
}

const isPaypalRef = (ref: string) => ref.startsWith(PAYPAL_REF_PREFIX);

export const captureHeld = (ref: string, amountCents: number): Promise<void> =>
  isPaypalRef(ref) ? capturePaypalHold(ref, amountCents) : captureOnCard(ref, amountCents);

export const releaseHeld = (ref: string): Promise<void> =>
  isPaypalRef(ref) ? voidPaypalHold(ref) : releaseOnCard(ref);
