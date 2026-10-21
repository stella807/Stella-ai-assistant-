import { conciergeCategoryLabel, type ConciergeTask } from "./concierge.ts";
import type { PickupRequest } from "./ride-coordination.ts";
import { isOnRoster, type HiredAssistant } from "./roster.ts";
import { findRole } from "./staffing.ts";
import type { Iso8601 } from "./types.ts";

/**
 * What everyone on the team is doing, for the Management portal: who is on a
 * job right now, what they did recently, what they are owed, and a feed of
 * what just happened.
 *
 * Read entirely off records the app already keeps — tasks (with their lead
 * assistant and any errand runner they were handed to), purchase requests,
 * and coordinated pickups for drivers — so it cannot drift from what actually
 * happened, and nobody has to report in. It deliberately carries no customer
 * names or addresses: a task is described by what it is and the place label
 * the customer gave, which is all the portal needs to see who is busy.
 */

export type TeamMemberStatus = "on-job" | "available" | "off-roster";

export interface CurrentJob {
  id: string;
  kind: "task" | "pickup";
  what: string;
  /** For a task: whether they lead it or were handed it as the runner. */
  as?: "assistant" | "runner";
  place?: string;
  startedAt: Iso8601;
  /** A purchase is waiting on a decision. */
  purchaseWaiting?: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  status: TeamMemberStatus;
  current: CurrentJob[];
  /** Finished in the last 24 hours, and in the last 14 days (one pay period). */
  doneLastDay: number;
  doneLast14Days: number;
  /** Tasks they turned down, and finished tasks a customer disputed, in the last 14 days. */
  declined: number;
  disputed: number;
  /** Completed and not yet paid out. */
  unpaidCents: number;
  lastActiveAt?: Iso8601;
}

export type TeamEventKind =
  | "assigned" | "handed-to-runner" | "purchase-requested" | "purchase-approved" | "purchase-declined"
  | "completed" | "declined" | "canceled" | "pickup-coordinated" | "pickup-completed";

export interface TeamEvent {
  at: Iso8601;
  memberId: string;
  memberName: string;
  kind: TeamEventKind;
  what: string;
  amountCents?: number;
}

export interface TeamActivity {
  members: TeamMember[];
  /** Newest first. */
  events: TeamEvent[];
  counts: { onJob: number; available: number; offRoster: number };
}

/** A driver the app knows of — an approved driver application. */
export interface KnownDriver { id: string; name: string }

const roleLabelFor = (role: string) => {
  if (role === "driver") return "Driver";
  try { return findRole(role as Parameters<typeof findRole>[0]).label; } catch { return role; }
};

const DAY_MS = 24 * 60 * 60_000;
const EVENT_LIMIT = 60;

const later = (a: string | undefined, b: string | undefined) => (!a ? b : !b ? a : a > b ? a : b);

export function teamActivity(input: {
  assistants: HiredAssistant[];
  tasks: ConciergeTask[];
  drivers?: KnownDriver[];
  pickups?: PickupRequest[];
  now: Date;
}): TeamActivity {
  const { now } = input;
  const dayAgo = now.getTime() - DAY_MS;
  const periodAgo = now.getTime() - 14 * DAY_MS;
  const within = (iso: string | undefined, since: number) => Boolean(iso) && new Date(iso!).getTime() >= since;
  const events: TeamEvent[] = [];
  const names = new Map<string, string>();
  for (const a of input.assistants) names.set(a.id, a.name);
  for (const d of input.drivers ?? []) names.set(d.id, d.name);
  const nameOf = (id: string, fallback?: string) => names.get(id) ?? fallback ?? "Unknown";
  const push = (memberId: string, fallbackName: string | undefined, e: Omit<TeamEvent, "memberId" | "memberName">) =>
    events.push({ ...e, memberId, memberName: nameOf(memberId, fallbackName) });

  // Tasks for every assistant and runner, and the feed they produce.
  for (const t of input.tasks) {
    const what = conciergeCategoryLabel(t.category);
    if (t.assistantId) push(t.assistantId, t.assistantName, { at: t.createdAt, kind: "assigned", what });
    // The hand-off has no time of its own; it is shown at the task's start.
    if (t.runnerId) push(t.runnerId, t.runnerName, { at: t.createdAt, kind: "handed-to-runner", what });
    const doer = t.runnerId ?? t.assistantId;
    const doerName = t.runnerId ? t.runnerName : t.assistantName;
    if (doer) {
      for (const r of t.spendRequests ?? []) {
        push(doer, doerName, { at: r.createdAt, kind: "purchase-requested", what: r.note || what, amountCents: r.amountCents });
        if (r.decidedAt && r.status !== "open") {
          push(doer, doerName, {
            at: r.decidedAt, kind: r.status === "approved" ? "purchase-approved" : "purchase-declined",
            what: r.note || what, amountCents: r.amountCents,
          });
        }
      }
      if (t.status === "completed" && t.completedAt) {
        push(doer, doerName, { at: t.completedAt, kind: "completed", what, amountCents: t.billedCents });
      }
      if (t.status === "canceled") {
        push(doer, doerName, { at: t.completedAt ?? t.createdAt, kind: t.declinedByAssistant ? "declined" : "canceled", what });
      }
    }
  }

  for (const p of input.pickups ?? []) {
    if (!p.driverId || !p.coordinatedAt) continue;
    push(p.driverId, p.driverName, { at: p.coordinatedAt, kind: "pickup-coordinated", what: "Pickup" });
    if (p.status === "completed" && p.completedAt) {
      push(p.driverId, p.driverName, { at: p.completedAt, kind: "pickup-completed", what: "Pickup" });
    }
  }

  const memberFor = (id: string, name: string, role: string, onRoster: boolean): TeamMember => {
    const current: CurrentJob[] = [];
    let doneLastDay = 0;
    let doneLast14Days = 0;
    let declined = 0;
    let disputed = 0;
    let unpaidCents = 0;
    for (const t of input.tasks) {
      const lead = t.assistantId === id;
      const runner = t.runnerId === id;
      if (!lead && !runner) continue;
      const doer = (t.runnerId ?? t.assistantId) === id;
      if (t.status === "in-progress") {
        current.push({
          id: t.id, kind: "task", what: conciergeCategoryLabel(t.category), as: runner ? "runner" : "assistant",
          place: t.location.label, startedAt: t.createdAt,
          purchaseWaiting: (t.spendRequests ?? []).some((r) => r.status === "open"),
        });
      }
      if (doer && t.status === "completed") {
        if (within(t.completedAt, dayAgo)) doneLastDay += 1;
        if (within(t.completedAt, periodAgo)) doneLast14Days += 1;
        if (t.disputed && within(t.completedAt, periodAgo)) disputed += 1;
        if (!t.payoutId) unpaidCents += t.assistantPayoutCents;
      }
      if (doer && t.status === "canceled" && t.declinedByAssistant && within(t.completedAt ?? t.createdAt, periodAgo)) declined += 1;
    }
    for (const p of input.pickups ?? []) {
      if (p.driverId !== id) continue;
      if (p.status === "coordinated") {
        current.push({ id: p.id, kind: "pickup", what: "Pickup", place: p.pickup.label, startedAt: p.coordinatedAt ?? p.createdAt });
      }
      if (p.status === "completed") {
        if (within(p.completedAt, dayAgo)) doneLastDay += 1;
        if (within(p.completedAt, periodAgo)) doneLast14Days += 1;
      }
    }
    const lastActiveAt = events.filter((e) => e.memberId === id).reduce<string | undefined>((m, e) => later(m, e.at), undefined);
    return {
      id, name, role, roleLabel: roleLabelFor(role),
      status: !onRoster ? "off-roster" : current.length > 0 ? "on-job" : "available",
      current: current.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      doneLastDay, doneLast14Days, declined, disputed, unpaidCents,
      ...(lastActiveAt ? { lastActiveAt } : {}),
    };
  };

  const members = [
    ...input.assistants.map((a) => memberFor(a.id, a.name, a.role, isOnRoster(a, now))),
    ...(input.drivers ?? []).map((d) => memberFor(d.id, d.name, "driver", true)),
  ];
  // Busy first, then available, then people no longer on the roster; within
  // each, whoever was active most recently.
  const rank: Record<TeamMemberStatus, number> = { "on-job": 0, available: 1, "off-roster": 2 };
  members.sort((a, b) => rank[a.status] - rank[b.status] || (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "") || a.name.localeCompare(b.name));

  return {
    members,
    events: events.filter((e) => new Date(e.at).getTime() <= now.getTime())
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, EVENT_LIMIT),
    counts: {
      onJob: members.filter((m) => m.status === "on-job").length,
      available: members.filter((m) => m.status === "available").length,
      offRoster: members.filter((m) => m.status === "off-roster").length,
    },
  };
}
