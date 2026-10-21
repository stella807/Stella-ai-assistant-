import { afterEach, describe, expect, it, vi } from "vitest";
import { brevoPayload, email, emailMode, textToHtml } from "../src/adapters/email.ts";

const KEYS = ["BREVO_API_KEY", "EMAIL_FROM", "EMAIL_FROM_NAME", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_EMAIL_TOKEN", "EMAIL_API_URL", "EMAIL_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const useBrevo = () => { process.env.BREVO_API_KEY = "xkeysib-test"; process.env.EMAIL_FROM = "hello@safehubby.com"; };

describe("sending email through Brevo", () => {
  afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  it("needs only the key, and wins over Cloudflare when both are set", () => {
    for (const k of KEYS) delete process.env[k];
    expect(emailMode()).toBeNull();
    process.env.BREVO_API_KEY = "k";
    expect(emailMode()).toBe("brevo");
    Object.assign(process.env, { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_EMAIL_TOKEN: "t" });
    expect(emailMode()).toBe("brevo");
  });

  it("builds one message with a sender, a plain part and an HTML part", () => {
    useBrevo(); delete process.env.EMAIL_FROM_NAME;
    const p = brevoPayload({ to: "ana@example.com", subject: "Hi", body: "Line one\nLine two\n\nSecond <b>paragraph</b>" });
    expect(p).toEqual({
      sender: { email: "hello@safehubby.com", name: "Safehubby" },
      to: [{ email: "ana@example.com" }],
      subject: "Hi",
      textContent: "Line one\nLine two\n\nSecond <b>paragraph</b>",
      htmlContent: "<p>Line one<br>Line two</p><p>Second &lt;b&gt;paragraph&lt;/b&gt;</p>",
    });
  });

  it("sends from contact@safehubby.com unless EMAIL_FROM says otherwise", () => {
    process.env.BREVO_API_KEY = "k"; delete process.env.EMAIL_FROM; delete process.env.EMAIL_FROM_NAME;
    expect(brevoPayload({ to: "a@b.co", subject: "s", body: "b" }).sender).toEqual({ email: "contact@safehubby.com", name: "Safehubby" });
    process.env.EMAIL_FROM = "hello@safehubby.com";
    expect(brevoPayload({ to: "a@b.co", subject: "s", body: "b" }).sender.email).toBe("hello@safehubby.com");
  });

  it("reads a display name from EMAIL_FROM_NAME or from a Name <address> setting", () => {
    useBrevo(); process.env.EMAIL_FROM_NAME = "Safehubby Team";
    expect(brevoPayload({ to: "a@b.co", subject: "s", body: "b" }).sender).toEqual({ email: "hello@safehubby.com", name: "Safehubby Team" });
    delete process.env.EMAIL_FROM_NAME; process.env.EMAIL_FROM = "Safehubby Desk <desk@safehubby.com>";
    expect(brevoPayload({ to: "a@b.co", subject: "s", body: "b" }).sender).toEqual({ email: "desk@safehubby.com", name: "Safehubby Desk" });
  });

  it("escapes anything that looks like markup in an email's text", () => {
    expect(textToHtml('<script>alert(1)</script> & "quoted"')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; "quoted"</p>');
  });

  it("posts to Brevo's send endpoint with the key in api-key, one request per message", async () => {
    useBrevo();
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => ({ messageId: "<1@x>" }) } as Response;
    }));
    const r = await email.send([{ to: "a@x.co", subject: "A", body: "1" }, { to: "b@x.co", subject: "B", body: "2" }]);
    expect(r.sent).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://api.brevo.com/v3/smtp/email");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("xkeysib-test");
    expect(headers.authorization).toBeUndefined();
  });

  it("passes on Brevo's reason, keeps going past one bad address, and fails only when nothing went out", async () => {
    useBrevo();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      n += 1;
      const ok = n !== 1;
      return { ok, status: ok ? 201 : 400, json: async () => (ok ? {} : { code: "invalid_parameter", message: "Invalid email address" }) } as Response;
    }));
    expect((await email.send([{ to: "x", subject: "s", body: "b" }, { to: "y@z.co", subject: "s", body: "b" }])).sent).toBe(1);
    n = 0;
    await expect(email.send([{ to: "x", subject: "s", body: "b" }])).rejects.toThrow(/Brevo did not send the email: Invalid email address/);
  });
});
