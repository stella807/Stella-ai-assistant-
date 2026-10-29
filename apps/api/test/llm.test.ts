import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CLAUDE_MODEL, llmComplete, llmConfigured, resolveLlm } from "../src/adapters/llm.ts";

const KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_API_BASE", "SITE_CHAT_API_BASE", "SITE_CHAT_API_KEY", "SITE_CHAT_MODEL", "AI_ASSIST_API_BASE", "AI_ASSIST_API_KEY", "AI_ASSIST_MODEL"];
const realFetch = globalThis.fetch;
const calls: { url: string; headers: Record<string, string>; body: any }[] = [];

const stub = (reply: unknown) => {
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of KEYS) delete process.env[k];
  calls.length = 0;
});

describe("choosing the model provider", () => {
  it("is not configured with nothing set", () => {
    expect(llmConfigured("SITE_CHAT")).toBe(false);
    expect(llmConfigured("AI_ASSIST")).toBe(false);
  });

  it("uses Claude directly when there is an Anthropic key, with Claude as the default model", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ kind: "anthropic", base: "https://api.anthropic.com", model: DEFAULT_CLAUDE_MODEL });
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ kind: "anthropic" });
  });

  it("lets an explicit endpoint for a feature override Claude", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.SITE_CHAT_API_BASE = "https://other.test/v1";
    process.env.SITE_CHAT_API_KEY = "k";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ kind: "openai", base: "https://other.test/v1" });
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ kind: "anthropic" });
  });

  it("keeps an earlier OpenAI-style setup working for the website", () => {
    process.env.AI_ASSIST_API_BASE = "https://old.test/v1";
    process.env.AI_ASSIST_API_KEY = "k";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ kind: "openai", model: "gpt-4o-mini" });
  });

  it("lets the model be chosen per feature", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.SITE_CHAT_MODEL = "claude-opus-5-5";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ model: "claude-opus-5-5" });
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ model: DEFAULT_CLAUDE_MODEL });
  });

  it("treats an empty variable as unset, since Railway can hold an empty string", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(llmConfigured("SITE_CHAT")).toBe(false);
  });
});

describe("calling Claude directly", () => {
  it("sends the Messages API shape: key header, version, system apart from the turns", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    stub({ content: [{ type: "text", text: "Premium " }, { type: "text", text: "is $93.99." }] });
    const out = await llmComplete("SITE_CHAT", { system: "Be brief.", messages: [{ role: "user", content: "Price?" }], maxTokens: 200 });
    expect(out).toBe("Premium is $93.99.");
    const c = calls[0]!;
    expect(c.url).toBe("https://api.anthropic.com/v1/messages");
    expect(c.headers["x-api-key"]).toBe("sk-ant");
    expect(c.headers["anthropic-version"]).toBe("2023-06-01");
    expect(c.headers.authorization).toBeUndefined();
    expect(c.body).toMatchObject({ model: DEFAULT_CLAUDE_MODEL, max_tokens: 200, system: "Be brief.", messages: [{ role: "user", content: "Price?" }] });
    expect(c.body.messages.some((m: any) => m.role === "system")).toBe(false);
  });

  it("fails clearly, without echoing the key, when the answer is empty or the call is refused", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
    stub({ content: [] });
    await expect(llmComplete("SITE_CHAT", { system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 })).rejects.toThrow(/no answer/);
    globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
    await expect(llmComplete("SITE_CHAT", { system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 })).rejects.toThrow(/401/);
  });

  it("still speaks the OpenAI style to an explicit endpoint", async () => {
    process.env.SITE_CHAT_API_BASE = "https://other.test/v1/";
    process.env.SITE_CHAT_API_KEY = "k";
    stub({ choices: [{ message: { content: "hi" } }] });
    expect(await llmComplete("SITE_CHAT", { system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 })).toBe("hi");
    expect(calls[0]!.url).toBe("https://other.test/v1/chat/completions");
    expect(calls[0]!.body.messages[0]).toEqual({ role: "system", content: "s" });
  });
});
