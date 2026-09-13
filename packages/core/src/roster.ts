import type { Iso8601 } from "./types.ts";
import type { LaunchMarketId } from "./service-area.ts";
import type { StaffRole } from "./staffing.ts";
import {
  ASSISTANT_MAX_CAPACITY, ASSISTANT_MIN_CAPACITY, QUICK_TASK_CATEGORIES,
  type ConciergeCategory,
} from "./concierge.ts";

/**
 * Safehubby's own people, and what each of them is allowed to be sent to do.
 *
 * This module exists because of a hole between two halves that were each
 * built properly and never joined up: applications could be taken and
 * approved, and tasks could be dispatched — but dispatch only ever read the
 * partner network's roster, so **somebody hired through the app could never
 * be sent to a job.** The staffing budget planned for nine field workers who
 * had no way to appear in front of a customer.
 *
 * An approved application becomes a roster member here, and nowhere else.
 * The one-way door is deliberate: `hireFromApplication` refuses anything not
 * already approved, so "hired" can never run ahead of "reviewed" — the same
 * rule `application-review.ts` enforces one step earlier.
 */

/**
 * What each role may be dispatched to.
 *
 * The important line is between the two errand categories and the two that
 * put someone beside a person who is not okay. **Waiting with someone and
 * checking on someone are personal-assistant work**, and not because they
 * take longer: an errand runner is hired to fetch a thing, and the moment
 * the job is "sit with a stranger who has had too much and decide whether
 * they need an ambulance", it is a different job with a different duty of
 * care. Sending the cheapest available person to it would be the most
 * consequential shortcut in this codebase.
 *
 * Secretaries, social media managers and drivers take no concierge tasks at
 * all — different jobs, with their own pay in `driver-pay.ts` and
 * `staffing.ts`. The compiler enforces that: `ROLE_CATEGORIES` is keyed by
 * `StaffRole`, so adding a role without deciding what it may be sent to is
 * a build error rather than an empty default.
 */
export const ROLE_CATEGORIES: Record<StaffRole, ConciergeCategory[]> = {
  "personal-assistant": ["grab-something", "run-errand", "check-in-person", "wait-with-someone"],
  "errand-runner": [...QUICK_TASK_CATEGORIES],
  secretary: [],
  driver: [],
  "social-media-manager": [],
};

export function categoriesForRole(role: StaffRole): ConciergeCategory[] {
  return ROLE_CATEGORIES[role] ?? [];
}

/** Whether this role may be sent to this kind of task at all. */
export function roleCovers(role: StaffRole, category: ConciergeCategory): boolean {
  return categoriesForRole(role).includes(category);
}

/** Roles that actually go out to customers, as opposed to driving or running
 *  the office. */
export function isFieldRole(role: StaffRole): boolean {
  return categoriesForRole(role).length > 0;
}

export interface HiredAssistant {
  id: string;
  /** The application they were hired from, so the paperwork is traceable
   *  back to what they consented to and what was checked. */
  applicationId: string;
  name: string;
  role: StaffRole;
  /** Which market they work, which is also the pay band their tasks are
   *  priced against — see market-pay.ts. */
  market: LaunchMarketId;
  categories: ConciergeCategory[];
  /** How many customers at once, their own stated comfort level. */
  maxConcurrentCustomers: number;
  hiredAt: Iso8601;
  /** Shown to a subscriber choosing who comes to them. Self-reported and
   *  optional — see `AssistantProfile` in concierge.ts for why these are
   *  displayed rather than filtered on. */
  photoUrl?: string;
  yearsExperience?: number;
  gender?: string;
  age?: number;
  /** Cleared when someone leaves or is stood down. The record stays —
   *  a past assistant is still attached to the tasks they worked. */
  activeUntil?: Iso8601;
  bio?: string;
}

export function isOnRoster(assistant: HiredAssistant, now: Date): boolean {
  if (!assistant.activeUntil) return true;
  return now.getTime() < new Date(assistant.activeUntil).getTime();
}

export interface HireInput {
  id: string;
  application: {
    id: string;
    role: StaffRole;
    fullName: string;
    status: string;
    hoursPerWeek: number;
  };
  market: LaunchMarketId;
  maxConcurrentCustomers?: number;
  bio?: string;
  photoUrl?: string;
  yearsExperience?: number;
  gender?: string;
  age?: number;
  now: Date;
}

/**
 * Turns an approved application into somebody who can actually be sent to a
 * job.
 *
 * Refuses on anything but `approved`, and refuses a role that takes no
 * concierge work — a secretary belongs on payroll, not on a dispatch roster,
 * and putting one there would offer a customer somebody who was never vetted
 * for going to an address.
 */
export function hireFromApplication(input: HireInput): HiredAssistant {
  const { application: app } = input;
  if (app.status !== "approved") {
    throw new Error("Only an approved application can be hired — review it first.");
  }
  if (!isFieldRole(app.role)) {
    throw new Error(`A ${app.role} does not take concierge tasks, so there is no roster to add them to.`);
  }

  const capacity = input.maxConcurrentCustomers ?? ASSISTANT_MIN_CAPACITY;
  if (!Number.isInteger(capacity) || capacity < ASSISTANT_MIN_CAPACITY || capacity > ASSISTANT_MAX_CAPACITY) {
    throw new Error(`Capacity must be between ${ASSISTANT_MIN_CAPACITY} and ${ASSISTANT_MAX_CAPACITY} customers at once.`);
  }

  return {
    id: input.id,
    applicationId: app.id,
    name: app.fullName,
    role: app.role,
    market: input.market,
    categories: categoriesForRole(app.role),
    maxConcurrentCustomers: capacity,
    hiredAt: input.now.toISOString(),
    bio: input.bio?.trim() || undefined,
    photoUrl: input.photoUrl?.trim() || undefined,
    yearsExperience: Number.isFinite(input.yearsExperience) ? input.yearsExperience : undefined,
    gender: input.gender?.trim() || undefined,
    age: Number.isFinite(input.age) ? input.age : undefined,
  };
}

/**
 * Who can be offered for this task, right now.
 *
 * Filters on the three things that make an offer real rather than plausible:
 * they are still on the roster, they work this market, and their role covers
 * this category. Capacity is applied separately by `isAssistantAvailable`,
 * which needs the live task count.
 */
export function rosterFor(
  assistants: HiredAssistant[],
  input: { category: ConciergeCategory; market: LaunchMarketId; now: Date },
): HiredAssistant[] {
  return assistants.filter((a) =>
    isOnRoster(a, input.now)
    && a.market === input.market
    && a.categories.includes(input.category));
}

/** Stands someone down without deleting them — they are still attached to
 *  every task they worked, and to the pay owed for it. */
export function standDown(assistant: HiredAssistant, now: Date): HiredAssistant {
  return { ...assistant, activeUntil: now.toISOString() };
}
