import { postJson } from "./fulfillment.ts";

/**
 * The website assistant's language model: any OpenAI-compatible
 * chat-completions endpoint, the same shape the drafting helper speaks, so one
 * provider and key can serve both. `SITE_CHAT_*` overrides `AI_ASSIST_*` when
 * the website should use a different model or a separately metered key.
 *
 * Env is read on each call, not at import, so configuring it needs no rebuild
 * and a test can set it per case.
 */

const settings = () => ({
  base: process.env.SITE_CHAT_API_BASE ?? process.env.AI_ASSIST_API_BASE,
  key: process.env.SITE_CHAT_API_KEY ?? process.env.AI_ASSIST_API_KEY,
  model: process.env.SITE_CHAT_MODEL ?? process.env.AI_ASSIST_MODEL ?? "gpt-4o-mini",
});

export const siteChatConfigured = (): boolean => {
  const s = settings();
  return Boolean(s.base && s.key);
};

export async function siteChatReply(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const s = settings();
  if (!s.base || !s.key) throw new Error("The website assistant is not configured.");
  const data = await postJson(
    `${s.base.replace(/\/$/, "")}/chat/completions`,
    { authorization: `Bearer ${s.key}` },
    // Short on purpose: answers are read aloud, and a cap bounds what one question can cost.
    { model: s.model, max_tokens: 350, temperature: 0.2, messages: [{ role: "system", content: system }, ...messages] },
  );
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("The website assistant returned no answer.");
  return text.trim();
}
