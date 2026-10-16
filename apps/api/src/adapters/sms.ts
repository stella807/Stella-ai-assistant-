import type { SmsMessage, SmsPort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Sending texts through Twilio's Messages API.
 *
 *   POST {base}/2010-04-01/Accounts/{SID}/Messages.json
 *        form body To / From / Body, HTTP Basic auth (SID : auth token)
 *
 * Twilio is what is wired because it is the one most places already have, and
 * its trial credit is the closest thing to free there is: a trial account can
 * text only phone numbers verified in its console, and prefixes each message
 * with a trial notice — fine for trying this out, not for real customers. Real
 * use needs a paid account and a sending number, and a US number also needs
 * Twilio's short sender registration before carriers deliver at volume.
 *
 * Read when used, not at import, so a redeploy or a test never runs on what
 * the process booted with. With nothing configured it reports `handoff` and
 * sends nothing — it never pretends a text went out.
 */

const sid = () => process.env.TWILIO_ACCOUNT_SID;
const token = () => process.env.TWILIO_AUTH_TOKEN;
const from = () => process.env.TWILIO_FROM_NUMBER;
const base = () => (process.env.TWILIO_API_BASE ?? "https://api.twilio.com").replace(/\/$/, "");
const TIMEOUT_MS = 8000;

/** Exported so the request shape is testable without a network call. */
export function twilioForm(message: SmsMessage, fromNumber: string): string {
  return new URLSearchParams({ To: message.to, From: fromNumber, Body: message.body }).toString();
}

export const sms: SmsPort = {
  get status() {
    return statusFor(
      "sms", "Text messages", Boolean(sid() && token() && from()),
      "A Twilio account: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (a number you bought there).",
    );
  },

  async send(messages) {
    if (messages.length === 0) return { sent: 0 };
    const accountSid = sid(), authToken = token(), fromNumber = from();
    if (!accountSid || !authToken || !fromNumber) return { sent: 0 };

    let sent = 0;
    for (const message of messages) {
      try {
        const res = await fetch(`${base()}/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: twilioForm(message, fromNumber),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) sent++;
        else console.error(`[safehubby] Text to ${message.to.slice(0, -4)}**** failed: ${res.status}`);
      } catch (err) {
        console.error("[safehubby] Text send failed:", err instanceof Error ? err.message : err);
      }
    }
    return { sent };
  },
};
