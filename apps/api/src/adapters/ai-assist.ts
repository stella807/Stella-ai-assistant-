import type { AiAssistPort, AiDraftRequest, AiDraftResult } from "@safehubby/core";
import { statusFor } from "@safehubby/core";
import { llmComplete, llmConfigured, llmProviderName } from "./llm.ts";

/**
 * The assistant's own drafting help — see ai-assist.ts in core for why this
 * never reaches a customer on its own.
 *
 * Calls Claude directly when `ANTHROPIC_API_KEY` is set, or a plain
 * OpenAI-compatible endpoint when `AI_ASSIST_API_BASE` and `AI_ASSIST_API_KEY`
 * are (see llm.ts). With neither, `status.mode` stays `"handoff"` and `draft()`
 * is never called — routes.ts checks `isAutomatic(aiAssist.status)` first and
 * simply leaves the assistant to write their own note, the same as they always
 * could.
 */

const SYSTEM_PROMPT =
  "You are drafting a short message on behalf of a Safehubby personal assistant, in their own voice, to send " +
  "to their own customer. Use only the facts given as context — never invent a detail, a reason, a price, or " +
  "an apology that isn't grounded in what's given, and never mention that you are an AI. Write two or three " +
  "plain sentences, no greeting and no signature — the assistant adds those themselves before sending it.";

export const aiAssist: AiAssistPort = {
  status: statusFor(
    "ai-assist", llmProviderName("AI_ASSIST"), llmConfigured("AI_ASSIST"),
    "An ANTHROPIC_API_KEY (Claude), or an OpenAI-compatible endpoint with AI_ASSIST_API_BASE and AI_ASSIST_API_KEY. " +
    "AI_ASSIST_MODEL is optional.",
  ),

  async draft(input: AiDraftRequest): Promise<AiDraftResult> {
    const text = await llmComplete("AI_ASSIST", {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Purpose: ${input.purpose}\nContext: ${input.context}\nWhat to say: ${input.instruction}` }],
      maxTokens: 400,
    });
    return { text };
  },
};
