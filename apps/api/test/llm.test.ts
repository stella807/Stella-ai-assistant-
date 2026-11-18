import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CLAUDE_MODEL, DEFAULT_OLLAMA_MODEL, llmComplete, llmConfigured, llmProviderName, resolveLlm } from "../src/adapters/llm.ts";

const KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_API_BASE", "SITE_CHAT_API_BASE", "SITE_CHAT_API_KEY", "SITE_CHAT_MODEL", "AI_ASSIST_API_BASE", "AI_ASSIST_API_KEY", "AI_ASSIST_MODEL", "LLM_GATEWAY_URL", "LLM_GATEWAY_KEY", "LLM_GATEWAY_MODEL",
  "OLLAMA_URL", "OLLAMA_MODEL", "OLLAMA_FEATURES", "OLLAMA_API_KEY", "OLLAMA_TIMEOUT_MS", "OLLAMA_NUM_CTX", "OLLAMA_NUM_THREAD", "AI_ASSIST_OLLAMA_MODEL", "SITE_CHAT_OLLAMA_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"];
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

describe("going through the LiteLLM gateway", () => {
  const ask = () => llmComplete("SITE_CHAT", { system: "s", messages: [{ role: "user", content: "q" }], maxTokens: 10 });

  it("sends both features through the gateway, by its model alias, when it is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.LLM_GATEWAY_URL = "http://litellm.railway.internal:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ kind: "openai", base: "http://litellm.railway.internal:4000/v1", model: "safehubby-chat" });
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ kind: "openai", model: "safehubby-chat" });
  });

  it("still lets a feature's own endpoint win over the gateway", () => {
    process.env.LLM_GATEWAY_URL = "http://gw:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw";
    process.env.SITE_CHAT_API_BASE = "https://other.test/v1";
    process.env.SITE_CHAT_API_KEY = "k";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ base: "https://other.test/v1" });
  });

  it("falls back to Claude directly when the gateway is down, so the assistant keeps answering", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.LLM_GATEWAY_URL = "http://gw:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      if (String(url).startsWith("http://gw")) return new Response("bad gateway", { status: 502 });
      return new Response(JSON.stringify({ content: [{ type: "text", text: "direct" }] }), { status: 200 });
    }) as typeof fetch;
    expect(await ask()).toBe("direct");
    expect(calls.map((c) => c.url)).toEqual(["http://gw:4000/v1/chat/completions", "https://api.anthropic.com/v1/messages"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("says in the log that the gateway was skipped, without the key it was given", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.LLM_GATEWAY_URL = "http://gw:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw-secret";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async (url: any) => String(url).startsWith("http://gw")
      ? new Response('{"error":"Invalid proxy server token passed. Received API Key = sk-gw-secret"}', { status: 401 })
      : new Response(JSON.stringify({ content: [{ type: "text", text: "direct" }] }), { status: 200 })) as typeof fetch;
    expect(await ask()).toBe("direct");
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toMatch(/gateway/i);
    expect(line).toMatch(/401/);
    expect(line).not.toContain("sk-gw-secret");
    warn.mockRestore();
  });

  it("reports the gateway's failure when there is no Claude key to fall back to", async () => {
    process.env.LLM_GATEWAY_URL = "http://gw:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw";
    globalThis.fetch = (async () => new Response("bad gateway", { status: 502 })) as typeof fetch;
    await expect(ask()).rejects.toThrow(/502/);
  });
});

describe("our own model, on Ollama", () => {
  const ask = (feature: "SITE_CHAT" | "AI_ASSIST" = "SITE_CHAT") =>
    llmComplete(feature, { system: "Be brief.", messages: [{ role: "user", content: "Hola" }], maxTokens: 120 });
  const ollamaReply = (content: string) => ({ model: DEFAULT_OLLAMA_MODEL, message: { role: "assistant", content }, done: true });

  it("is used first when OLLAMA_URL is set, ahead of the gateway and Claude, with an openly licensed default model", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.LLM_GATEWAY_URL = "http://gw:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw";
    process.env.OLLAMA_URL = "http://ollama.railway.internal:11434/";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ kind: "ollama", base: "http://ollama.railway.internal:11434", model: DEFAULT_OLLAMA_MODEL });
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ kind: "ollama" });
    // Qwen3 4B Instruct 2507 is Apache-2.0. Qwen2.5 3B is not licensed for commercial use, so it must never be the default.
    expect(DEFAULT_OLLAMA_MODEL).toMatch(/^qwen3:4b-instruct/);
    expect(llmProviderName("SITE_CHAT")).toMatch(/Safehubby AI/);
  });

  it("still lets a feature's own endpoint win, so a GPU provider can be swapped in by configuration", () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    process.env.AI_ASSIST_API_BASE = "https://gpu.example/v1";
    process.env.AI_ASSIST_API_KEY = "k";
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ kind: "openai", base: "https://gpu.example/v1" });
  });

  it("can be limited to some features, and given a model per feature", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    process.env.OLLAMA_URL = "http://ollama:11434";
    process.env.OLLAMA_FEATURES = "ai_assist";
    process.env.AI_ASSIST_OLLAMA_MODEL = "qwen3:1.7b";
    expect(resolveLlm("SITE_CHAT")).toMatchObject({ kind: "anthropic" });
    expect(resolveLlm("AI_ASSIST")).toMatchObject({ kind: "ollama", model: "qwen3:1.7b" });
  });

  it("speaks Ollama's own chat API: no streaming, no thinking, the system turn first, the answer's length capped", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    stub(ollamaReply("  ¡Hola! ¿En qué te ayudo?  "));
    expect(await ask()).toBe("¡Hola! ¿En qué te ayudo?");
    const c = calls[0]!;
    expect(c.url).toBe("http://ollama:11434/api/chat");
    expect(c.headers.authorization).toBeUndefined();
    expect(c.body).toMatchObject({
      model: DEFAULT_OLLAMA_MODEL, stream: false, think: false,
      messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "Hola" }],
      options: { num_predict: 120, num_ctx: 4096 },
    });
  });

  it("uses as many threads as the CPUs the service was given, when told", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    stub(ollamaReply("ok"));
    await ask();
    expect(calls[0]!.body.options.num_thread).toBeUndefined();
    process.env.OLLAMA_NUM_THREAD = "4";
    await ask();
    expect(calls[1]!.body.options.num_thread).toBe(4);
  });

  it("drops any reasoning a thinking model writes before its answer", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    stub(ollamaReply("<think>The user greets me.</think>\n\nHola."));
    expect(await ask()).toBe("Hola.");
  });

  it("sends a key only when one is set, for an Ollama put behind a proxy", async () => {
    process.env.OLLAMA_URL = "https://ai.example";
    process.env.OLLAMA_API_KEY = "proxy-key";
    stub(ollamaReply("ok"));
    await ask();
    expect(calls[0]!.headers.authorization).toBe("Bearer proxy-key");
  });

  it("falls back to the gateway, then Claude, when our model is down, and says so once per step without secrets", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    process.env.LLM_GATEWAY_URL = "http://gw:4000";
    process.env.LLM_GATEWAY_KEY = "sk-gw-secret";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      if (String(url).startsWith("http://ollama")) return new Response('model "x" not found', { status: 404 });
      if (String(url).startsWith("http://gw")) return new Response("Received API Key = sk-gw-secret", { status: 401 });
      return new Response(JSON.stringify({ content: [{ type: "text", text: "from Claude" }] }), { status: 200 });
    }) as typeof fetch;
    expect(await ask()).toBe("from Claude");
    expect(calls.map((c) => c.url)).toEqual(["http://ollama:11434/api/chat", "http://gw:4000/v1/chat/completions", "https://api.anthropic.com/v1/messages"]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/Ollama/);
    expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).not.toContain("sk-gw-secret");
    warn.mockRestore();
  });

  it("asks Google's free Gemini next when our model is down, before anything paid", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    process.env.GEMINI_API_KEY = "g-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      if (String(url).startsWith("http://ollama")) return new Response("down", { status: 503 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "from Gemini" } }] }), { status: 200 });
    }) as typeof fetch;
    expect(await ask()).toBe("from Gemini");
    expect(calls[1]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(calls[1]!.headers.authorization).toBe("Bearer g-key");
    expect(calls).toHaveLength(2);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/Ollama failed.*Gemini/);
    warn.mockRestore();
  });

  it("gives up after its own time limit, which is longer than a cloud call's because it runs on CPUs", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    process.env.OLLAMA_TIMEOUT_MS = "30";
    globalThis.fetch = ((_url: any, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })) as typeof fetch;
    await expect(ask()).rejects.toThrow(/took longer than/);
  });

  it("reports the failure when there is nothing to fall back to", async () => {
    process.env.OLLAMA_URL = "http://ollama:11434";
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    await expect(ask()).rejects.toThrow(/500/);
  });
});
