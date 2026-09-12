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
 *
 * A subscriber can browse the partner network's roster (`AssistantProfile`)
 * and request a specific person rather than leave assignment entirely to the
 * network — a real staffing agency can expose that without Safehubby taking
 * on any of the vetting or employment relationship itself. Each profile's
 * capacity (1-3 customers at once) is the assistant's own stated comfort
 * level, reported to and enforced by the partner network, not a number
 * Safehubby sets or checks.
 *
 * The spend cap is not the assistant's pay. It is what they are reimbursed
 * for buying on the subscriber's behalf — the burger, the supplies — and it
 * passes through to them at cost, the same as a ride fare passes through to a
 * driver. What actually compensates an assistant for their time is
 * `serviceFeeFor` below: a second, separate amount, charged on top of the
 * spend cap, that flows to the partner network (who pays their own people —
 * still not Safehubby's payroll) with a margin kept on the way, the same
 * shape as the markup already built into ride and delivery pricing.
 */

import { approximateDecodedBytes } from "./voice-messages.ts";

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

/**
 * What compensates the assistant for their time, per task — see the module
 * doc for why this is separate from the spend cap. Set per category rather
 * than as one flat number because the categories are not the same amount of
 * work: fetching something is minutes; sitting with someone until they are
 * steady can be most of an hour. These are a published rate card, not a
 * quote from the partner network — there is no real-time "labor pricing" API
 * to defer to the way a ride fare defers to Uber, so a fixed, disclosed
 * schedule is the honest choice over pretending to compute one from nothing.
 *
 * Of each fee, a majority is the payout the partner network passes to the
 * assistant who did the work; the remainder is Safehubby's margin on it,
 * `CONCIERGE_FEE_MARGIN` — stated so nobody has to reverse-engineer where a
 * number came from. Real-world reference for the payout side: BLS's 2024
 * median for personal/executive assistants is roughly $45-50k/year in
 * traditional employment, and gig-platform task rates (TaskRabbit, Wonolo,
 * and similar) commonly land in the $20-35/hour range for comparable
 * short, bounded, in-person work — these fees were set to land assistant
 * payouts in that same range for a task of the stated typical length, not to
 * approximate a full-time salary, since a task is minutes, not a shift.
 */
export const CONCIERGE_SERVICE_FEE_CENTS: Record<ConciergeCategory, number> = {
  "grab-something": 900, // ~15-20 min round trip
  "run-errand": 900,
  "check-in-person": 1200, // getting there and actually assessing someone takes longer
  "wait-with-someone": 1800, // open-ended by nature; priced for a first ~30-45 min block
};

/** The share of each service fee that is Safehubby's margin rather than the
 *  assistant's payout, via the partner network. Not applied per line anywhere
 *  in code — captured here as the number the fee schedule above was set
 *  against, so pricing stays traceable rather than arbitrary. */
export const CONCIERGE_FEE_MARGIN = 0.2;

/**
 * "Quick task" is a discounted tier for the categories that are genuinely
 * short and single-purpose — grabbing one named thing or running one
 * specific errand — not the categories that involve open-ended time with a
 * person (`wait-with-someone`, `check-in-person`), where a discount would
 * just mean underpaying an assistant for the same real time commitment.
 * Paired with a lower spend cap so "quick and simple" stays true rather than
 * becoming a way to book a large purchase at a discounted fee.
 */
export const QUICK_TASK_CATEGORIES: ConciergeCategory[] = ["grab-something", "run-errand"];

export const QUICK_TASK_SERVICE_FEE_CENTS: Partial<Record<ConciergeCategory, number>> = {
  "grab-something": 500,
  "run-errand": 500,
};

export const QUICK_TASK_MAX_CAP_CENTS = 5000;

export function isQuickTaskEligible(category: ConciergeCategory): boolean {
  return QUICK_TASK_CATEGORIES.includes(category);
}

export function serviceFeeFor(category: ConciergeCategory, quickTask?: boolean): number {
  if (quickTask && isQuickTaskEligible(category)) return QUICK_TASK_SERVICE_FEE_CENTS[category]!;
  return CONCIERGE_SERVICE_FEE_CENTS[category];
}

/** What actually gets held/charged: the reimbursable spend cap plus the
 *  service fee. Both are exact — see `authorizeExactHold` in payment.ts —
 *  so this is a sum, never a padded estimate. */
export function totalChargeCents(category: ConciergeCategory, spendCapCents: number, quickTask?: boolean): number {
  return spendCapCents + serviceFeeFor(category, quickTask);
}

export interface ConciergeTaskInput {
  category: ConciergeCategory;
  /** What to do, in the subscriber's own words. Shown to the assistant before they accept. */
  note: string;
  location: { lat: number; lng: number; label?: string };
  spendCapCents: number;
  /** Opt into the discounted fee for a short, single-purpose task — see
   *  `QUICK_TASK_CATEGORIES`. Ignored (never silently upgraded) for a
   *  category it does not apply to; `validateConciergeRequest` rejects that
   *  combination outright instead. */
  quickTask?: boolean;
}

const MAX_NOTE_LENGTH = 280;

export function validateConciergeRequest(input: ConciergeTaskInput): void {
  if (!CONCIERGE_CATEGORIES.some((c) => c.id === input.category)) throw new Error("Unknown task type.");
  if (!input.note.trim()) throw new Error("Describe the task so the assistant knows what to do.");
  if (input.note.length > MAX_NOTE_LENGTH) throw new Error(`Keep the task description under ${MAX_NOTE_LENGTH} characters.`);
  if (input.quickTask && !isQuickTaskEligible(input.category)) {
    throw new Error(`${conciergeCategoryLabel(input.category)} isn't eligible for the quick-task discount.`);
  }
  const maxCap = input.quickTask ? QUICK_TASK_MAX_CAP_CENTS : CONCIERGE_MAX_CAP_CENTS;
  if (
    !Number.isInteger(input.spendCapCents) ||
    input.spendCapCents < CONCIERGE_MIN_CAP_CENTS ||
    input.spendCapCents > maxCap
  ) {
    throw new Error(
      `Spend cap must be between $${(CONCIERGE_MIN_CAP_CENTS / 100).toFixed(0)} and $${(maxCap / 100).toFixed(0)}${input.quickTask ? " for a quick task" : ""}.`,
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
  "A separate service fee pays your assistant for their time, on top of the spend cap — the total held is shown before you send the request. Quick, single-purpose tasks qualify for a lower fee.",
  "Your assistant pays with a card issued for this task alone, capped at your spend limit — never your own card.",
  "Your assistant can decline a request that is unsafe, illegal, or outside what they agreed to do.",
  "Your assistant will not enter your home. Meet outside or at a shared, public space.",
  "A selfie from each of you is shared with the other, so you can each confirm who you're meeting.",
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
  /** What pays the assistant for their time — see `serviceFeeFor`. Held and
   *  charged alongside the spend cap, never as a separate transaction. */
  serviceFeeCents: number;
  /** Whether this booked at the discounted quick-task fee — kept on the task
   *  itself (not re-derived from category) so history stays accurate even if
   *  the eligible-category list changes later. */
  quickTask?: boolean;
  status: ConciergeTaskStatus;
  provider: string;
  /** The partner network's own id for this task, for a later cancel/status call. */
  providerTaskId?: string;
  /** Which assistant this was requested for, when the subscriber picked one
   *  from the roster rather than leaving assignment to the network. */
  assistantId?: string;
  /** Their display name, from the partner network's own booking confirmation
   *  — kept so a reopened task can show who it is without a second lookup. */
  assistantName?: string;
  /** A selfie from each side, so each can confirm who they are meeting —
   *  see `validateIdentityPhoto`. Neither is required to book or to work a
   *  task; a missing one just means that side skipped it. */
  identityPhotos?: { traveler?: IdentityPhoto; assistant?: IdentityPhoto };
  chargeId: string;
  holdId: string;
  createdAt: string;
  completedAt?: string;
  /** What was actually spent on the reimbursable purchase, once known. Never
   *  above `spendCapCents` — separate from `serviceFeeCents`, which is owed
   *  in full regardless of what the purchase itself came to. */
  billedCents?: number;
  /** How the task ended on the assistant's side, when it wasn't completed —
   *  distinct from a subscriber-initiated cancel. */
  declinedByAssistant?: boolean;
  /** The card handed to the assistant, when one was issued — masked, and
   *  never carrying `revealUrl`. `id` is the provider's own card id, kept only
   *  so a cancel can kill the card; it is not a card number.
   *  See `CardIssuingPort` in fulfillment.ts. */
  card?: { id: string; last4: string; network: string; expMonth: number; expYear: number };
}

/**
 * What the customer-facing API and UI actually work with: a `ConciergeTask`
 * with the assistant's pay stripped out and replaced by the one number a
 * customer needs — the total already held on their card. See
 * `travelerFacingTask` in apps/api/src/routes.ts, which builds this from the
 * real task. The assistant portal still gets the full `ConciergeTask`,
 * `serviceFeeCents` included — this type exists only for the traveler side.
 */
export type TravelerConciergeTask = Omit<ConciergeTask, "serviceFeeCents"> & { totalHeldCents: number };

/** A single selfie, captured on the fly for this meetup — not a persistent
 *  profile photo. See `validateIdentityPhoto`. */
export interface IdentityPhoto {
  base64: string;
  mimeType: string;
  capturedAt: string;
}

/** Comfortably covers a phone-camera selfie at a reasonable compression,
 *  bounded the same way voice clips are — see voice-messages.ts for why this
 *  prototype's storage cannot hold much more than that per item. */
export const MAX_PHOTO_BYTES = 1_500_000;

export function validateIdentityPhoto(input: { base64: string; mimeType: string }): void {
  if (!input.base64.trim()) throw new Error("No photo was captured.");
  if (!input.mimeType.startsWith("image/")) throw new Error("That doesn't look like a photo.");
  if (approximateDecodedBytes(input.base64) > MAX_PHOTO_BYTES) {
    throw new Error("That photo is too large. Try again with the front camera at normal quality.");
  }
}

/**
 * A specific assistant from the partner network's roster, browsable before
 * booking rather than left entirely to their dispatch. Staffing, vetting and
 * this capacity number are still the partner's own decisions, not
 * Safehubby's — the same "booking layer, not an employer" boundary the module
 * doc above draws. `maxConcurrentCustomers` is what the assistant told the
 * partner network they are comfortable handling at once when they joined it;
 * Safehubby just displays it and never overrides it.
 */
export const ASSISTANT_MIN_CAPACITY = 1;
export const ASSISTANT_MAX_CAPACITY = 3;

export interface AssistantProfile {
  id: string;
  name: string;
  bio?: string;
  photoUrl?: string;
  /** Task types this assistant takes. A profile with none for the requested
   *  category should not be offered for it. */
  categories: ConciergeCategory[];
  /** How many customers they are comfortable handling at once — bounded
   *  1-3, see ASSISTANT_MIN_CAPACITY/ASSISTANT_MAX_CAPACITY. */
  maxConcurrentCustomers: number;
  /** How many they are currently handling, per the partner network. */
  currentCustomers: number;
}

export function isAssistantAvailable(profile: AssistantProfile): boolean {
  return profile.currentCustomers < profile.maxConcurrentCustomers;
}

/** What to show under a name in the roster — never just a raw number with no
 *  context, since "2" alone answers nothing. */
export function describeAssistantCapacity(profile: AssistantProfile): string {
  if (!isAssistantAvailable(profile)) return "At capacity right now";
  const left = profile.maxConcurrentCustomers - profile.currentCustomers;
  return `Comfortable with up to ${profile.maxConcurrentCustomers} at once — room for ${left} more`;
}
