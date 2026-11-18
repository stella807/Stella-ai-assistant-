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
 *      OpenAI-style. An explicit override always wins (a GPU host running
 *      vLLM, for one).
 *   1b. `OLLAMA_URL` set: Safehubby's own open-weight model on Ollama
 *      (deploy/ollama), for every feature or only those in `OLLAMA_FEATURES`.
 *      If it fails or is too slow, the gateway and then Claude are tried, when
 *      they are configured.
 *   2. `LLM_GATEWAY_URL` and `LLM_GATEWAY_KEY` set: the LiteLLM gateway
 *      (deploy/litellm), asked for the `safehubby-chat` alias so the gateway,
 *      not this code, decides which model answers and what it falls back to.
 *      If the gateway itself fails and `ANTHROPIC_API_KEY` is set, Claude is
 *      asked directly: a gateway outage must not silence the assistant.
 *   3. `ANTHROPIC_API_KEY` set: Claude, directly.
 *   4. The website assistant only: the drafting helper's `AI_ASSIST_API_*`
 *      endpoint, so a setup made before Claude was added keeps working.
 *
 * Environment is read on every call, never at import, so configuring it needs
 * no rebuild and a test can set it per case.
 */

export type LlmFeature = "SITE_CHAT" | "AI_ASSIST";
export type LlmTurn = { role: "user" | "assistant"; content: string };

export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";
/**
 * Qwen3 4B Instruct (2507), 4-bit. Apache-2.0, so it can be used commercially; answers well in Spanish and
 * English and calls tools. Measured on 4 CPU cores with no GPU: about 9 words-pieces a second, a short reply
 * in about 10 seconds, 2.5 GB to download, about 4 GB of memory. Qwen2.5 3B was passed over: its license
 * does not allow commercial use.
 */
export const DEFAULT_OLLAMA_MODEL = "qwen3:4b-instruct-2507-q4_K_M";
const OLLAMA_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = "2023-06-01";

type Resolved =
  | { kind: "anthropic"; base: string; key: string; model: string }
  | { kind: "openai"; base: string; key: string; model: string; gateway?: true }
  | { kind: "ollama"; base: string; key?: string; model: string };

export const GATEWAY_MODEL_ALIAS = "safehubby-chat";

const env = (name: string): string | undefined => process.env[name] || undefined;

/** Our own model, when Ollama is set up and this feature is one it serves. */
function ollamaFor(feature: LlmFeature): Resolved | null {
  const url = env("OLLAMA_URL");
  if (!url) return null;
  const only = env("OLLAMA_FEATURES");
  if (only && !only.split(",").map((f) => f.trim().toUpperCase()).includes(feature)) return null;
  return { kind: "ollama", base: url.replace(/\/+$/, ""), key: env("OLLAMA_API_KEY"), model: env(`${feature}_OLLAMA_MODEL`) ?? env("OLLAMA_MODEL") ?? DEFAULT_OLLAMA_MODEL };
}

/** What to try after our own model fails: the gateway, then Claude directly. */
function afterOllama(feature: LlmFeature): Resolved | null {
  const gatewayUrl = env("LLM_GATEWAY_URL");
  const gatewayKey = env("LLM_GATEWAY_KEY");
  if (gatewayUrl && gatewayKey) {
    return { kind: "openai", base: `${gatewayUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`, key: gatewayKey, model: env("LLM_GATEWAY_MODEL") ?? GATEWAY_MODEL_ALIAS, gateway: true };
  }
  return claudeDirect(feature);
}

function claudeDirect(feature: LlmFeature): Resolved | null {
  const anthropicKey = env("ANTHROPIC_API_KEY");
  return anthropicKey ? { kind: "anthropic", base: env("ANTHROPIC_API_BASE") ?? "https://api.anthropic.com", key: anthropicKey, model: env(`${feature}_MODEL`) ?? DEFAULT_CLAUDE_MODEL } : null;
}

export function resolveLlm(feature: LlmFeature): Resolved | null {
  const ownBase = env(`${feature}_API_BASE`);
  const ownKey = env(`${feature}_API_KEY`);
  const ownModel = env(`${feature}_MODEL`);
  if (ownBase && ownKey) return { kind: "openai", base: ownBase, key: ownKey, model: ownModel ?? env("AI_ASSIST_MODEL") ?? "gpt-4o-mini" };

  const ollama = ollamaFor(feature);
  if (ollama) return ollama;

  const gatewayUrl = env("LLM_GATEWAY_URL");
  const gatewayKey = env("LLM_GATEWAY_KEY");
  if (gatewayUrl && gatewayKey) {
    return { kind: "openai", base: `${gatewayUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`, key: gatewayKey, model: env("LLM_GATEWAY_MODEL") ?? GATEWAY_MODEL_ALIAS, gateway: true };
  }

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
  return r?.kind === "anthropic" ? "Claude" : r?.kind === "ollama" ? `Safehubby AI (${r.model})` : env("AI_ASSIST_PROVIDER") ?? "the AI provider";
};

/** A failure's reason for the log, with anything shaped like a key masked: an auth error can quote the key it was sent. */
const reasonOf = (err: unknown) => (err instanceof Error ? err.message : "unknown error").replace(/\bsk-[\w.-]+/g, "sk-…").slice(0, 160);

export async function llmComplete(
  feature: LlmFeature,
  input: { system: string; messages: LlmTurn[]; maxTokens: number; temperature?: number },
): Promise<string> {
  const r = resolveLlm(feature);
  if (!r) throw new Error("The AI assistant is not configured.");
  if (r.kind === "ollama") {
    const next = afterOllama(feature);
    if (!next) return complete(r, input);
    try {
      return await complete(r, input);
    } catch (err) {
      // Logged so a stopped or overloaded model server is noticed, though answers keep arriving from the fallback.
      console.warn(`[safehubby] Ollama failed (${reasonOf(err)}); answering with ${next.kind === "anthropic" ? "Claude directly" : "the gateway"}.`);
      return completeWithClaudeAfter(feature, next, input);
    }
  }
  return completeWithClaudeAfter(feature, r, input);
}

/** Calls `r`, and if it is the gateway and fails, Claude directly. */
async function completeWithClaudeAfter(
  feature: LlmFeature, r: Resolved, input: { system: string; messages: LlmTurn[]; maxTokens: number; temperature?: number },
): Promise<string> {
  const anthropicKey = env("ANTHROPIC_API_KEY");
  if (r.kind === "openai" && r.gateway && anthropicKey) {
    try {
      return await complete(r, input);
    } catch (err) {
      // Without this line a broken gateway would go unnoticed for good, since every answer still arrives.
      // Key-shaped text is masked: a gateway's auth error can quote the key it was sent.
      console.warn(`[safehubby] LLM gateway failed (${reasonOf(err)}); answering with Claude directly.`);
      return complete(claudeDirect(feature)!, input);
    }
  }
  return complete(r, input);
}

async function complete(
  r: Resolved,
  input: { system: string; messages: LlmTurn[]; maxTokens: number; temperature?: number },
): Promise<string> {
  const base = r.base.replace(/\/$/, "");

  if (r.kind === "ollama") return completeOllama(r, input);

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

/**
 * Ollama's own chat API rather than its OpenAI-compatible one, because only this one can turn thinking off
 * (a thinking model on CPUs spends a minute reasoning before it answers) and set the context window.
 * Its own time limit: a CPU model is slower than a cloud one, and the 8 seconds used for those is too short.
 */
async function completeOllama(
  r: Extract<Resolved, { kind: "ollama" }>, input: { system: string; messages: LlmTurn[]; maxTokens: number; temperature?: number },
): Promise<string> {
  const limit = Number(env("OLLAMA_TIMEOUT_MS")) || OLLAMA_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limit);
  try {
    const res = await fetch(`${r.base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(r.key ? { authorization: `Bearer ${r.key}` } : {}) },
      body: JSON.stringify({
        model: r.model, stream: false, think: false,
        // Kept loaded between questions: loading the model again takes several seconds.
        keep_alive: env("OLLAMA_KEEP_ALIVE") ?? "24h",
        messages: [{ role: "system", content: input.system }, ...input.messages],
        options: {
          num_predict: input.maxTokens, temperature: input.temperature ?? 0.2, num_ctx: Number(env("OLLAMA_NUM_CTX")) || 4096,
          // Ollama counts the host's cores, not the share Railway gives the service; more threads than CPUs slows it down.
          ...(Number(env("OLLAMA_NUM_THREAD")) > 0 ? { num_thread: Number(env("OLLAMA_NUM_THREAD")) } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    const data = await res.json() as { message?: { content?: unknown } };
    const raw = typeof data.message?.content === "string" ? data.message.content : "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!text) throw new Error("The AI assistant returned no answer.");
    return text;
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Our AI took longer than ${Math.round(limit / 1000)} seconds.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type OllamaHealth = {
  configured: boolean;
  /** The model the app asks for, and the features that use it. */
  model?: string; features?: string;
  reachable?: boolean; installed?: boolean; loaded?: boolean;
  /** Why it could not be reached, with nothing secret in it. */
  error?: string;
};

/** Whether our own model server answers and has the model, for the owner portal. Never throws. */
export async function ollamaHealth(): Promise<OllamaHealth> {
  const r = ollamaFor("SITE_CHAT") ?? ollamaFor("AI_ASSIST");
  if (!r || r.kind !== "ollama") return { configured: false };
  const base = { configured: true, model: r.model, features: env("OLLAMA_FEATURES") ?? "all" };
  const get = async (path: string) => {
    const res = await fetch(`${r.base}${path}`, { headers: r.key ? { authorization: `Bearer ${r.key}` } : {}, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json() as { models?: { name?: string }[] };
  };
  try {
    const [tags, ps] = await Promise.all([get("/api/tags"), get("/api/ps").catch(() => ({ models: [] }))]);
    const has = (list: { models?: { name?: string }[] }) => (list.models ?? []).some((m) => m.name === r.model);
    return { ...base, reachable: true, installed: has(tags), loaded: has(ps) };
  } catch (err) {
    return { ...base, reachable: false, error: reasonOf(err) };
  }
}

/** One question to our own model only, with no fallback, so the owner can see it working and how fast. */
export async function askOllama(question: string): Promise<{ text: string; seconds: number; model: string }> {
  const r = ollamaFor("SITE_CHAT") ?? ollamaFor("AI_ASSIST");
  if (!r || r.kind !== "ollama") throw new Error("Our own AI is not set up: OLLAMA_URL is not set.");
  const started = Date.now();
  const text = await completeOllama(r, {
    system: "You are Safehubby's assistant: a concierge and personal-assistant service in Puerto Rico. Answer in the language of the question, in one or two sentences.",
    messages: [{ role: "user", content: question }], maxTokens: 120,
  });
  return { text, seconds: Math.round((Date.now() - started) / 100) / 10, model: r.model };
}
