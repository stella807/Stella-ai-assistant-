import { afterEach, describe, expect, it, vi } from "vitest";
import { email, emailMode } from "../src/adapters/email.ts";

const KEYS = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_EMAIL_TOKEN", "EMAIL_FROM", "EMAIL_API_URL", "EMAIL_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const useCloudflare = () => {
  process.env.CLOUDFLARE_ACCOUNT_ID = "acc_1";
  process.env.CLOUDFLARE_EMAIL_TOKEN = "cf_token";
  process.env.EMAIL_FROM = "hello@safehubby.com";
};

describe("sending email through Cloudflare", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it("is off, and refuses, until all three settings are there", async () => {
    for (const k of KEYS) delete process.env[k];
    expect(emailMode()).toBeNull();
    expect(email.status.mode).not.toBe("automatic");
    await expect(email.send([{ to: "a@b.co", subject: "s", body: "b" }])).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("posts each message to the account's send endpoint with the token", async () => {
    useCloudflare();
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ success: true, result: { delivered: ["x"] } }) } as Response;
    }));
    const r = await email.send([
      { to: "ana@example.com", subject: "Hi", body: "One" },
      { to: "luis@example.com", subject: "Hi", body: "Two" },
    ]);
    expect(r.sent).toBe(2);
    expect(calls[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acc_1/email/sending/send");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer cf_token");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      from: "hello@safehubby.com", to: "luis@example.com", subject: "Hi", text: "Two",
    });
  });

  it("keeps going past one bad address, and fails only when nothing went out", async () => {
    useCloudflare();
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n += 1;
      const ok = n !== 1;
      return { ok, status: ok ? 200 : 400, json: async () => (ok ? { success: true } : { success: false, errors: [{ code: 10001, message: "bad address" }] }) } as Response;
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await email.send([{ to: "x", subject: "s", body: "b" }, { to: "y@z.co", subject: "s", body: "b" }])).sent).toBe(1);

    n = 0;
    await expect(email.send([{ to: "x", subject: "s", body: "b" }])).rejects.toThrow(/bad address/);
  });
});
