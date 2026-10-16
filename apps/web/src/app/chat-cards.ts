import type { AssistantProfile, ConciergeTask, SpendRequest } from "@safehubby/core";

/**
 * What the conversation with an assistant needs to put in front of a customer.
 *
 * Pure, so the rules for "when does a card pop up" can be tested without a
 * browser: the screen decides how things look, this decides what is worth
 * interrupting somebody for.
 */

/**
 * The questions an assistant is waiting on: purchases they have photographed
 * and asked about, which the customer has not answered yet.
 *
 * Each one is an interruption worth a card of its own. "Is this the right
 * one?" asked while somebody stands in an aisle is a question with a clock on
 * it, and burying it in a long scrolling sheet below the thread is how it
 * goes unanswered. A finished task has no questions left — an open request on
 * one is a leftover, not a prompt.
 */
export function pendingSpendRequests(task: ConciergeTask | null): SpendRequest[] {
  if (!task || task.status !== "in-progress") return [];
  return (task.spendRequests ?? []).filter((r) => r.status === "open");
}

/** The face to show for an assistant: the selfie taken for this task if there
 *  is one — it is the one that answers "is this the person at my door" — then
 *  their profile photo. Undefined means show an initial. */
export function assistantFace(assistant: AssistantProfile, task: ConciergeTask | null): string | undefined {
  const selfie = task?.identityPhotos?.assistant;
  if (selfie) return `data:${selfie.mimeType};base64,${selfie.base64}`;
  return assistant.photoUrl || undefined;
}

/** One line for the card header, and whether it is happening right now. */
export function statusLine(task: ConciergeTask | null): { label: string; live: boolean } {
  if (!task) return { label: "Review your request", live: false };
  if (task.status === "in-progress") return { label: "On the job", live: true };
  return { label: task.status === "completed" ? "Completed" : "Canceled", live: false };
}
