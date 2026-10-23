import { includedConciergeHours, type PlanId } from "./billing.ts";
import { isEnabled } from "./features.ts";
import {
  isHourlyCategory, isQuickTaskEligible, serviceFeeFor, type ConciergeCategory, type ConciergeTask,
} from "./concierge.ts";
import { errandFeeCents, type ErrandTierId } from "./errand-tiers.ts";

/**
 * Grabs a plan includes every month, with no service fee.
 *
 * "Grab something" is the smallest thing Safehubby does — one named thing,
 * bought and brought — and it is the one somebody alone in a hospital bed
 * needs most: a juice, a charger, a blanket. A five-dollar fee on a
 * three-dollar juice made the cheapest help we sell cost more than the thing
 * itself. So the fee is waived, and the customer pays only for what was
 * bought.
 *
 * **The runner is still paid in full.** Waiving the fee changes who pays the
 * assistant — Safehubby instead of the customer — and never what they earn.
 * Nothing here touches `assistantPayoutFor`, on purpose, and a test fails if
 * that ever changes.
 *
 * **An allowance, not unlimited**, because every included grab is the
 * runner's pay going out with nothing coming in. On the free plan, unlimited
 * would be a cost with no ceiling paid for by nobody; the allowance turns it
 * into a known number per account. `null` is no limit, for the rungs whose
 * dues dwarf it.
 *
 * Shaped like the desk-task allowance in desk-tasks.ts on purpose — same
 * calendar month (`monthBoundsFor`), same rule that a cancelled task gives
 * its slot back — so a customer who has learned how one resets has learned
 * both.
 */
export const INCLUDED_GRABS_PER_MONTH: Record<PlanId, number | null> = {
  // Sized so a plan's included grabs cost under half its dues at the $10
  // errand minimum (see errand-tiers.ts); they were 2/10/12/30 at $4.
  free: 1,
  "premium-basic": 4,
  "premium-plus": 8,
  family: 25,
  elite: null,
  "elite-signature": null,
  "elite-private": null,
};

/** The one category the allowance covers. An errand is a list and a longer
 *  trip, and keeps its rate. */
export const INCLUDED_GRAB_CATEGORY = "grab-something" satisfies ConciergeCategory;

export function includedGrabAllowanceFor(planId: PlanId): number | null {
  // Free's errands are paused (`free-errands`), and so is its allowance: a
  // grab nobody on Free can book has nothing to include. The table keeps the
  // number so turning the flag back on restores it.
  if (planId === "free" && !isEnabled("free-errands")) return 0;
  return INCLUDED_GRABS_PER_MONTH[planId];
}

/** Included grabs booked in the month, minus the cancelled: nothing was
 *  brought, so nothing was used. */
export function includedGrabsUsedIn(tasks: ConciergeTask[], monthStart: Date, monthEnd: Date): number {
  return tasks.filter((t) => {
    if (!t.feeIncluded || t.status === "canceled") return false;
    const at = new Date(t.createdAt).getTime();
    return at >= monthStart.getTime() && at < monthEnd.getTime();
  }).length;
}

/** `null` for no limit; otherwise never below zero. */
export function remainingIncludedGrabs(allowance: number | null, used: number): number | null {
  return allowance === null ? null : Math.max(0, allowance - used);
}

interface GrabInput {
  planId: PlanId;
  category: ConciergeCategory;
  quickTask?: boolean;
  /** Only the cheapest tier is included. A shopping trip is $23 of runner pay;
   *  an allowance sized for $4 grabs cannot carry it. */
  errandTier?: ErrandTierId;
  /** This month's included grabs already used — see `includedGrabsUsedIn`. */
  usedThisMonth: number;
}

/**
 * Whether this booking rides on the allowance.
 *
 * Only the quick version of a grab. A paid subscriber can book the
 * standard-rate grab instead — longer, open-ended, paid at more — and that is
 * a choice made on purpose, not the one-thing pickup this exists for.
 */
export function isGrabIncluded(input: GrabInput): boolean {
  if (input.category !== INCLUDED_GRAB_CATEGORY) return false;
  if (!(input.quickTask === true && isQuickTaskEligible(input.category))) return false;
  if (input.errandTier !== undefined && input.errandTier !== "in-building") return false;
  const remaining = remainingIncludedGrabs(includedGrabAllowanceFor(input.planId), input.usedThisMonth);
  return remaining === null || remaining > 0;
}

/**
 * What the customer pays for the assistant's time, given their plan and how
 * much of this month's allowance is used. The server charges this and the app
 * shows it, so the two cannot disagree.
 */
export function customerServiceFeeFor(
  input: GrabInput & { peopleCount?: number; hours?: number; spendCapCents?: number; hospitalStay?: boolean },
): number {
  if (isGrabIncluded(input)) return 0;
  if (input.errandTier !== undefined) return errandFeeCents(input.errandTier, input.spendCapCents ?? 0);
  return serviceFeeFor(input.category, input.quickTask, input.peopleCount ?? 1, input.hours, input.hospitalStay);
}

/** The whole hold: what may be spent, plus the fee if there is one. */
export function customerTotalCents(
  input: GrabInput & { spendCapCents: number; peopleCount?: number; hours?: number },
): number {
  return input.spendCapCents + customerServiceFeeFor(input);
}

/* ---------------------------------------------------------------------------
   Included assistant hours
   ------------------------------------------------------------------------ */

/** Included hours already used in a month, by tasks that were not canceled. */
export function includedHoursUsedIn(tasks: ConciergeTask[], monthStart: Date, monthEnd: Date): number {
  return tasks.reduce((sum, t) => {
    if (!t.includedHoursUsed || t.status === "canceled") return sum;
    const at = new Date(t.createdAt).getTime();
    return at >= monthStart.getTime() && at < monthEnd.getTime() ? sum + t.includedHoursUsed : sum;
  }, 0);
}

/**
 * How an hourly booking is paid: the hours the plan still covers this month
 * come first and cost the member nothing, and only the rest is billed — at
 * the same hourly rate, so included hours are a prepayment, never a discount.
 * The assistant is paid for every hour either way; Safehubby pays the covered
 * ones out of the subscription.
 */
export function hourlyServiceFee(input: {
  planId: PlanId; category: ConciergeCategory; quickTask?: boolean; peopleCount?: number;
  hours?: number; includedHoursUsedThisMonth: number; hospitalStay?: boolean;
}): { serviceFeeCents: number; includedHoursUsed: number } {
  const full = serviceFeeFor(input.category, input.quickTask, input.peopleCount ?? 1, input.hours, input.hospitalStay);
  if (!input.hours || !isHourlyCategory(input.category)) return { serviceFeeCents: full, includedHoursUsed: 0 };
  const left = Math.max(0, includedConciergeHours(input.planId) - input.includedHoursUsedThisMonth);
  const covered = Math.min(input.hours, left);
  return { serviceFeeCents: Math.round(full * (input.hours - covered) / input.hours), includedHoursUsed: covered };
}
