import { afterEach, describe, expect, it } from "vitest";
import { api } from "../src/api.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const queue = (...responses: Response[]) => {
  let calls = 0;
  globalThis.fetch = (async () => responses[Math.min(calls++, responses.length - 1)]!.clone()) as typeof fetch;
  return () => calls;
};
const edge429 = () => new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
const ours429 = () => new Response(JSON.stringify({ error: "Too many code attempts. Wait a few minutes and try again." }), { status: 429 });

describe("a read that the host answers with 429", () => {
  it("is tried again after the wait it asked for, and the person never sees the error", async () => {
    const calls = queue(edge429(), edge429(), new Response(JSON.stringify({ address: null }), { status: 200 }));
    await expect(api.homeAddress()).resolves.toEqual({ address: null });
    expect(calls()).toBe(3);
  });

  it("gives up after two retries with a plain sentence rather than a bare number", async () => {
    const calls = queue(edge429());
    await expect(api.homeAddress()).rejects.toThrow(/Too many requests in a row/);
    expect(calls()).toBe(3);
  });

  it("is not retried when the app itself said no, because that limit is meant", async () => {
    const calls = queue(ours429());
    await expect(api.homeAddress()).rejects.toThrow(/Too many code attempts/);
    expect(calls()).toBe(1);
  });

  it("is repeated for the chat assistant, which changes nothing", async () => {
    const calls = queue(edge429(), new Response(JSON.stringify({ reply: "hi" }), { status: 200 }));
    await expect(api.siteChat([{ role: "user", content: "hello" }])).resolves.toEqual({ reply: "hi" });
    expect(calls()).toBe(2);
  });

  it("is never repeated for a write, which could charge or send twice", async () => {
    const calls = queue(edge429());
    await expect(api.claimGrant("ABC-234")).rejects.toThrow(/Too many requests in a row/);
    expect(calls()).toBe(1);
  });
});
