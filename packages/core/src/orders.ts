import type { ImpairmentBand } from "./bac.ts";
import type { Iso8601 } from "./types.ts";

/**
 * Orders that wait for a sober yes.
 *
 * Food delivery is the one thing everyone wants at 1am and regrets at 1:05.
 * Rather than either charging an impaired person on the spot or refusing them
 * entirely, Safehubby queues the order and asks properly once the estimate says
 * they are back under the line — which in practice is the next morning.
 *
 * The rule is the same one behind the pharmacy run: money leaves an account
 * only on a decision made sober. The difference is direction — the pharmacy run
 * is authorized in advance, this one is confirmed afterwards.
 */

export type OrderProvider = "uber-eats" | "doordash";

export interface OrderLine {
  sku: string;
  name: string;
  priceCents: number;
  qty: number;
}

export type PendingStatus = "waiting" | "confirmed" | "declined" | "expired";

export interface PendingOrder {
  id: string;
  provider: OrderProvider;
  vendorName: string;
  lines: OrderLine[];
  totalCents: number;
  deliverTo: string;
  queuedAt: Iso8601;
  /** Plain-language reason, shown back to them when we ask. */
  queuedBecause: string;
  status: PendingStatus;
  decidedAt?: Iso8601;
}

/** A queued order that nobody confirms should die, not linger as a surprise. */
export const PENDING_TTL_HOURS = 20;

/** Bands at which we consider someone able to decide about spending money. */
const SOBER_BANDS: ImpairmentBand[] = ["none", "low"];

export function orderTotalCents(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.priceCents * l.qty, 0);
}

export interface QueueInput {
  id: string;
  provider: OrderProvider;
  vendorName: string;
  lines: OrderLine[];
  deliverTo: string;
  now: Date;
  queuedBecause: string;
}

export function queueOrder(input: QueueInput): PendingOrder {
  if (input.lines.length === 0) throw new Error("Add something to the order first.");
  if (!input.deliverTo.trim()) throw new Error("Say where it should go.");
  return {
    id: input.id,
    provider: input.provider,
    vendorName: input.vendorName,
    lines: input.lines,
    totalCents: orderTotalCents(input.lines),
    deliverTo: input.deliverTo.trim(),
    queuedAt: input.now.toISOString(),
    queuedBecause: input.queuedBecause,
    status: "waiting",
  };
}

export function isExpired(order: PendingOrder, now: Date): boolean {
  const age = now.getTime() - new Date(order.queuedAt).getTime();
  return age > PENDING_TTL_HOURS * 3_600_000;
}

/**
 * Whether to put the question in front of them now. Never while impaired: an
 * "are you sure?" answered by someone too drunk to evaluate it is not consent,
 * it is a formality with a charge attached.
 */
export function canAskNow(order: PendingOrder, band: ImpairmentBand, now: Date): boolean {
  if (order.status !== "waiting") return false;
  if (isExpired(order, now)) return false;
  return SOBER_BANDS.includes(band);
}

export function askableOrders(orders: PendingOrder[], band: ImpairmentBand, now: Date): PendingOrder[] {
  return orders.filter((o) => canAskNow(o, band, now));
}

export function confirmOrder(order: PendingOrder, band: ImpairmentBand, now: Date): PendingOrder {
  if (order.status !== "waiting") throw new Error("That order has already been dealt with.");
  if (isExpired(order, now)) throw new Error("That order expired. Start a new one if you still want it.");
  if (!SOBER_BANDS.includes(band)) {
    throw new Error("Safehubby will ask you about this once you have sobered up. Nothing has been charged.");
  }
  return { ...order, status: "confirmed", decidedAt: now.toISOString() };
}

export function declineOrder(order: PendingOrder, now: Date): PendingOrder {
  if (order.status !== "waiting") return order;
  return { ...order, status: "declined", decidedAt: now.toISOString() };
}

/** Marks lapsed orders expired. Pure, so the sweep is testable. */
export function sweepExpired(orders: PendingOrder[], now: Date): PendingOrder[] {
  return orders.map((o) => (o.status === "waiting" && isExpired(o, now) ? { ...o, status: "expired" as const } : o));
}
