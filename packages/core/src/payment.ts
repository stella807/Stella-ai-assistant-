import type { Iso8601 } from "./types.ts";

/**
 * Payment method on file, and pre-authorization holds.
 *
 * This is what let the subscription price come back down. The earlier price
 * rise was arithmetic: booking a ride on someone's behalf meant Safehubby paid
 * Uber first and billed the user after, so the float and the bad-debt risk sat
 * inside the subscription price whether a given month's users needed a ride or
 * not. A hold moves that risk to the transaction it actually belongs to —
 * Safehubby never pays the provider until money is already reserved on the
 * user's card, so the subscription price only has to cover the software again.
 *
 * This models the mechanics; it does not talk to a payment network. A real
 * deployment wires this behind a processor (a PayPal authorization, captured
 * for what was spent, fits this exactly), and the domain rules — hold before
 * spend, capture only up to what was held, release what was not used — do not
 * change when it does.
 */

/**
 * The real backend that settles a method — an account Safehubby holds, with
 * its own credentials, its own rails and its own settlement.
 *
 * Deliberately short, and it is the list that decides what is real. PayPal
 * takes saved PayPal accounts and cards, and Stripe saved cards, for holds and
 * plan charges. Crypto loads a
 * prepaid balance instead, but it is not a method on file — see
 * crypto-loads.ts in the API. See `ChargeProcessorPort` in fulfillment.ts and
 * `adapters/paypal.ts`.
 */
export type PaymentProcessor = "paypal" | "stripe";

export interface PaymentMethodOnFile {
  id: string;
  /** See `AttachMethodInput.processorToken`. */
  processorToken?: string;
  processor: PaymentProcessor;
  /** Never a full card number. This is the only thing worth storing that way. */
  brand: string;
  /** Last four of the card. Empty for a PayPal account, which has no digits. */
  last4: string;
  /** What a person recognises an account by when there are no card digits —
   *  a masked PayPal email. Display only. */
  accountLabel?: string;
  /** Absent on a method with no card behind it — a PayPal account. There is
   *  nothing to expire, and treating a missing expiry as "expired" would lock
   *  those methods out permanently.
   *  Validated strictly whenever it is present. */
  expMonth?: number;
  expYear?: number;
  addedAt: Iso8601;
}

export interface AttachMethodInput {
  id: string;
  processor: PaymentProcessor;
  brand: string;
  last4: string;
  accountLabel?: string;
  expMonth?: number;
  expYear?: number;
  /** The processor's reusable id for the method (a PayPal vaulted payment token),
   *  so it can actually be charged later. Never a card number. */
  processorToken?: string;
  now: Date;
}

export function attachPaymentMethod(input: AttachMethodInput): PaymentMethodOnFile {
  // A PayPal account has no digits to keep, so it is the one method allowed to
  // have none — everything else must show the last four of something.
  const digitless = input.processor === "paypal" && input.last4 === "" && Boolean(input.accountLabel);
  if (!digitless && !/^\d{4}$/.test(input.last4)) throw new Error("Card number is not right.");
  if (!input.brand.trim()) throw new Error("Missing card brand.");

  const hasExpiry = input.expMonth !== undefined || input.expYear !== undefined;
  if (hasExpiry) {
    if (!Number.isInteger(input.expMonth) || input.expMonth! < 1 || input.expMonth! > 12) {
      throw new Error("Expiry month is not right.");
    }
    if (!Number.isInteger(input.expYear)) throw new Error("Expiry year is not right.");
    if (!isFuture(input.expMonth!, input.expYear!, input.now)) throw new Error("That card has expired.");
  }

  return {
    id: input.id,
    processor: input.processor,
    brand: input.brand.trim(),
    last4: input.last4,
    ...(input.accountLabel ? { accountLabel: input.accountLabel } : {}),
    ...(hasExpiry ? { expMonth: input.expMonth!, expYear: input.expYear! } : {}),
    ...(input.processorToken ? { processorToken: input.processorToken } : {}),
    addedAt: input.now.toISOString(),
  };
}

function isFuture(month: number, year: number, now: Date): boolean {
  const expiry = new Date(year, month, 0, 23, 59, 59);
  return expiry.getTime() >= now.getTime();
}

export function isMethodExpired(method: PaymentMethodOnFile, now: Date): boolean {
  if (method.expMonth === undefined || method.expYear === undefined) return false;
  return !isFuture(method.expMonth, method.expYear, now);
}

/**
 * A hold is created before Safehubby spends a cent with a provider, at the
 * estimated cost plus a buffer for surge or a slightly longer route. If the
 * hold cannot be placed, the booking must not happen — that ordering is the
 * entire point.
 */
export type HoldStatus = "held" | "captured" | "released" | "expired";

export interface PreAuthorization {
  id: string;
  travelerId: string;
  /** What is reserved. The eventual charge can be less; never more. */
  amountCents: number;
  currency: string;
  createdAt: Iso8601;
  status: HoldStatus;
  /** Set once captured. */
  capturedCents?: number;
  /** What this hold is for — a ride or a secure-transport trip id, once known. */
  reference?: string;
  /** Set when this hold reserves the customer's prepaid balance rather than a card. */
  fundedBy?: "balance";
  /** The processor's own record of the real authorization (`paypal:` and a
   *  PayPal authorization id), once money is actually reserved. */
  processorRef?: string;
}

/** Buffer over the estimate, to absorb surge or a route that runs long. */
export const HOLD_BUFFER = 1.25;
/** Holds this old are treated as expired rather than captured against later —
 *  a card network will have already released an unused hold by then. */
export const HOLD_TTL_HOURS = 24;

export function authorizeHold(input: {
  id: string;
  travelerId: string;
  estimateCents: number;
  now: Date;
  currency?: string;
}): PreAuthorization {
  if (input.estimateCents <= 0) throw new Error("Nothing to hold for.");
  return {
    id: input.id,
    travelerId: input.travelerId,
    amountCents: Math.ceil(input.estimateCents * HOLD_BUFFER),
    currency: input.currency ?? "USD",
    createdAt: input.now.toISOString(),
    status: "held",
  };
}

/**
 * Holds exactly the amount given, with no buffer.
 *
 * `authorizeHold` pads a provider's fare *estimate* because the real cost is
 * genuinely uncertain — surge pricing, a longer route. A concierge spend cap
 * (see concierge.ts) is not an estimate; it is a ceiling the subscriber chose
 * on purpose, for money a stranger will be the one spending. Padding it would
 * authorize more than what was promised, which is the one thing that feature
 * cannot do.
 */
export function authorizeExactHold(input: {
  id: string;
  travelerId: string;
  capCents: number;
  now: Date;
  currency?: string;
  reference?: string;
  fundedBy?: "balance";
}): PreAuthorization {
  if (input.capCents <= 0) throw new Error("Nothing to hold for.");
  return {
    id: input.id,
    travelerId: input.travelerId,
    amountCents: input.capCents,
    currency: input.currency ?? "USD",
    createdAt: input.now.toISOString(),
    status: "held",
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.fundedBy ? { fundedBy: input.fundedBy } : {}),
  };
}

export function isHoldExpired(hold: PreAuthorization, now: Date): boolean {
  return now.getTime() - new Date(hold.createdAt).getTime() > HOLD_TTL_HOURS * 3_600_000;
}

/**
 * Captures the real cost once it is known. Can never exceed what was held —
 * that ceiling is what makes the hold meaningful; a "capture" that ignores it
 * is just a charge with extra ceremony.
 */
export function captureHold(hold: PreAuthorization, actualCents: number, now: Date): PreAuthorization {
  if (hold.status !== "held") throw new Error(`Cannot capture a ${hold.status} hold.`);
  if (isHoldExpired(hold, now)) throw new Error("This hold has expired and must be re-authorized.");
  if (actualCents > hold.amountCents) {
    throw new Error(`Actual cost $${(actualCents / 100).toFixed(2)} exceeds the held $${(hold.amountCents / 100).toFixed(2)}.`);
  }
  if (actualCents < 0) throw new Error("Capture amount cannot be negative.");
  return { ...hold, status: "captured", capturedCents: actualCents };
}

/** Releases a hold with nothing captured — a booking that never went through. */
export function releaseHold(hold: PreAuthorization): PreAuthorization {
  if (hold.status !== "held") return hold;
  return { ...hold, status: "released" };
}

export function sweepExpiredHolds(holds: PreAuthorization[], now: Date): PreAuthorization[] {
  return holds.map((h) => (h.status === "held" && isHoldExpired(h, now) ? { ...h, status: "expired" as const } : h));
}

/** Whether an automatic (pay-then-bill) booking may proceed right now. */
export function canBookAutomatically(hasPaymentMethod: boolean, method: PaymentMethodOnFile | null, now: Date): boolean {
  return hasPaymentMethod && method !== null && !isMethodExpired(method, now);
}
