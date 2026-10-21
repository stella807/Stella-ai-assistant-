import {
  PAYPAL_REF_PREFIX, authorizeWithPaypal, capturePaypalHold, chargeWithPaypal, paypalChargingReady, voidPaypalHold,
} from "./paypal.ts";

/**
 * One front door for taking money from a customer's saved payment method.
 *
 * PayPal is the only processor that can reserve and charge a saved method, so
 * everything here goes to it; the names stay generic so the routes and the
 * billing sweep do not care. A hold remembers its processor in its reference
 * (`paypal:…`), so a later capture or release goes back to the same place —
 * and a reference without it (a hold from a processor since removed) fails
 * loudly onto the charge rather than being sent somewhere it does not belong.
 */
export type Processor = "paypal";

export const processorReady = (processor: string): boolean => processor === "paypal" && paypalChargingReady();

/** Whether a processor can take money right now. */
export const chargingReady = (): boolean => paypalChargingReady();

export interface SavedCharge {
  processor: Processor;
  /** PayPal's vaulted payment token. */
  paymentMethodId: string;
  /** What kind of PayPal source it is (account or card). */
  method?: { brand: string; last4: string };
  amountCents: number;
  description: string;
  idempotencyKey: string;
}

const forPaypal = (input: SavedCharge) => ({
  paymentTokenId: input.paymentMethodId, method: input.method ?? { brand: "PayPal", last4: "" },
  amountCents: input.amountCents, description: input.description, idempotencyKey: input.idempotencyKey,
});

/** A plan's charge, taken in one step. */
export const chargeSaved = (input: SavedCharge): Promise<{ id: string }> => chargeWithPaypal(forPaypal(input));

/** A reservation for a task: the exact amount held, taken later. */
export const holdSaved = (input: SavedCharge): Promise<{ id: string }> => authorizeWithPaypal(forPaypal(input));

const orphan = () => new Error("That hold was placed with a payment processor that is no longer connected.");
const isPaypalRef = (ref: string) => ref.startsWith(PAYPAL_REF_PREFIX);

export const captureHeld = (ref: string, amountCents: number): Promise<void> =>
  isPaypalRef(ref) ? capturePaypalHold(ref, amountCents) : Promise.reject(orphan());

export const releaseHeld = (ref: string): Promise<void> =>
  isPaypalRef(ref) ? voidPaypalHold(ref) : Promise.reject(orphan());
