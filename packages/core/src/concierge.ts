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
 * `assistantPayoutFor` below: a second, separate amount from the spend cap,
 * paid to them in full by `payroll.ts`.
 *
 * Safehubby's own cut is a third number, and it sits on top of that payout
 * rather than inside it — the customer-facing `serviceFeeFor` is the payout
 * grossed up by `CONCIERGE_FEE_MARGIN`. Keeping the margin outside the
 * payout is what makes "raise the margin" a decision about what customers
 * pay instead of a silent pay cut for the person doing the work.
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
 * Real-world reference: BLS's 2024 median for personal/executive assistants
 * is roughly $45-50k/year in traditional employment, and gig-platform task
 * rates (TaskRabbit, Wonolo, and similar) commonly land in the $20-35/hour
 * range for comparable short, bounded, in-person work. These land in that
 * same range for a task of the stated typical length
 * (`CONCIERGE_TASK_MINUTES`), not a full-time salary — a task is minutes,
 * not a shift.
 *
 * This is the assistant's number, and it is exactly what `payroll.ts` pays
 * out — `earningsFor` reads `assistantPayoutCents` off the task, which is
 * set from this schedule. Safehubby's margin is added *on top* to produce
 * the customer-facing fee (`serviceFeeFor`), never deducted from here.
 */
export const CONCIERGE_ASSISTANT_PAYOUT_CENTS: Record<ConciergeCategory, number> = {
  "grab-something": 900, // ~15-20 min round trip
  // A dollar above grabbing one named thing, on purpose: an errand is
  // open-scoped within the trip — a grocery run means a list, aisles, and
  // choices to make, not one counter to collect from.
  "run-errand": 1000,
  "check-in-person": 1200, // getting there and actually assessing someone takes longer
  "wait-with-someone": 1800, // open-ended by nature; priced for a first ~30-45 min block
};

/**
 * Safehubby's margin, as a share of the customer-facing service fee.
 *
 * Applied for real by `serviceFeeFor`, which grosses the assistant's payout
 * up by it: the customer pays `payout / (1 - margin)`, the assistant
 * receives the payout, and the difference is Safehubby's. It is deliberately
 * not a deduction from the payout — that schedule is pinned to real-world
 * gig rates, and taking the margin out of it would mean every future margin
 * change quietly repriced somebody's labour. So a margin rise raises what
 * the customer pays; it never lowers what the assistant earns.
 */
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

export const QUICK_TASK_ASSISTANT_PAYOUT_CENTS: Partial<Record<ConciergeCategory, number>> = {
  "grab-something": 500,
  "run-errand": 500,
};

export const QUICK_TASK_MAX_CAP_CENTS = 5000;

export function isQuickTaskEligible(category: ConciergeCategory): boolean {
  return QUICK_TASK_CATEGORIES.includes(category);
}

/**
 * How much each person beyond the first adds to the assistant's payout, as a
 * share of the one-person rate.
 *
 * Looking after a household of six is more work than looking after one
 * person — more to carry, more orders to get right, more people to keep an
 * eye on — so a flat rate would underpay the bigger job. But it is not six
 * times the work either: it is still one trip to one place, and a linear
 * multiplier would overcharge a family for what is mostly the same errand.
 * So the first person is the full rate and each additional one adds a
 * quarter of it — sublinear on purpose, and the one number to change if real
 * assistants report that big households are harder than this assumes.
 *
 * `PLAN_SEATS` is the ceiling on who can be counted: `apps/api` clamps a
 * task's `peopleCount` to the seats on the subscriber's plan, so a two-seat
 * Premium plan cannot book a six-person task.
 */
export const HOUSEHOLD_INCREMENT = 0.25;

/** The most people one task can cover, matching the largest plan's seats
 *  (`billing.ts`). Kept here rather than imported so this module stays free
 *  of the plan catalogue; the API clamps to the subscriber's own plan, which
 *  may be smaller. */
export const MAX_PEOPLE_PER_TASK = 6;

/** The multiplier applied to a one-person rate for a task covering
 *  `peopleCount` people. 1 person → 1.0, 2 → 1.25, 6 → 2.25. */
export function householdMultiplier(peopleCount = 1): number {
  const people = Math.max(1, Math.min(Math.floor(peopleCount), MAX_PEOPLE_PER_TASK));
  return 1 + HOUSEHOLD_INCREMENT * (people - 1);
}

/** What the assistant earns for one task of this kind, for this many people.
 *  Paid out in full — see `CONCIERGE_ASSISTANT_PAYOUT_CENTS`. */
export function assistantPayoutFor(
  category: ConciergeCategory, quickTask?: boolean, peopleCount = 1,
): number {
  const base = quickTask && isQuickTaskEligible(category)
    ? QUICK_TASK_ASSISTANT_PAYOUT_CENTS[category]!
    : CONCIERGE_ASSISTANT_PAYOUT_CENTS[category];
  return Math.round(base * householdMultiplier(peopleCount));
}

/** What the customer pays for the assistant's time: their payout grossed up
 *  so `CONCIERGE_FEE_MARGIN` is a share of this fee rather than a cut taken
 *  out of their pay. */
export function serviceFeeFor(
  category: ConciergeCategory, quickTask?: boolean, peopleCount = 1,
): number {
  return Math.round(assistantPayoutFor(category, quickTask, peopleCount) / (1 - CONCIERGE_FEE_MARGIN));
}

/** Safehubby's cut of one task — the gap between what the customer pays for
 *  the assistant's time and what the assistant receives. */
export function conciergeMarginCents(
  category: ConciergeCategory, quickTask?: boolean, peopleCount = 1,
): number {
  return serviceFeeFor(category, quickTask, peopleCount)
    - assistantPayoutFor(category, quickTask, peopleCount);
}

/** What actually gets held/charged: the reimbursable spend cap plus the
 *  service fee. Both are exact — see `authorizeExactHold` in payment.ts —
 *  so this is a sum, never a padded estimate. */
export function totalChargeCents(
  category: ConciergeCategory, spendCapCents: number, quickTask?: boolean, peopleCount = 1,
): number {
  return spendCapCents + serviceFeeFor(category, quickTask, peopleCount);
}

/**
 * Typical minutes a task of this category actually takes — the same
 * estimate `CONCIERGE_ASSISTANT_PAYOUT_CENTS`'s comment already states in prose,
 * pulled out here so it can be computed with rather than just read. This is
 * an assumption stated plainly, not a measurement: there is no real
 * time-tracking in this prototype, so an hourly-equivalent rate is only ever
 * as honest as this number is.
 */
export const CONCIERGE_TASK_MINUTES: Record<ConciergeCategory, number> = {
  "grab-something": 18,
  "run-errand": 18,
  "check-in-person": 25,
  "wait-with-someone": 40,
};

/** The assistant's per-task *payout* expressed as an hourly-equivalent rate,
 *  using `CONCIERGE_TASK_MINUTES`'s stated typical duration — reference
 *  information for the assistant portal's pay table, not a real hourly wage:
 *  a task is paid per task, never metered by the minute.
 *
 *  Built on the payout rather than the customer-facing fee on purpose. The
 *  portal presents this as what an assistant earns, so quoting the grossed-up
 *  fee here would overstate their take by the margin. */
export function hourlyRateCentsFor(category: ConciergeCategory, quickTask?: boolean): number {
  return Math.round(assistantPayoutFor(category, quickTask) / (CONCIERGE_TASK_MINUTES[category] / 60));
}

/** A reasonable ceiling for the "how many of these a week" calculator below —
 *  above this, a category stops being a bounded task and starts being a job,
 *  which is exactly the line this module's own doc says Safehubby does not
 *  cross. */
export const MAX_TASKS_PER_WEEK_ESTIMATE = 20;

/**
 * What steady, recurring work in one category could add up to over a year,
 * *if* a customer keeps sending tasks at the given weekly rate — a
 * transparent calculator for the assistant portal's pay table, not a
 * contract or a commitment either side has made. Nothing about booking a
 * single task changes because of this number; it exists only so an
 * assistant (or the published rate card) can answer "what could this be
 * worth over a year" with real math instead of a guess, using the actual
 * per-task fee rather than an invented salary figure.
 */
export function annualEstimateCentsFor(category: ConciergeCategory, tasksPerWeek: number, quickTask?: boolean): number {
  const perWeek = Math.max(0, Math.min(tasksPerWeek, MAX_TASKS_PER_WEEK_ESTIMATE));
  // The payout, not the customer's fee — same reasoning as `hourlyRateCentsFor`.
  return assistantPayoutFor(category, quickTask) * perWeek * 52;
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
  /** How many people this task is actually for — one person, or a whole
   *  household. Scales what the assistant is paid (`householdMultiplier`),
   *  since looking after six is more work than looking after one. Defaults
   *  to 1. The API clamps this to the seats on the subscriber's plan, so it
   *  is bounded by what they pay for, not by what they type. */
  peopleCount?: number;
}

const MAX_NOTE_LENGTH = 280;

export function validateConciergeRequest(input: ConciergeTaskInput): void {
  if (!CONCIERGE_CATEGORIES.some((c) => c.id === input.category)) throw new Error("Unknown task type.");
  if (!input.note.trim()) throw new Error("Describe the task so the assistant knows what to do.");
  if (input.note.length > MAX_NOTE_LENGTH) throw new Error(`Keep the task description under ${MAX_NOTE_LENGTH} characters.`);
  if (input.quickTask && !isQuickTaskEligible(input.category)) {
    throw new Error(`${conciergeCategoryLabel(input.category)} isn't eligible for the quick-task discount.`);
  }
  if (input.peopleCount !== undefined) {
    if (!Number.isInteger(input.peopleCount) || input.peopleCount < 1 || input.peopleCount > MAX_PEOPLE_PER_TASK) {
      throw new Error(`A task can cover between 1 and ${MAX_PEOPLE_PER_TASK} people.`);
    }
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

const MAX_DISPUTE_REASON_LENGTH = 280;

/** What a customer has to say before a dispute is upheld and refunded — see
 *  `disputeConciergeTask` in routes.ts. Kept to the same shape as
 *  `validateConciergeRequest`'s note check: a real explanation, not a blank
 *  claim, but no attempt here to judge whether the claim is true — that is
 *  a review-process question, not a string-validation one. */
export function validateDisputeReason(reason: string): void {
  if (!reason.trim()) throw new Error("Describe what happened so this can be reviewed.");
  if (reason.length > MAX_DISPUTE_REASON_LENGTH) {
    throw new Error(`Keep the explanation under ${MAX_DISPUTE_REASON_LENGTH} characters.`);
  }
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
  "A separate service fee pays your assistant for their time — shown before you send the request, on top of the spend cap. Quick, single-purpose tasks qualify for a lower fee.",
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
  /** What the customer pays for the assistant's time — see `serviceFeeFor`.
   *  Held and charged alongside the spend cap, never as a separate
   *  transaction. Includes Safehubby's margin, so it is larger than
   *  `assistantPayoutCents`; the two are stored separately rather than
   *  derived from each other so a past task's numbers stay true even if the
   *  rate card or the margin changes later. */
  serviceFeeCents: number;
  /** What the assistant earns from this task — see `assistantPayoutFor`.
   *  This, not `serviceFeeCents`, is what `payroll.ts` pays out. */
  assistantPayoutCents: number;
  /** How many people this task covered, which is what scaled the two
   *  amounts above — kept on the task so a past payout stays explainable
   *  after the rate card or the household increment changes. */
  peopleCount: number;
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
  /** The assistant's own photo of the actual delivered item or completed
   *  service — the burger handed over, the friend checked on, the errand
   *  actually run — attached when they mark the task done. Separate from
   *  the identity selfies above: those confirm *who* met whom; this confirms
   *  *what* happened. Optional, the same as the selfies, and validated the
   *  same way (`validateIdentityPhoto` doesn't care what the photo is of). */
  completionPhoto?: IdentityPhoto;
  /** Set once a customer's dispute over this task (never delivered, or the
   *  assistant kept the money) has been upheld and refunded — see
   *  `disputeConciergeTask` in routes.ts. `refundedCents` is what came back
   *  to the customer; the same amount becomes an `AssistantAdjustment`
   *  against that assistant's future pay, per policy: the loss is recovered
   *  from the assistant who didn't deliver, not absorbed by Safehubby. */
  disputed?: boolean;
  disputeReason?: string;
  refundedCents?: number;
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
  /** Set once this task's service fee has been included in a biweekly
   *  payout — see `payroll.ts`. A completed task with no `payoutId` is money
   *  still owed to the assistant; this is what stops the same task from
   *  being paid out twice across two payroll runs. */
  payoutId?: string;
}

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
