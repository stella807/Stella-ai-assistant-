import type { AiAssistPort, AiDraftRequest, AiDraftResult } from "@safehubby/core";
import { statusFor } from "@safehubby/core";
import { postJson } from "./fulfillment.ts";

/**
 * The assistant's own drafting help — see ai-assist.ts for why this never
 * reaches a customer on its own.
 *
 * Written against a plain OpenAI-compatible chat-completions endpoint
 * (`POST {base}/chat/completions`) rather than one vendor's SDK, because that
 * shape is what OpenAI itself, Azure OpenAI, and most self-hosted or
 * on-prem model servers all speak — so whichever provider Safehubby
 * actually contracts with is a base URL and a key, not a rewrite.
 *
 * `AI_ASSIST_API_BASE` unset (the default before any provider is chosen)
 * means `status.mode` stays `"handoff"` and `draft()` is never called —
 * routes.ts checks `isAutomatic(aiAssist.status)` first and simply leaves
 * the assistant to write their own note, the same as they always could.
 */

const PROVIDER_NAME = process.env.AI_ASSIST_PROVIDER ?? "the AI assist provider";
const API_BASE = process.env.AI_ASSIST_API_BASE;
const API_KEY = process.env.AI_ASSIST_API_KEY;
const MODEL = process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You are drafting a short message on behalf of a Safehubby personal assistant, in their own voice, to send " +
  "to their own customer. Use only the facts given as context — never invent a detail, a reason, a price, or " +
  "an apology that isn't grounded in what's given, and never mention that you are an AI. Write two or three " +
  "plain sentences, no greeting and no signature — the assistant adds those themselves before sending it.";

export const aiAssist: AiAssistPort = {
  status: statusFor(
    "ai-assist", PROVIDER_NAME, Boolean(API_BASE && API_KEY),
    "An OpenAI-compatible chat-completions endpoint, then AI_ASSIST_API_BASE and AI_ASSIST_API_KEY. " +
    "AI_ASSIST_MODEL (default gpt-4o-mini) and AI_ASSIST_PROVIDER are optional.",
  ),

  async draft(input: AiDraftRequest): Promise<AiDraftResult> {
    if (!API_BASE || !API_KEY) throw new Error(`${PROVIDER_NAME} is not configured.`);

    const data = await postJson(
      `${API_BASE.replace(/\/$/, "")}/chat/completions`,
      { authorization: `Bearer ${API_KEY}` },
      {
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Purpose: ${input.purpose}\nContext: ${input.context}\nWhat to say: ${input.instruction}`,
          },
        ],
      },
    );

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error(`${PROVIDER_NAME} returned no draft.`);
    return { text: text.trim() };
  },
};
