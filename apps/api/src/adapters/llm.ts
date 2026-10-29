import { postJson } from "./fulfillment.ts";

/**
 * One way to ask a language model, shared by the website assistant and the
 * assistants' drafting helper.
 *
 * Claude is the default and is called directly through Anthropic's Messages
 * API. A plain OpenAI-compatible chat-completions endpoint is still supported
 * for anyone who sets its base URL and key explicitly, so changing provider
 * is configuration, not a rewrite.
 *
 * Which one is used, for a feature with its own prefix (`SITE_CHAT` or
 * `AI_ASSIST`):
 *   1. `<PREFIX>_API_BASE` and `<PREFIX>_API_KEY` both set: that endpoint,
 *      OpenAI-style. An explicit override always wins.
 *   2. `ANTHROPIC_API_KEY` set: Claude, directly.
 *   3. The website assistant only: the drafting helper's `AI_ASSIST_API_*`
 *      endpoint, so a setup made before Claude was added keeps working.
 *
 * Environment is read on every call, never at import, so configuring it needs
 * no rebuild and a test can set it per case.
 */

export type LlmFeature = "SITE_CHAT" | "AI_ASSIST";
export type LlmTurn = { role: "user" | "assistant"; content: string };

export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";
const ANTHROPIC_VERSION = "2023-06-01";

type Resolved =
  | { kind: "anthropic"; base: string; key: string; model: string }
  | { kind: "openai"; base: string; key: string; model: string };

const env = (name: string): string | undefined => process.env[name] || undefined;

export function resolveLlm(feature: LlmFeature): Resolved | null {
  const ownBase = env(`${feature}_API_BASE`);
  const ownKey = env(`${feature}_API_KEY`);
  const ownModel = env(`${feature}_MODEL`);
  if (ownBase && ownKey) return { kind: "openai", base: ownBase, key: ownKey, model: ownModel ?? env("AI_ASSIST_MODEL") ?? "gpt-4o-mini" };

  const anthropicKey = env("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    return { kind: "anthropic", base: env("ANTHROPIC_API_BASE") ?? "https://api.anthropic.com", key: anthropicKey, model: ownModel ?? DEFAULT_CLAUDE_MODEL };
  }

  const sharedBase = env("AI_ASSIST_API_BASE");
  const sharedKey = env("AI_ASSIST_API_KEY");
  if (feature === "SITE_CHAT" && sharedBase && sharedKey) {
    return { kind: "openai", base: sharedBase, key: sharedKey, model: ownModel ?? env("AI_ASSIST_MODEL") ?? "gpt-4o-mini" };
  }
  return null;
}

export const llmConfigured = (feature: LlmFeature): boolean => resolveLlm(feature) !== null;

/** Who is answering, for status text. */
export const llmProviderName = (feature: LlmFeature): string => {
  const r = resolveLlm(feature);
  return r?.kind === "anthropic" ? "Claude" : env("AI_ASSIST_PROVIDER") ?? "the AI provider";
};

export async function llmComplete(
  feature: LlmFeature,
  input: { system: string; messages: LlmTurn[]; maxTokens: number; temperature?: number },
): Promise<string> {
  const r = resolveLlm(feature);
  if (!r) throw new Error("The AI assistant is not configured.");
  const base = r.base.replace(/\/$/, "");

  if (r.kind === "anthropic") {
    // The system prompt travels in its own field; the Messages API has no "system" role in `messages`.
    const data = await postJson(
      `${base}/v1/messages`,
      { "x-api-key": r.key, "anthropic-version": ANTHROPIC_VERSION },
      { model: r.model, max_tokens: input.maxTokens, temperature: input.temperature ?? 0.2, system: input.system, messages: input.messages },
    );
    const text = Array.isArray(data.content)
      ? data.content.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("")
      : "";
    if (!text.trim()) throw new Error("The AI assistant returned no answer.");
    return text.trim();
  }

  const data = await postJson(
    `${base}/chat/completions`,
    { authorization: `Bearer ${r.key}` },
    { model: r.model, max_tokens: input.maxTokens, temperature: input.temperature ?? 0.2, messages: [{ role: "system", content: input.system }, ...input.messages] },
  );
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("The AI assistant returned no answer.");
  return text.trim();
}
