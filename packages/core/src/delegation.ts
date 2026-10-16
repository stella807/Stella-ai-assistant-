import type { ConciergeTask } from "./concierge.ts";
import type { LaunchMarketId } from "./service-area.ts";
import type { StaffRole } from "./staffing.ts";

/**
 * The customer deals with one assistant. That assistant, on the customer's
 * behalf, can hand a small errand — a juice, a charger, a pharmacy line — to
 * an errand runner and stay the person the customer talks to. The runner does
 * the legwork, is paid for it, and answers for the receipts; the customer
 * never has to choose, brief or chase a second person.
 *
 * Only what a runner is dispatched for can be handed over (`ROLE_CATEGORIES`):
 * sitting with someone who is not okay stays with the assistant they chose.
 */

export interface DelegationRunner {
  id: string;
  role: StaffRole;
  market: LaunchMarketId;
  maxConcurrentCustomers: number;
  categories: ConciergeTask["category"][];
}

/** Whoever is actually doing the work, and so who is paid and who answers
 *  for the spend: the runner if the task was handed over, else the assistant. */
export function whoDoesTheWork(task: Pick<ConciergeTask, "assistantId" | "runnerId">): string | undefined {
  return task.runnerId ?? task.assistantId;
}

export function runnerOf(task: Pick<ConciergeTask, "runnerId" | "runnerName">): { id: string; name?: string } | null {
  return task.runnerId ? { id: task.runnerId, ...(task.runnerName ? { name: task.runnerName } : {}) } : null;
}

export function canDelegateTo(
  runner: DelegationRunner,
  task: ConciergeTask,
  ctx: {
    assistantMarket: LaunchMarketId;
    now: Date;
    activeTasksFor: (runnerId: string) => number;
    onRoster: (runnerId: string, now: Date) => boolean;
  },
): { ok: true } | { ok: false; reason: string } {
  if (task.status !== "in-progress") return { ok: false, reason: `This task is already ${task.status}.` };
  if (runner.role !== "errand-runner") return { ok: false, reason: "Only an errand runner can take a task handed over." };
  if (runner.id === task.assistantId) return { ok: false, reason: "That is the assistant already on this task." };
  if (!runner.categories.includes(task.category)) {
    return { ok: false, reason: "An errand runner is not sent to that kind of task." };
  }
  if (!ctx.onRoster(runner.id, ctx.now)) return { ok: false, reason: "That runner is not on the roster right now." };
  if (runner.market !== ctx.assistantMarket) return { ok: false, reason: "That runner works a different market." };
  if (ctx.activeTasksFor(runner.id) >= runner.maxConcurrentCustomers) {
    return { ok: false, reason: "That runner is at capacity." };
  }
  return { ok: true };
}
