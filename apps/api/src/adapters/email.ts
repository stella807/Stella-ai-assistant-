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

const EMAIL_URL = process.env.EMAIL_API_URL;
const EMAIL_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const TIMEOUT_MS = 8000;

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

/** Exported so the request body is testable without a network call. */
export function emailPayload(messages: OutboundEmail[]) {
  return {
    from: EMAIL_FROM ?? "hello@safehubby.app",
    messages: messages.map((m) => ({ to: m.to, subject: m.subject, text: m.body })),
  };
}

const configured = Boolean(EMAIL_URL && EMAIL_KEY && EMAIL_FROM);

export const email: EmailPort = {
  status: statusFor(
    "email",
    "Email delivery",
    configured,
    "Set EMAIL_API_URL, EMAIL_API_KEY and EMAIL_FROM to send the launch announcement from inside Safehubby. Until then the mailing list is stored and exportable, and nothing is sent.",
  ),

  async send(messages) {
    if (!configured) {
      // Refuses rather than resolving with a count of zero: a caller that
      // treats "sent: 0" as success is exactly how a silent drop happens.
      throw new Error(email.status.requires);
    }
    if (messages.length === 0) return { sent: 0 };

    const res = await fetch(EMAIL_URL!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${EMAIL_KEY}` },
      body: JSON.stringify(emailPayload(messages)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Email provider rejected the send (${res.status}).`);
    return { sent: messages.length };
  },
};
