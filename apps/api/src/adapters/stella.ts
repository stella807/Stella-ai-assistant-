import Anthropic from "@anthropic-ai/sdk";
import type { StellaPort, StellaReplyRequest, StellaReplyResult } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Stella's voice, through Claude — see stella.ts in core for what she may
 * and may not do.
 *
 * `ANTHROPIC_API_KEY` unset means `status.mode` stays `"handoff"`: the app
 * says Stella isn't set up on this server rather than pretending to think.
 * The scripted emergency replies do not come through here at all, so they
 * keep working either way.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.STELLA_MODEL ?? "claude-opus-5";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];
/** Medium, not the model's default high: these are short replies to someone waiting on a phone in a bar. */
const EFFORT: Effort = EFFORTS.find((e) => e === process.env.STELLA_EFFORT) ?? "medium";

/**
 * Server-side refusal fallbacks exist for the Opus 5 / Fable 5 families.
 * Sent only there, so pointing STELLA_MODEL at another model doesn't turn
 * every message into a 400.
 */
const USE_FALLBACKS = /^claude-(opus|fable)-5/.test(MODEL);

/** What Stella says when the model declines outright — still pointing somewhere useful. */
const DECLINED =
  "I can't help with that one. If you need something urgently, the SOS button and Get home panel on the Tonight tab are right there.";

let client: Anthropic | null = null;

export const stella: StellaPort = {
  status: statusFor(
    "stella", "Claude (Anthropic)", Boolean(API_KEY),
    "An Anthropic API key in ANTHROPIC_API_KEY. STELLA_MODEL (default claude-opus-5) and " +
    "STELLA_EFFORT (low | medium | high, default medium) are optional.",
  ),

  async reply({ system, turns }: StellaReplyRequest): Promise<StellaReplyResult> {
    if (!API_KEY) throw new Error("Stella is not configured.");
    // One retry, not the SDK's default two: someone is staring at a typing
    // indicator, and a third attempt is time better spent telling them.
    client ??= new Anthropic({ apiKey: API_KEY, timeout: 45_000, maxRetries: 1 });

    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: EFFORT },
      ...(USE_FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system,
      messages: turns.map((t) => ({ role: t.role, content: t.text })),
    });

    if (response.stop_reason === "refusal") return { text: DECLINED };
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new Error("Stella returned no reply.");
    return { text };
  },
};
