import type { Iso8601 } from "./types.ts";

/**
 * The half of a personal assistant's job that does not need feet.
 *
 * Booking an appointment, chasing a refund, remembering a birthday, writing
 * the email nobody wants to write. Every concierge category until now
 * involved somebody going somewhere — and so had a travel cost, a spend cap
 * and a card behind it. This work has none of that: it is done at a desk,
 * batched between jobs, and it is the thing people actually mean when they
 * say they want an assistant.
 *
 * So it is included in the subscription rather than billed. Not because it is
 * worthless — somebody is paid for their time on every one of these — but
 * because metering a two-minute phone call by the hour costs more in friction
 * than the call costs to make, and a customer who hesitates before asking is
 * a customer not using the product they are paying for.
 *
 * **Included is not unlimited, and this module says so out loud.** A real
 * person does these. An unbounded allowance is a promise the roster cannot
 * keep, and discovering that at the point of refusal is worse than a number
 * stated up front — so each plan carries a monthly count, visible before
 * anybody asks for anything.
 */

export type DeskTaskKind =
  | "appointment"
  | "reminder"
  | "message"
  | "research"
  | "paperwork";

export interface DeskTaskKindInfo {
  id: DeskTaskKind;
  label: string;
  description: string;
}

export const DESK_TASK_KINDS: DeskTaskKindInfo[] = [
  {
    id: "appointment",
    label: "Book an appointment",
    description: "A dentist, a haircut, a table, a service call — found, called, and put in your calendar.",
  },
  {
    id: "reminder",
    label: "Remind me",
    description: "Anything you would rather not carry in your head. An anniversary, a birthday, a renewal, a deadline.",
  },
  {
    id: "message",
    label: "Write or send something",
    description: "An email, a complaint, a cancellation, the reply you have been putting off for a week.",
  },
  {
    id: "research",
    label: "Look something up",
    description: "Compare the options, read the small print, and come back with an answer rather than tabs.",
  },
  {
    id: "paperwork",
    label: "Handle the admin",
    description: "A form, a refund, a dispute, an account to close — chased until it is actually done.",
  },
];

export function findDeskTaskKind(id: DeskTaskKind): DeskTaskKindInfo {
  const kind = DESK_TASK_KINDS.find((k) => k.id === id);
  if (!kind) throw new Error(`Unknown desk task: ${id}`);
  return kind;
}

/**
 * Nobody hands Safehubby their mailbox.
 *
 * "Send an email for me" has an obvious implementation that is also the worst
 * idea in this file: take the customer's password, log in as them, send as
 * them. That is a standing impersonation of somebody, held by a company they
 * met through a nightlife app, and no amount of care makes it a reasonable
 * thing to ask for — it is the same instinct this whole product refuses when
 * it issues its own card rather than borrowing the subscriber's.
 *
 * So the assistant writes, and the customer sends; or it goes out from
 * Safehubby, signed as an assistant acting on their behalf, which is a thing
 * the recipient can see and question. Slower in exactly one case — a thread
 * that has to come from the customer's own address — and worth it.
 */
export const DESK_TASK_ACCESS_RULE =
  "An assistant never signs in as you. They draft it for you to send, or it goes out from Safehubby on your behalf and says so." as const;

export const MAX_DESK_TASK_LENGTH = 500;

export function validateDeskTask(input: { kind: DeskTaskKind; note: string }): void {
  findDeskTaskKind(input.kind);
  if (!input.note.trim()) throw new Error("Say what you need, so the assistant can get on with it.");
  if (input.note.length > MAX_DESK_TASK_LENGTH) {
    throw new Error(`Keep it under ${MAX_DESK_TASK_LENGTH} characters.`);
  }
}

export type DeskTaskStatus = "open" | "done" | "cancelled";

export interface DeskTask {
  id: string;
  travelerId: string;
  kind: DeskTaskKind;
  note: string;
  status: DeskTaskStatus;
  /** Who picked it up, once somebody has. */
  assistantId?: string;
  /** What they came back with — the answer, the confirmation, the draft. */
  outcome?: string;
  createdAt: Iso8601;
  completedAt?: Iso8601;
  /**
   * Deliberately absent, and must stay absent: no `chargeId`, no `holdId`, no
   * `spendCapCents`, no card. A desk task that spends the customer's money is
   * not a desk task — it is a `book-and-buy` concierge booking, and it goes
   * through the machinery that holds and caps money rather than around it.
   */
}

/** Tasks that count against the month's allowance: the open ones and the
 *  finished ones, not the cancelled. Cancelling something nobody worked on
 *  should not cost a slot. */
export function countsTowardAllowance(task: DeskTask): boolean {
  return task.status !== "cancelled";
}

export function deskTasksUsedIn(tasks: DeskTask[], monthStart: Date, monthEnd: Date): number {
  return tasks.filter((t) => {
    if (!countsTowardAllowance(t)) return false;
    const at = new Date(t.createdAt).getTime();
    return at >= monthStart.getTime() && at < monthEnd.getTime();
  }).length;
}

/** The calendar month a moment falls in, in UTC. The allowance resets on the
 *  first, not on a rolling window from whenever somebody signed up, because a
 *  reset date a customer can predict is one they can plan around. */
export function monthBoundsFor(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export function remainingDeskTasks(allowance: number, used: number): number {
  return Math.max(0, allowance - used);
}
