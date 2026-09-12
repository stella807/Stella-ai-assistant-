/**
 * Personal concierge: a vetted, insured partner-network professional sent to
 * do one specific, bounded task — grab something from a named place, sit with
 * a friend who should not be left alone, or check on someone in person.
 *
 * This is deliberately not a hiring marketplace. Safehubby employs nobody
 * here and runs no background checks of its own — the same shape as
 * secure-transport in fulfillment.ts: a partner agreement with an
 * already-licensed, already-vetted service, reached through `ConciergePort`.
 * An open "hire a stranger" tab would put Safehubby in the business of
 * vetting people who show up to someone's door at 1am, with none of the
 * employment-law, insurance, or criminal-background infrastructure that
 * requires. That is not a feature to grow into later; it is a different
 * company, and building it half-way would be worse than not offering this at
 * all.
 *
 * The one thing this module is strict about is the spend cap. The person
 * doing the task is a stranger, however vetted, spending someone else's
 * money — so the cap the subscriber sets before dispatch is a promise, not an
 * estimate. It is held exactly, via `authorizeExactHold` in payment.ts, never
 * padded the way a ride fare's genuine uncertainty pads a normal hold.
 */

export type ConciergeCategory =
  | "grab-something"
  | "wait-with-someone"
  | "check-in-person"
  | "run-errand";

export interface ConciergeCategoryInfo {
  id: ConciergeCategory;
  label: string;
  description: string;
}

export const CONCIERGE_CATEGORIES: ConciergeCategoryInfo[] = [
  {
    id: "grab-something",
    label: "Grab something",
    description: "Pick up food, drinks, or supplies from a place you name and bring it to you.",
  },
  {
    id: "wait-with-someone",
    label: "Wait with someone",
    description: "Stay with a friend who should not be left alone until they are steady or a ride arrives.",
  },
  {
    id: "check-in-person",
    label: "Check on someone",
    description: "Go in person to see that someone is actually okay, when a call or text is not enough.",
  },
  {
    id: "run-errand",
    label: "Run an errand",
    description: "A specific, bounded task nearby.",
  },
];

/** A hard ceiling chosen by the subscriber, not a provider's estimate. */
export const CONCIERGE_MIN_CAP_CENTS = 1000;
export const CONCIERGE_MAX_CAP_CENTS = 30000;

export interface ConciergeTaskInput {
  category: ConciergeCategory;
  /** What to do, in the subscriber's own words. Shown to the assistant before they accept. */
  note: string;
  location: { lat: number; lng: number; label?: string };
  spendCapCents: number;
}

const MAX_NOTE_LENGTH = 280;

export function validateConciergeRequest(input: ConciergeTaskInput): void {
  if (!CONCIERGE_CATEGORIES.some((c) => c.id === input.category)) throw new Error("Unknown task type.");
  if (!input.note.trim()) throw new Error("Describe the task so the assistant knows what to do.");
  if (input.note.length > MAX_NOTE_LENGTH) throw new Error(`Keep the task description under ${MAX_NOTE_LENGTH} characters.`);
  if (
    !Number.isInteger(input.spendCapCents) ||
    input.spendCapCents < CONCIERGE_MIN_CAP_CENTS ||
    input.spendCapCents > CONCIERGE_MAX_CAP_CENTS
  ) {
    throw new Error(
      `Spend cap must be between $${(CONCIERGE_MIN_CAP_CENTS / 100).toFixed(0)} and $${(CONCIERGE_MAX_CAP_CENTS / 100).toFixed(0)}.`,
    );
  }
}

export function conciergeCategoryLabel(id: ConciergeCategory): string {
  return CONCIERGE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/**
 * Shown before every concierge task is dispatched, not just the first one:
 * the person being sent is a stranger, however vetted, and the whole safety
 * case rests on the subscriber understanding what they are agreeing to each
 * time, the same reasoning behind SECURE_TRANSPORT_DISCLOSURES.
 */
export const CONCIERGE_DISCLOSURES = [
  "Your assistant is an independent professional from a vetted partner network, not a Safehubby employee.",
  "Spending is capped at exactly what you set here — never more, whatever the task ends up costing.",
  "Your assistant pays with a card issued for this task alone, capped at your spend limit — never your own card.",
  "Your assistant can decline a request that is unsafe, illegal, or outside what they agreed to do.",
  "Your assistant will not enter your home. Meet outside or at a shared, public space.",
  "Your location is shared with your assistant only for the duration of this task.",
  "This is not an emergency service. In an emergency, call your local emergency number first.",
];

export type ConciergeTaskStatus = "in-progress" | "completed" | "canceled";

export interface ConciergeTask {
  id: string;
  travelerId: string;
  category: ConciergeCategory;
  note: string;
  location: { lat: number; lng: number; label?: string };
  spendCapCents: number;
  status: ConciergeTaskStatus;
  provider: string;
  /** The partner network's own id for this task, for a later cancel/status call. */
  providerTaskId?: string;
  chargeId: string;
  holdId: string;
  createdAt: string;
  completedAt?: string;
  /** What was actually spent, once known. Never above `spendCapCents`. */
  billedCents?: number;
  /** The card handed to the assistant, when one was issued — masked, and
   *  never carrying `revealUrl`. `id` is the provider's own card id, kept only
   *  so a cancel can kill the card; it is not a card number.
   *  See `CardIssuingPort` in fulfillment.ts. */
  card?: { id: string; last4: string; network: string; expMonth: number; expYear: number };
}
