import type { Iso8601 } from "./types.ts";

/**
 * One ledger for everything Safehubby ever charges.
 *
 * The point of this module is that there is exactly one place to answer "what
 * has this person paid us, and what do they owe" — the subscription, the ride
 * home, the secure-transport trip, the pharmacy run. Before this, the
 * subscription lived in one concept and per-trip holds in another, and no
 * single surface could tell a user what their month actually cost.
 *
 * It does NOT follow that a single card processor can settle all of it. Apple
 * and Google require their own in-app purchase for digital subscriptions sold
 * inside an app, and forbid routing physical goods and real-world services
 * through that same rail — a pharmacy delivery or a ride home has to be a card
 * charge, and on iOS the subscription has to be an App Store purchase. Those
 * are two settlement rails whether anyone likes it or not.
 *
 * So the split is put exactly where it is unavoidable and nowhere else: `rail`
 * is a property of a line in this ledger, chosen by `railFor`, and every other
 * part of the system — the statement, the totals, the history, the screen the
 * user reads — treats all lines the same. One account, one ledger, one
 * statement; the rail is an implementation detail of how a given line settles.
 */

/** What a charge is for. Drives the rail, and groups the statement. */
export type ChargeKind =
  | "subscription"
  | "ride"
  | "secure-transport"
  | "delivery"
  | "supplies"
  | "concierge";

/** How a charge settles. Not a user-facing choice — see `railFor`. */
export type BillingRail = "card" | "app-store" | "play-store";

export type Platform = "web" | "ios" | "android";

export type ChargeStatus = "pending" | "settled" | "refunded" | "failed";

export interface Charge {
  id: string;
  travelerId: string;
  kind: ChargeKind;
  rail: BillingRail;
  /** What the user sees on the line. Written for them, not for us. */
  description: string;
  amountCents: number;
  currency: string;
  status: ChargeStatus;
  createdAt: Iso8601;
  settledAt?: Iso8601;
  /** Why a charge failed, in words the user can act on. */
  failureReason?: string;
  /** The provider's trip or order id, once there is one. */
  reference?: string;
  /** The pre-authorization this line was captured from, for pay-then-bill lines. */
  holdId?: string;
}

/**
 * Digital goods, in the sense the app stores mean it: a subscription unlocking
 * software features. Everything else on this list is a real-world service or a
 * physical item, which the stores explicitly exclude from in-app purchase.
 */
const DIGITAL_KINDS = new Set<ChargeKind>(["subscription"]);

export function isDigital(kind: ChargeKind): boolean {
  return DIGITAL_KINDS.has(kind);
}

/**
 * Which rail settles a given line.
 *
 * Digital subscription inside a store app → that store's billing, because the
 * store requires it and will reject the build otherwise. Everything else → the
 * card on file, because the store rules forbid putting real-world services and
 * physical goods through in-app purchase, and because a ride needs a hold that
 * in-app purchase cannot place anyway.
 */
export function railFor(kind: ChargeKind, platform: Platform): BillingRail {
  if (!isDigital(kind)) return "card";
  if (platform === "ios") return "app-store";
  if (platform === "android") return "play-store";
  return "card";
}

export function describeRail(rail: BillingRail): string {
  if (rail === "app-store") return "Billed through your Apple ID — Apple requires subscriptions bought in the app to go through them.";
  if (rail === "play-store") return "Billed through Google Play — Google requires subscriptions bought in the app to go through them.";
  return "Billed to the card on file.";
}

/** The rails a set of lines actually used, in a stable order for display. */
export function railsUsed(charges: Charge[]): BillingRail[] {
  const order: BillingRail[] = ["card", "app-store", "play-store"];
  return order.filter((r) => charges.some((c) => c.rail === r));
}

export interface RecordChargeInput {
  id: string;
  travelerId: string;
  kind: ChargeKind;
  platform: Platform;
  description: string;
  amountCents: number;
  now: Date;
  currency?: string;
  reference?: string;
  holdId?: string;
}

export function recordCharge(input: RecordChargeInput): Charge {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("A charge needs a positive whole-cent amount.");
  }
  if (!input.description.trim()) throw new Error("A charge needs a description the user can read.");
  return {
    id: input.id,
    travelerId: input.travelerId,
    kind: input.kind,
    rail: railFor(input.kind, input.platform),
    description: input.description.trim(),
    amountCents: input.amountCents,
    currency: input.currency ?? "USD",
    status: "pending",
    createdAt: input.now.toISOString(),
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.holdId ? { holdId: input.holdId } : {}),
  };
}

/**
 * Settles at the real amount, which for a pay-then-bill line is only known
 * after the provider charges. Never above what was recorded: the recorded
 * amount came from a hold, and capturing past a hold is the one thing the hold
 * exists to prevent.
 */
export function settleCharge(charge: Charge, now: Date, actualCents?: number, reference?: string): Charge {
  if (charge.status !== "pending") throw new Error(`Cannot settle a ${charge.status} charge.`);
  const amount = actualCents ?? charge.amountCents;
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Settlement amount is not a whole number of cents.");
  if (amount > charge.amountCents) {
    throw new Error(`Settling $${(amount / 100).toFixed(2)} exceeds the authorized $${(charge.amountCents / 100).toFixed(2)}.`);
  }
  return {
    ...charge,
    amountCents: amount,
    status: "settled",
    settledAt: now.toISOString(),
    ...(reference ? { reference } : {}),
  };
}

/** A charge that never happened. Kept on the ledger rather than deleted, so a
 *  user who saw a pending line can see what became of it. */
export function failCharge(charge: Charge, reason: string, now: Date): Charge {
  if (charge.status !== "pending") return charge;
  return { ...charge, status: "failed", failureReason: reason, settledAt: now.toISOString() };
}

export function refundCharge(charge: Charge, now: Date): Charge {
  if (charge.status !== "settled") throw new Error(`Cannot refund a ${charge.status} charge.`);
  return { ...charge, status: "refunded", settledAt: now.toISOString() };
}

export function chargesFor(charges: Charge[], travelerId: string): Charge[] {
  return charges.filter((c) => c.travelerId === travelerId);
}

export interface StatementLine {
  kind: ChargeKind;
  label: string;
  count: number;
  cents: number;
}

export interface Statement {
  periodStart: Iso8601;
  periodEnd: Iso8601;
  /** Grouped by what the money went to, largest first. */
  lines: StatementLine[];
  /** Money actually taken in the period. */
  settledCents: number;
  /** Authorized and not yet settled — a ride still in progress. */
  pendingCents: number;
  currency: string;
  rails: BillingRail[];
}

const KIND_LABEL: Record<ChargeKind, string> = {
  subscription: "Subscription",
  ride: "Rides home",
  "secure-transport": "Secure transport",
  delivery: "Delivery",
  supplies: "Pharmacy runs",
  concierge: "Concierge tasks",
};

export function kindLabel(kind: ChargeKind): string {
  return KIND_LABEL[kind];
}

export const STATEMENT_DAYS = 30;

/**
 * Everything charged in a window, across every rail, in one object. This is
 * the "all in one" the ledger exists for: the caller does not filter by rail,
 * because a user asking what their month cost does not care which company's
 * pipes the money went through.
 */
export function buildStatement(
  charges: Charge[],
  travelerId: string,
  now: Date,
  days: number = STATEMENT_DAYS,
): Statement {
  const start = new Date(now.getTime() - days * 86_400_000);
  const mine = chargesFor(charges, travelerId).filter((c) => new Date(c.createdAt) >= start);

  const byKind = new Map<ChargeKind, StatementLine>();
  let settledCents = 0;
  let pendingCents = 0;

  for (const c of mine) {
    if (c.status === "failed" || c.status === "refunded") continue;
    if (c.status === "pending") pendingCents += c.amountCents;
    else settledCents += c.amountCents;

    const line = byKind.get(c.kind) ?? { kind: c.kind, label: KIND_LABEL[c.kind], count: 0, cents: 0 };
    line.count += 1;
    line.cents += c.amountCents;
    byKind.set(c.kind, line);
  }

  return {
    periodStart: start.toISOString(),
    periodEnd: now.toISOString(),
    lines: [...byKind.values()].sort((a, b) => b.cents - a.cents),
    settledCents,
    pendingCents,
    currency: mine[0]?.currency ?? "USD",
    rails: railsUsed(mine),
  };
}
