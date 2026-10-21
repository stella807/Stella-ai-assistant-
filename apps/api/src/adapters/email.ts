import { statusFor } from "@safehubby/core";
import type { ProviderStatus } from "@safehubby/core";

/**
 * Sending email — today, the launch announcement and nothing else.
 *
 * There is no mail provider wired into this app, and this adapter exists to
 * say so in the same vocabulary every other integration uses rather than by
 * being absent. `docs/fulfillment.md`'s rule applies here as much as it does
 * to rides and deliveries: the app may never describe as done something it
 * has not done. The specific failure this prevents is a "check your inbox for
 * a confirmation" message with no mail server behind it — which is worse on
 * this surface than anywhere else, because a mailing list's entire promise is
 * a message that arrives later.
 *
 * Provider-agnostic by the same reasoning as `push.ts`: point
 * `EMAIL_API_URL` at whatever actually sends (Postmark, SES, Resend, a relay
 * of your own) with `EMAIL_API_KEY` as a bearer credential. Until then the
 * status is `handoff`, `send` refuses rather than silently dropping, and the
 * list is stored so it can be exported and sent from anywhere.
 */

/*
 * Three ways to send, checked in this order:
 *
 *  1. Brevo — `BREVO_API_KEY` and `EMAIL_FROM`. Free for 300 emails a day,
 *     from your own domain once it is authenticated in Brevo (see
 *     docs/deploy.md). `EMAIL_FROM_NAME` is the display name (default
 *     "Safehubby").
 *  2. Cloudflare Email Service — `CLOUDFLARE_ACCOUNT_ID`,
 *     `CLOUDFLARE_EMAIL_TOKEN` and `EMAIL_FROM`. Needs Workers Paid.
 *  3. Any relay that takes `{ from, messages }` as JSON — `EMAIL_API_URL`,
 *     `EMAIL_API_KEY` and `EMAIL_FROM`.
 *
 * Read when used rather than at startup, so the tests can switch them.
 */
const TIMEOUT_MS = 8000;
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const BREVO_API = "https://api.brevo.com/v3/smtp/email";

export interface OutboundEmail {
  to: string;
  subject: string;
  /** Plain text. No HTML templating here — that belongs to whatever service
   *  actually sends, and inventing one before there is a sender is work with
   *  nothing to check it against. */
  body: string;
}

export interface EmailPort {
  readonly status: ProviderStatus;
  send(messages: OutboundEmail[]): Promise<{ sent: number }>;
}

const env = () => ({
  from: process.env.EMAIL_FROM,
  fromName: process.env.EMAIL_FROM_NAME,
  brevoKey: process.env.BREVO_API_KEY,
  cfAccount: process.env.CLOUDFLARE_ACCOUNT_ID,
  cfToken: process.env.CLOUDFLARE_EMAIL_TOKEN,
  url: process.env.EMAIL_API_URL,
  key: process.env.EMAIL_API_KEY,
});

/** Which sender is set up, if any. */
export function emailMode(): "brevo" | "cloudflare" | "relay" | null {
  const e = env();
  if (e.brevoKey && e.from) return "brevo";
  if (e.cfAccount && e.cfToken && e.from) return "cloudflare";
  if (e.url && e.key && e.from) return "relay";
  return null;
}

/** Exported so the request body is testable without a network call. */
export function emailPayload(messages: OutboundEmail[]) {
  return {
    from: env().from ?? "contact@safehubby.com",
    messages: messages.map((m) => ({ to: m.to, subject: m.subject, text: m.body })),
  };
}

/** One Cloudflare send. Its API takes one message per request. */
export function cloudflarePayload(m: OutboundEmail) {
  return { from: env().from!, to: m.to, subject: m.subject, text: m.body };
}

/**
 * Sends one message at a time through `sendOne`, which returns null on success
 * or a short reason on failure. One bad address must not stop the rest, but a
 * batch where nothing went out is a failure the caller should see.
 */
async function sendEach(
  label: string, messages: OutboundEmail[], sendOne: (m: OutboundEmail) => Promise<string | null>,
): Promise<number> {
  let sent = 0;
  const failures: string[] = [];
  for (const m of messages) {
    const failure = await sendOne(m).catch((err) => (err instanceof Error ? err.message : "request failed"));
    if (failure === null) sent += 1; else failures.push(failure);
  }
  if (failures.length > 0) {
    console.error(`[safehubby] ${label} email: ${failures.length} of ${messages.length} not sent — ${failures[0]}`);
    if (sent === 0) throw new Error(`${label} did not send the email: ${failures[0]}`);
  }
  return sent;
}

function sendCloudflare(messages: OutboundEmail[]): Promise<number> {
  const { cfAccount, cfToken } = env();
  return sendEach("Cloudflare", messages, async (m) => {
    const res = await fetch(`${CLOUDFLARE_API}/accounts/${encodeURIComponent(cfAccount!)}/email/sending/send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfToken}` },
      body: JSON.stringify(cloudflarePayload(m)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; errors?: { code?: number; message?: string }[] } | null;
    return res.ok && json?.success !== false ? null : json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
  });
}

/** `Safehubby <hello@safehubby.com>` or a bare address, as the one address and a name. */
function senderParts(): { email: string; name: string } {
  const { from, fromName } = env();
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from ?? "");
  return { email: (match?.[2] ?? from ?? "").trim(), name: fromName?.trim() || match?.[1]?.trim() || "Safehubby" };
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Our emails are plain text; Brevo wants an HTML part too, so paragraphs and line breaks carry over. */
export function textToHtml(text: string): string {
  return text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** One Brevo send. Exported so the body is testable without a network call. */
export function brevoPayload(m: OutboundEmail) {
  return {
    sender: senderParts(),
    to: [{ email: m.to }],
    subject: m.subject,
    textContent: m.body,
    htmlContent: textToHtml(m.body),
  };
}

function sendBrevo(messages: OutboundEmail[]): Promise<number> {
  const { brevoKey } = env();
  return sendEach("Brevo", messages, async (m) => {
    const res = await fetch(BREVO_API, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "api-key": brevoKey! },
      body: JSON.stringify(brevoPayload(m)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    return json?.message ?? json?.code ?? `HTTP ${res.status}`;
  });
}

export const email: EmailPort = {
  get status() {
    return statusFor(
      "email",
      "Email delivery",
      emailMode() !== null,
      "Set BREVO_API_KEY and EMAIL_FROM to send through Brevo (free), or CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_EMAIL_TOKEN and EMAIL_FROM for Cloudflare, or EMAIL_API_URL, EMAIL_API_KEY and EMAIL_FROM for another sender. Until then nothing is emailed.",
    );
  },

  async send(messages) {
    const mode = emailMode();
    if (!mode) {
      // Refuses rather than resolving with a count of zero: a caller that
      // treats "sent: 0" as success is exactly how a silent drop happens.
      throw new Error(email.status.requires);
    }
    if (messages.length === 0) return { sent: 0 };
    if (mode === "brevo") return { sent: await sendBrevo(messages) };
    if (mode === "cloudflare") return { sent: await sendCloudflare(messages) };

    const { url, key } = env();
    const res = await fetch(url!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(emailPayload(messages)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Email provider rejected the send (${res.status}).`);
    return { sent: messages.length };
  },
};
