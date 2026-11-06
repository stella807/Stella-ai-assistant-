import type { PreAuthorization } from "./payment.ts";

/**
 * A prepaid Safehubby balance, loaded with crypto.
 *
 * A crypto payment settles the moment it is made: there is no hold, no saved
 * method to charge later, and no recurring payment (see
 * adapters/openreceive.ts). So it cannot sit behind the hold-then-charge model
 * the way a saved PayPal account does. A balance can: the customer pays once,
 * and the errands that follow reserve and spend from it.
 *
 * Nothing here is stored as a running total. The balance is derived from two
 * things that are already the record of truth — what was loaded or refunded
 * (`BalanceEntry`), and the holds that reserved it (`PreAuthorization`, marked
 * `fundedBy: "balance"`) — so capturing or releasing a hold changes the
 * balance with no second write that could disagree with it.
 */

/** The least that can be added: 50 cents, the smallest card payment Stripe takes. There is no other floor. */
export const BALANCE_MIN_LOAD_CENTS = 50;
/** The most one card payment can be: $999,999.99, Stripe's own limit. Safehubby sets no ceiling of its own. */
export const BALANCE_MAX_LOAD_CENTS = 99_999_999;
/** No limit on what a balance can hold. Kept as a number so a caller that asks has an answer. */
export const BALANCE_MAX_CENTS = Number.MAX_SAFE_INTEGER;

export type BalanceEntryKind = "load" | "payout";

export interface BalanceEntry {
  id: string;
  travelerId: string;
  /** `load` is money in from the processor; `payout` is unused money refunded back out. */
  kind: BalanceEntryKind;
  amountCents: number;
  /** The processor's reference for the payment — what a refund is issued against. */
  reference: string;
  /** For a payout, the load it was refunded against. */
  againstEntryId?: string;
  /** Where a load came from. Absent on older entries. */
  /** `"ath-movil"` is kept for entries added before ATH Móvil was removed. */
  source?: "crypto" | "ath-movil" | "stripe";
  createdAt: string;
}

export interface BalanceSummary {
  loadedCents: number;
  refundedCents: number;
  /** Reserved by tasks still in progress. */
  heldCents: number;
  /** Actually used by finished tasks. */
  spentCents: number;
  /** What can still be reserved or refunded. */
  availableCents: number;
}

export function balanceSummary(
  entries: BalanceEntry[], holds: PreAuthorization[], travelerId: string,
): BalanceSummary {
  let loadedCents = 0;
  let refundedCents = 0;
  for (const e of entries) {
    if (e.travelerId !== travelerId) continue;
    if (e.kind === "load") loadedCents += e.amountCents;
    else refundedCents += e.amountCents;
  }
  let heldCents = 0;
  let spentCents = 0;
  for (const h of holds) {
    if (h.travelerId !== travelerId || h.fundedBy !== "balance") continue;
    if (h.status === "held") heldCents += h.amountCents;
    else if (h.status === "captured") spentCents += h.capturedCents ?? 0;
  }
  return {
    loadedCents, refundedCents, heldCents, spentCents,
    availableCents: Math.max(0, loadedCents - refundedCents - heldCents - spentCents),
  };
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function validateLoad(amountCents: number, _currentBalanceCents: number): void {
  if (!Number.isInteger(amountCents)) throw new Error("Enter a whole number of cents.");
  if (amountCents < BALANCE_MIN_LOAD_CENTS) {
    throw new Error(`Add at least ${dollars(BALANCE_MIN_LOAD_CENTS)}, the smallest card payment Stripe takes.`);
  }
  if (amountCents > BALANCE_MAX_LOAD_CENTS) {
    throw new Error(`One card payment can be at most ${dollars(BALANCE_MAX_LOAD_CENTS)}.`);
  }
}
