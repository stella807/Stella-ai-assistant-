import type { ConciergeTask } from "./concierge.ts";

/**
 * Paying assistants biweekly.
 *
 * The service fee (`concierge.ts`'s `serviceFeeFor`) is what an assistant
 * earns per task, but earning it and being paid it are two different
 * moments: a task completes the instant it's marked done, while an actual
 * bank transfer goes out on a fixed schedule, batched with everything else
 * an assistant earned in that window. This module is the domain logic for
 * that batching — what period a date falls in, and what an assistant is
 * owed for it — kept framework-agnostic so it can be tested with no
 * database, no scheduler, and no payment provider running.
 *
 * This does not change who employs the assistant. Paying a contractor on a
 * schedule is not the same thing as being their employer — Uber, DoorDash,
 * and Instacart all pay independent contractors this way — and nothing here
 * creates the withholding, benefits, or at-will-employment relationship
 * `concierge.ts`'s module doc already explains Safehubby is deliberately
 * staying out of. What moves is *when* money that was already owed actually
 * arrives, not *what kind of relationship* creates the obligation to pay it.
 */

/** A fixed 14-day window. Every assistant is paid on the same schedule,
 *  anchored to a stable date so periods never drift or depend on when this
 *  code happens to run. */
export const PAYROLL_PERIOD_DAYS = 14;

/** A Monday, chosen only to be some fixed point in the past — any anchor
 *  works, since periods are computed relative to it, not from it forward
 *  each time the server restarts. */
const PAYROLL_EPOCH_MS = Date.parse("2024-01-01T00:00:00.000Z");
const PERIOD_MS = PAYROLL_PERIOD_DAYS * 86_400_000;

export interface PayoutPeriod {
  start: Date;
  end: Date;
}

/** Which 14-day period a given instant falls into. `end` is exclusive. */
export function payoutPeriodFor(at: Date): PayoutPeriod {
  const periodIndex = Math.floor((at.getTime() - PAYROLL_EPOCH_MS) / PERIOD_MS);
  const start = new Date(PAYROLL_EPOCH_MS + periodIndex * PERIOD_MS);
  return { start, end: new Date(start.getTime() + PERIOD_MS) };
}

/** The period immediately before the one `at` falls in — the period a
 *  payroll run closes out and actually pays, since a period isn't "closed"
 *  (no more tasks can complete into it) until it has fully ended. */
export function previousPayoutPeriod(at: Date): PayoutPeriod {
  const current = payoutPeriodFor(at);
  return { start: new Date(current.start.getTime() - PERIOD_MS), end: current.start };
}

/** One task's contribution to a payout — a line item, not the payout itself. */
export interface AssistantEarning {
  taskId: string;
  completedAt: string;
  serviceFeeCents: number;
}

/**
 * What one assistant is owed for a period: every completed task assigned to
 * them, finished inside the window, that hasn't already been paid out
 * (`payoutId` unset — see `ConciergeTask`). A task completed but never paid
 * stays eligible forever, in whichever period it actually completed in, so a
 * payroll run that failed or was skipped never silently drops what someone
 * is owed.
 */
export function earningsFor(tasks: ConciergeTask[], assistantId: string, period: PayoutPeriod): AssistantEarning[] {
  const startMs = period.start.getTime();
  const endMs = period.end.getTime();
  return tasks
    .filter((t): t is ConciergeTask & { completedAt: string } =>
      t.assistantId === assistantId && t.status === "completed" && !t.payoutId && Boolean(t.completedAt))
    .filter((t) => {
      const completedMs = new Date(t.completedAt).getTime();
      return completedMs >= startMs && completedMs < endMs;
    })
    .map((t) => ({ taskId: t.id, completedAt: t.completedAt, serviceFeeCents: t.serviceFeeCents }));
}

export function totalEarningsCents(earnings: AssistantEarning[]): number {
  return earnings.reduce((sum, e) => sum + e.serviceFeeCents, 0);
}

/**
 * What an assistant has earned and not yet been paid, across every
 * completed task regardless of which period it falls in — the "how much am
 * I owed right now" figure for their own portal, distinct from a specific
 * period's payout. A task only ever leaves this total once an actual
 * payout has been sent for it (`payoutId` set).
 */
export function unpaidEarningsCents(tasks: ConciergeTask[], assistantId: string): number {
  return tasks
    .filter((t) => t.assistantId === assistantId && t.status === "completed" && !t.payoutId)
    .reduce((sum, t) => sum + t.serviceFeeCents, 0);
}

export type PayoutStatus = "pending" | "paid" | "failed";

/** One biweekly payment to one assistant — the record of what they were
 *  actually sent, not just what they earned (see `AssistantEarning` for the
 *  line items that add up to `totalCents`). */
export interface AssistantPayout {
  id: string;
  assistantId: string;
  periodStart: string;
  periodEnd: string;
  taskIds: string[];
  totalCents: number;
  status: PayoutStatus;
  createdAt: string;
  paidAt?: string;
  /** Said plainly rather than left to guesswork when a transfer fails —
   *  the same "never invent a success" rule as every other payment path. */
  failureReason?: string;
  /** The payout provider's own reference for this transfer, once sent. */
  providerReference?: string;
}

/**
 * Validated shape of the destination an assistant enters for themselves — a
 * US bank account (ACH), since the initial launch markets (Puerto Rico,
 * Texas, Los Angeles) are all served by the US ACH network. The actual
 * account number is never handled here: this only checks the shape of what
 * was typed. Storing and encrypting it is an infrastructure concern that
 * belongs in apps/api, not in this framework-agnostic package — see
 * `docs/concierge.md`.
 */
export interface PayoutDestinationInput {
  accountHolderName: string;
  routingNumber: string;
  accountNumber: string;
}

export function validatePayoutDestination(input: PayoutDestinationInput): void {
  if (!input.accountHolderName.trim()) throw new Error("Enter the name on the bank account.");
  if (!/^\d{9}$/.test(input.routingNumber)) throw new Error("Routing number must be exactly 9 digits.");
  if (!/^\d{4,17}$/.test(input.accountNumber)) throw new Error("That account number doesn't look right.");
}

/**
 * A clawback against an assistant's future pay — created when a customer's
 * dispute over a stolen or never-delivered task is upheld and refunded. The
 * loss is recovered from the assistant who didn't deliver rather than
 * absorbed by Safehubby, per policy: see `disputeConciergeTask` in
 * routes.ts, which creates one of these alongside the customer's refund.
 *
 * `remainingCents` shrinks as later payroll runs apply new earnings against
 * it (`applyAdjustments`) until it reaches zero; `totalCents` is the
 * original amount, kept for the record even once it's fully applied. There
 * is deliberately no "credit" direction here yet — only a debt an assistant
 * can owe, never a bonus this module invents on its own.
 */
export interface AssistantAdjustment {
  id: string;
  assistantId: string;
  taskId: string;
  reason: string;
  totalCents: number;
  remainingCents: number;
  createdAt: string;
}

/**
 * Applies what an assistant earned this payroll run against any outstanding
 * clawback debt before anything is actually paid out — oldest debt first,
 * so a dispute from months ago is settled before a more recent one. Pure:
 * returns what to actually pay and how much of each adjustment to consume,
 * so the caller (`runPayroll` in routes.ts) decides how to persist it
 * rather than this function reaching into a database.
 */
export function applyAdjustments(
  earnedCents: number, adjustments: AssistantAdjustment[],
): { payableCents: number; consumed: { id: string; amountCents: number }[] } {
  let remaining = earnedCents;
  const consumed: { id: string; amountCents: number }[] = [];
  const oldestFirst = [...adjustments]
    .filter((a) => a.remainingCents > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const adjustment of oldestFirst) {
    if (remaining <= 0) break;
    const amountCents = Math.min(remaining, adjustment.remainingCents);
    consumed.push({ id: adjustment.id, amountCents });
    remaining -= amountCents;
  }
  return { payableCents: remaining, consumed };
}

/** The total still owed back, across every open adjustment — what the
 *  assistant's portal shows so a clawback is never a silent surprise the
 *  next time they check their pay. */
export function outstandingClawbackCents(adjustments: AssistantAdjustment[]): number {
  return adjustments.reduce((sum, a) => sum + a.remainingCents, 0);
}
