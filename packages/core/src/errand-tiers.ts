import type { ConciergeCategory } from "./concierge.ts";

/**
 * Errands priced by how much work they are, with a fee sized so Safehubby
 * keeps five cents on every one.
 *
 * **The runner.** Paid $24 an hour for the minutes the tier assumes, plus
 * $0.70 a mile because they drive their own car, and never less than $10 for
 * an errand. Raised from $16 at ownership's direction to sit near what
 * TaskRabbit errand Taskers earn (about $28 an hour in its 2026 cost guide,
 * usually with a one-hour minimum): at $16 a short errand paid $4, which
 * nobody makes a trip for. The minimum is the short-errand fix — a
 * fifteen-minute grab still costs the runner the trip there and back.
 *
 * **The fee.** The customer pays the runner's pay, the card processor's cut,
 * and five cents. The card cut is a percentage of the *whole* hold — item and
 * fee together — so a flat fee sized for a $2 soda loses money on a $100
 * shop. The fee is worked out from the spend cap actually chosen, which also
 * means somebody buying a larger item pays for the processing of a larger
 * item, and nobody else does.
 *
 * Five cents is what the owner asked for. It is a floor that holds at the
 * full cap; an errand that costs less than its cap earns slightly more.
 *
 * `CARD_FEE_*` are U.S. card pricing. ATH Móvil and Puerto Rico–issued cards
 * are priced differently; when the processor for a rail is known, this is the
 * one place to change.
 */

export const ERRAND_RATE_PER_HOUR_CENTS = 2_400;
/** The least any errand pays the runner, however short. */
export const ERRAND_MIN_PAYOUT_CENTS = 1_000;
/** IRS standard mileage rate. They drive their own car and are not reimbursed
 *  for it any other way. */
export const ERRAND_MILEAGE_CENTS = 70;
export const CARD_FEE_RATE = 0.029;
export const CARD_FEE_FIXED_CENTS = 30;
export const ERRAND_PROFIT_FLOOR_CENTS = 5;
/** The purchase every "from $X" errand price is quoted against, so the
 *  website and the app quote the same floor. */
export const ERRAND_REFERENCE_CAP_CENTS = 2_000;

export type ErrandTierId = "in-building" | "nearby-store" | "shopping-trip" | "wait-in-line" | "pharmacy";

/**
 * A pharmacy pickup is one flat fee, not priced on the minutes and miles —
 * at ownership's direction, so somebody collecting a prescription knows the
 * cost before they ask. The customer pays for the medication as well. The
 * runner is still paid for the trip as the tier assumes it.
 *
 * The flat fee clears the runner's pay and the card cost with room to spare
 * on any ordinary prescription; on a very expensive one the card's cut of the
 * hold would outgrow it, so the fee rises to the usual formula there rather
 * than losing money.
 */
export const PHARMACY_RUN_FEE_CENTS = 2_999;

/** The tiers that are food: a snack in the building, a restaurant or takeout
 *  order, a grocery run. Basic's errand credit covers only these. */
export const FOOD_ERRAND_TIERS: ErrandTierId[] = ["in-building", "wait-in-line", "shopping-trip"];

export interface ErrandTier {
  id: ErrandTierId;
  label: string;
  /** What this looks like, in words a person in a hospital bed recognises. */
  example: string;
  /** The time the tier is priced on, including the parts nobody counts:
   *  parking, security, a visitor badge, the elevator. */
  minutes: number;
  miles: number;
  /** A sensible card limit to start from, so nobody opens the form to a $100 default for a soda. */
  suggestedCapCents: number;
}

export const ERRAND_TIERS: ErrandTier[] = [
  { id: "in-building", label: "In the building", example: "A soda or a snack from the cafeteria or gift shop", minutes: 15, miles: 0, suggestedCapCents: 1000 },
  { id: "nearby-store", label: "Nearby store", example: "A phone charger, snacks, toiletries", minutes: 35, miles: 4, suggestedCapCents: 2500 },
  { id: "shopping-trip", label: "Shopping trip", example: "A blanket, clothes, a few stops", minutes: 60, miles: 10, suggestedCapCents: 7500 },
  { id: "wait-in-line", label: "Wait in line", example: "A restaurant or takeout order", minutes: 50, miles: 6, suggestedCapCents: 4000 },
  { id: "pharmacy", label: "Pharmacy pickup", example: "A prescription or medicine from the pharmacy", minutes: 50, miles: 6, suggestedCapCents: 4000 },
];

export function findErrandTier(id: string): ErrandTier {
  const found = ERRAND_TIERS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown errand tier: ${id}`);
  return found;
}

/** Tiers price a thing somebody fetches. Sitting with a person is by the
 *  hour, and a tier there would be a second price that disagrees with it. */
export function validateErrandTier(id: string, category: ConciergeCategory): void {
  findErrandTier(id);
  if (category !== "grab-something" && category !== "run-errand") {
    throw new Error("An errand tier applies only to grabbing something or running an errand.");
  }
}

/** What the runner is paid. The same whatever the customer is charged. */
export function errandPayoutCents(id: ErrandTierId): number {
  const t = findErrandTier(id);
  return Math.max(ERRAND_MIN_PAYOUT_CENTS, Math.round((ERRAND_RATE_PER_HOUR_CENTS * t.minutes) / 60 + ERRAND_MILEAGE_CENTS * t.miles));
}

/** What the card processor takes on a hold of this size, rounded up — against
 *  us, so the profit floor is never flattered by rounding. */
export function errandCardCostCents(holdCents: number): number {
  return Math.ceil(holdCents * CARD_FEE_RATE + CARD_FEE_FIXED_CENTS);
}

/**
 * The service fee: the smallest, to the cent, that still leaves
 * `ERRAND_PROFIT_FLOOR_CENTS` after the runner and the card processor.
 *
 * Solved in closed form and then checked, because the processor's cut is
 * itself a percentage of the fee being solved for, and rounding it up can
 * push the answer a cent short.
 */
export function errandFeeCents(id: ErrandTierId, spendCapCents: number): number {
  const payout = errandPayoutCents(id);
  const need = payout + CARD_FEE_FIXED_CENTS + ERRAND_PROFIT_FLOOR_CENTS + CARD_FEE_RATE * spendCapCents;
  let fee = Math.ceil(need / (1 - CARD_FEE_RATE));
  if (id === "pharmacy") fee = Math.max(fee, PHARMACY_RUN_FEE_CENTS);
  while (fee - payout - errandCardCostCents(spendCapCents + fee) < ERRAND_PROFIT_FLOOR_CENTS) fee += 1;
  return fee;
}

/** What Safehubby keeps if the whole cap is spent — the worst case. */
export function errandProfitCents(id: ErrandTierId, spendCapCents: number): number {
  const fee = errandFeeCents(id, spendCapCents);
  return fee - errandPayoutCents(id) - errandCardCostCents(spendCapCents + fee);
}

/** The amount charged for the tier's fee and the whole hold, together. */
export function errandPricing(id: ErrandTierId, spendCapCents: number): {
  payoutCents: number; serviceFeeCents: number; totalCents: number;
} {
  const serviceFeeCents = errandFeeCents(id, spendCapCents);
  return { payoutCents: errandPayoutCents(id), serviceFeeCents, totalCents: spendCapCents + serviceFeeCents };
}
