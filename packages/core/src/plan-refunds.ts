import { PLANS, isElitePlan, type PlanId } from "./billing.ts";
import { cardFeeCents } from "./pnl.ts";

/**
 * What a plan charge gets back when the owner refunds it.
 *
 * - **Elite** (any rung) and the **Wingman Club**: the whole charge.
 * - **Premium, Premium Plus and Family**: only the card processing fee that was
 *   built into the price, not the plan charge itself.
 * - Anything else (Free, Basic): nothing.
 *
 * It is a rule about who gets what, kept in one place so the policy page, the
 * owner's refund screen and the refund itself cannot disagree.
 */
export type RefundTier = "full" | "fees" | "none";

export interface PlanRefund {
  /** Which plan the charge was for, or "wingman-club". */
  plan: PlanId | "wingman-club" | null;
  tier: RefundTier;
  /** How much goes back, in cents, never more than what is left unrefunded. */
  refundCents: number;
}

const FEE_ONLY: PlanId[] = ["premium-basic", "premium-plus", "family"];

/** Which plan a ledger line was for, read from its description (`Premium Plus (monthly) — paid through Stripe`). */
export function planOfCharge(description: string): PlanId | "wingman-club" | null {
  if (/^Wingman Club/i.test(description)) return "wingman-club";
  // Longest name first, so "Premium Plus" is not read as "Premium" and "Elite Signature" not as "Elite".
  const byLength = [...PLANS].sort((a, b) => b.name.length - a.name.length);
  return byLength.find((p) => description.startsWith(p.name))?.id ?? null;
}

export function planRefundFor(input: { description: string; amountCents: number; refundedCents?: number }): PlanRefund {
  const plan = planOfCharge(input.description);
  const left = Math.max(0, input.amountCents - (input.refundedCents ?? 0));
  if (!plan) return { plan, tier: "none", refundCents: 0 };
  if (plan === "wingman-club" || isElitePlan(plan)) return { plan, tier: "full", refundCents: left };
  if (FEE_ONLY.includes(plan)) {
    // Only the fee goes back, and only once: what was already returned counts against it.
    const feeLeft = Math.max(0, cardFeeCents(input.amountCents) - (input.refundedCents ?? 0));
    return { plan, tier: "fees", refundCents: Math.min(left, feeLeft) };
  }
  return { plan, tier: "none", refundCents: 0 };
}
