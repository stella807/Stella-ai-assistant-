import {
  PAYPAL_REF_PREFIX, authorizeWithPaypal, capturePaypalHold, chargeWithPaypal, paypalChargingReady, voidPaypalHold,
} from "./paypal.ts";
import {
  captureOnCard, cardChargingReady as stripeReady, chargeOnCard, holdOnCard, isStripeRef, payOnCard, refundOnCard, releaseOnCard,
} from "./stripe.ts";

/**
 * One front door for taking money from a customer's saved payment method.
 *
 * Which processor does the work is decided by how the customer saved it, not
 * by a global setting: a Stripe card is charged through Stripe and a PayPal
 * account or card through PayPal, so customers on either coexist. A hold
 * remembers its processor in its reference (`paypal:…` for PayPal, Stripe's
 * own `pi_…`), so a later capture or release goes back to the same place, and
 * a reference from neither fails loudly rather than being sent somewhere it
 * does not belong.
 */
export type Processor = "paypal" | "stripe";

export const processorReady = (processor: string): boolean =>
  processor === "paypal" ? paypalChargingReady() : processor === "stripe" ? stripeReady() : false;

/** Whether at least one processor can take money right now. */
export const chargingReady = (): boolean => paypalChargingReady() || stripeReady();

export interface SavedCharge {
  processor: Processor;
  /** Stripe only: the Customer the saved card hangs off. */
  customerId?: string;
  /** PayPal's vaulted payment token, or Stripe's PaymentMethod id. */
  paymentMethodId: string;
  method?: { brand: string; last4: string };
  amountCents: number;
  description: string;
  idempotencyKey: string;
}

const forPaypal = (input: SavedCharge) => ({
  paymentTokenId: input.paymentMethodId, method: input.method ?? { brand: "PayPal", last4: "" },
  amountCents: input.amountCents, description: input.description, idempotencyKey: input.idempotencyKey,
});

const forStripe = (input: SavedCharge) => {
  if (!input.customerId) throw new Error("This card was saved without a Stripe customer. Add it again under Payments.");
  return { ...input, customerId: input.customerId };
};

/** A plan's charge, taken in one step (a Stripe invoice, or a PayPal capture). */
export const chargeSaved = async (input: SavedCharge): Promise<{ id: string }> =>
  input.processor === "stripe" ? chargeOnCard(forStripe(input)) : chargeWithPaypal(forPaypal(input));

/** A one-time charge taken at once and refundable by its id: Stripe cards only. */
export const paySavedNow = async (input: SavedCharge): Promise<{ id: string }> => {
  if (input.processor !== "stripe") throw new Error("This extra is paid by card. Save a card under Payments first.");
  return payOnCard(forStripe(input));
};

/** Gives a `paySavedNow` charge back in full. */
export const refundPaid = (ref: string): Promise<void> => refundOnCard(ref);

/** A reservation for a task: the exact amount held, taken later. */
export const holdSaved = async (input: SavedCharge): Promise<{ id: string }> =>
  input.processor === "stripe" ? holdOnCard(forStripe(input)) : authorizeWithPaypal(forPaypal(input));

const orphan = () => new Error("That hold was placed with a payment processor that is no longer connected.");
const isPaypalRef = (ref: string) => ref.startsWith(PAYPAL_REF_PREFIX);

export const captureHeld = (ref: string, amountCents: number): Promise<void> =>
  isPaypalRef(ref) ? capturePaypalHold(ref, amountCents)
    : isStripeRef(ref) ? captureOnCard(ref, amountCents) : Promise.reject(orphan());

export const releaseHeld = (ref: string): Promise<void> =>
  isPaypalRef(ref) ? voidPaypalHold(ref) : isStripeRef(ref) ? releaseOnCard(ref) : Promise.reject(orphan());
