import { llmComplete, llmConfigured, type LlmTurn } from "./llm.ts";

/**
 * The website assistant's language model. See llm.ts for which provider
 * answers; `SITE_CHAT_*` settings override the shared ones so the website can
 * use its own model or a separately metered key.
 */

export const siteChatConfigured = (): boolean => llmConfigured("SITE_CHAT");

// Short on purpose: answers are read aloud, and a cap bounds what one question can cost.
export const siteChatReply = (system: string, messages: LlmTurn[]): Promise<string> =>
  llmComplete("SITE_CHAT", { system, messages, maxTokens: 350, temperature: 0.2 });
