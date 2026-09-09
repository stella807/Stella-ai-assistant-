import type { ImpairmentBand } from "./bac.ts";
import type { Iso8601 } from "./types.ts";

/**
 * The "pharmacy run": water, electrolytes, food and next-morning supplies sent
 * to the house when the night has got away from someone.
 *
 * The whole design turns on one rule: **the purchase is authorized while sober
 * and executed later.** Charging someone's card on the strength of an estimate
 * that they are too drunk to consent is exactly backwards — an impaired person
 * cannot meaningfully approve a purchase, so the approval has to happen before
 * the drinking does. Hence: an explicit opt-in, a hard spending cap, one basket
 * per night, and a plain record of what was sent and why.
 *
 * A partner can also send one by hand, which needs no pre-authorization because
 * they are paying and they are sober.
 */

export type BasketId = "hydration" | "morning-after" | "food" | "hot-meal";

export interface BasketItem {
  sku: string;
  name: string;
  priceCents: number;
  qty: number;
}

export interface Basket {
  id: BasketId;
  name: string;
  blurb: string;
  items: BasketItem[];
}

export const BASKETS: Basket[] = [
  {
    id: "hydration",
    name: "Hydration run",
    blurb: "Electrolytes and water, sent to your door.",
    items: [
      { sku: "wg-liquid-iv", name: "Liquid I.V. hydration packs (4)", priceCents: 999, qty: 1 },
      { sku: "wg-gatorade", name: "Gatorade, 32oz", priceCents: 349, qty: 2 },
      { sku: "wg-water", name: "Bottled water, 6-pack", priceCents: 349, qty: 1 },
    ],
  },
  {
    id: "morning-after",
    name: "Morning after",
    blurb: "Electrolytes, plain carbs, and something for the headache.",
    items: [
      { sku: "wg-pedialyte", name: "Pedialyte", priceCents: 699, qty: 1 },
      { sku: "wg-ibuprofen", name: "Ibuprofen 200mg", priceCents: 899, qty: 1 },
      { sku: "wg-crackers", name: "Saltine crackers", priceCents: 299, qty: 1 },
      { sku: "wg-bananas", name: "Bananas", priceCents: 199, qty: 1 },
    ],
  },
  {
    id: "food",
    name: "Quick bite",
    blurb: "A sandwich and something to go with it, for when a little is enough.",
    items: [
      { sku: "wg-sandwich", name: "Sandwich", priceCents: 799, qty: 1 },
      { sku: "wg-chips", name: "Chips", priceCents: 249, qty: 1 },
      { sku: "wg-water", name: "Bottled water, 6-pack", priceCents: 349, qty: 1 },
    ],
  },
  {
    id: "hot-meal",
    name: "Actual meal",
    blurb: "A hot entrée and a side, not just something to snack on.",
    items: [
      { sku: "wg-burrito-bowl", name: "Burrito bowl", priceCents: 999, qty: 1 },
      { sku: "wg-rotisserie-side", name: "Side salad", priceCents: 449, qty: 1 },
      { sku: "wg-water", name: "Bottled water, 6-pack", priceCents: 349, qty: 1 },
    ],
  },
];

export function findBasket(id: BasketId): Basket {
  const basket = BASKETS.find((b) => b.id === id);
  if (!basket) throw new Error(`Unknown basket: ${id}`);
  return basket;
}

export function basketTotalCents(basket: Basket): number {
  return basket.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
}

/** Bands at which an automatic run may fire. Below "moderate" it is noise. */
export type TriggerBand = Extract<ImpairmentBand, "moderate" | "high" | "severe">;
const BAND_ORDER: Record<ImpairmentBand, number> = { none: 0, low: 1, moderate: 2, high: 3, severe: 4 };

export interface CarePackageAuth {
  enabled: boolean;
  basketId: BasketId;
  /** Hard ceiling. A basket over this is refused, never trimmed silently. */
  capCents: number;
  triggerBand: TriggerBand;
  deliverTo: string;
  authorizedAt: Iso8601;
}

export const DEFAULT_CAP_CENTS = 3000;
export const MAX_CAP_CENTS = 10000;

export interface AuthorizeInput {
  basketId: BasketId;
  capCents: number;
  triggerBand: TriggerBand;
  deliverTo: string;
  now: Date;
  /** The estimate at the moment of authorizing. */
  currentBand: ImpairmentBand;
}

/**
 * Authorization is refused once someone is already impaired. If you are past
 * the line, you are past the point of giving informed consent to a purchase,
 * and the honest answer is "set this up next time, before you go out".
 */
export function authorizeCarePackage(input: AuthorizeInput): CarePackageAuth {
  if (BAND_ORDER[input.currentBand] >= BAND_ORDER.moderate) {
    throw new Error(
      "Set this up before you start drinking. Once you are impaired, Safehubby will not take an authorization to spend your money.",
    );
  }
  if (input.capCents <= 0 || input.capCents > MAX_CAP_CENTS) {
    throw new Error(`Set a spending cap between $0.01 and $${(MAX_CAP_CENTS / 100).toFixed(0)}.`);
  }
  const basket = findBasket(input.basketId);
  if (basketTotalCents(basket) > input.capCents) {
    throw new Error(`"${basket.name}" costs more than your cap. Raise the cap or pick a smaller basket.`);
  }
  if (!input.deliverTo.trim()) throw new Error("Say where it should be delivered.");

  return {
    enabled: true,
    basketId: input.basketId,
    capCents: input.capCents,
    triggerBand: input.triggerBand,
    deliverTo: input.deliverTo.trim(),
    authorizedAt: input.now.toISOString(),
  };
}

export interface CarePackageOrder {
  id: string;
  basketId: BasketId;
  totalCents: number;
  deliverTo: string;
  placedAt: Iso8601;
  /** Why it went out — shown plainly, never hidden in a receipt. */
  reason: "auto" | "traveler" | "guardian";
  etaMinutes: number;
}

export interface TriggerContext {
  auth: CarePackageAuth | null;
  band: ImpairmentBand;
  /** Orders already placed this night. One automatic run per night. */
  existingOrders: CarePackageOrder[];
}

/**
 * Decides whether an automatic run should go out now. Pure, so the "did it
 * charge me twice" question is answerable by a test rather than by reading logs.
 */
export function shouldSendAutomatically({ auth, band, existingOrders }: TriggerContext): boolean {
  if (!auth?.enabled) return false;
  if (existingOrders.some((o) => o.reason === "auto")) return false;
  if (BAND_ORDER[band] < BAND_ORDER[auth.triggerBand]) return false;
  return basketTotalCents(findBasket(auth.basketId)) <= auth.capCents;
}

export function buildOrder(
  id: string,
  basketId: BasketId,
  deliverTo: string,
  reason: CarePackageOrder["reason"],
  now: Date,
  etaMinutes = 28,
): CarePackageOrder {
  const basket = findBasket(basketId);
  return {
    id,
    basketId,
    totalCents: basketTotalCents(basket),
    deliverTo,
    placedAt: now.toISOString(),
    reason,
    etaMinutes,
  };
}
