import type { ProviderStatus } from "./fulfillment.ts";

/**
 * Drafting help for the human assistant — never a voice the customer hears
 * directly.
 *
 * Every message a customer sees on a task is the assistant's own, sent from
 * the assistant's own account: a voice note, a change note, a completion
 * note (see `DESK_TASK_ACCESS_RULE` in desk-tasks.ts for the same rule on a
 * different surface — "An assistant never signs in as you. They draft it
 * for you to send, or it goes out from Safehubby on your behalf and says
 * so."). This port does not change that. It gives the assistant a faster
 * first draft of *their own* wording — read, edited if they want, and sent
 * by them — never a message that reaches a customer on its own, and never
 * one attributed to anything but the human assistant who sent it.
 *
 * Shaped like every other integration in `fulfillment.ts`: `status` reports
 * `"automatic"` only once a real provider is configured, and `"handoff"`
 * otherwise. An assistant working where no provider is configured simply
 * writes the note themselves, exactly as they always could — the tool never
 * pretends a draft is coming and then produces nothing.
 */
export interface AiDraftRequest {
  /** What this draft is for, e.g. "explaining a substitution on a purchase" — grounds the wording in the surface it will actually be sent from. */
  purpose: string;
  /** The real facts of this task the draft must stay inside — what was asked for, what happened. The provider is told to use only this, never to invent a reason, a price, or an apology beyond it. */
  context: string;
  /** What the assistant wants said, in their own words. The draft expands this; it does not replace it or contradict it. */
  instruction: string;
}

export interface AiDraftResult {
  text: string;
}

export interface AiAssistPort {
  readonly status: ProviderStatus;
  draft(input: AiDraftRequest): Promise<AiDraftResult>;
}

/** Long enough to describe what's needed, short enough to stay a prompt rather than the note itself — the assistant still writes the note. */
export const MAX_AI_DRAFT_INSTRUCTION = 300;

export function validateAiDraftInstruction(instruction: string): string | null {
  const trimmed = instruction.trim();
  if (!trimmed) return "Say what you want the draft to cover.";
  if (trimmed.length > MAX_AI_DRAFT_INSTRUCTION) return `Keep it under ${MAX_AI_DRAFT_INSTRUCTION} characters.`;
  return null;
}
