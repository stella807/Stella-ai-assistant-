import type { PushMessage, PushPort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Delivering the guardian's push.
 *
 * Provider-agnostic on purpose, the same way secure transport is. The obvious
 * target is Firebase Cloud Messaging, which reaches both Android and iOS
 * through its APNs bridge and so keeps this to one integration — but FCM's
 * HTTP v1 API authenticates with a short-lived OAuth2 access token minted from
 * a service-account key, not a static header. Its legacy static server key was
 * switched off in 2024.
 *
 * Rather than write an unverifiable JWT-signing flow against an endpoint this
 * has never been run against, the adapter posts a documented body to whatever
 * `PUSH_API_URL` names, with `PUSH_API_KEY` as a bearer token. Point it at a
 * relay that holds the service-account key and mints the token, or at any
 * provider that takes a bearer credential. The mapping is one function; see
 * docs/push.md for the shape and what to check before launch.
 *
 * With nothing configured it reports `handoff` and sends nothing. It never
 * pretends to have delivered — a guardian who believes they will be woken and
 * will not be is worse off than one who knows the app cannot reach them.
 */

const PUSH_URL = process.env.PUSH_API_URL;
const PUSH_KEY = process.env.PUSH_API_KEY;
const TIMEOUT_MS = 8000;

/** Exported so the body shape is testable without a network call. */
export function pushPayload(messages: PushMessage[]) {
  return {
    messages: messages.map((m) => ({
      token: m.token,
      platform: m.platform,
      title: m.title,
      body: m.body,
      // APNs calls this interruption-level; FCM maps it onto priority. Both
      // understand "this one breaks through Focus" versus "this one waits".
      interruption_level: m.interruption,
      // So a tap can open straight to the night rather than the app's front door.
      data: { alertId: m.alertId, nightId: m.nightId },
    })),
  };
}

export const push: PushPort = {
  status: statusFor(
    "push", "Push notifications", Boolean(PUSH_URL && PUSH_KEY),
    "A push sender that accepts a bearer token — FCM HTTP v1 behind a relay, or any provider — then PUSH_API_URL and PUSH_API_KEY.",
  ),

  async send(messages: PushMessage[]) {
    if (messages.length === 0) return { sent: 0, failed: 0 };
    if (!PUSH_URL || !PUSH_KEY) {
      // Loud in the log rather than silent: in development this is the only
      // sign that an alert would have reached someone.
      console.info(`[safehubby] push not configured — ${messages.length} notification(s) not sent`);
      return { sent: 0, failed: messages.length };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(PUSH_URL, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${PUSH_KEY}` },
        body: JSON.stringify(pushPayload(messages)),
      });
      if (!res.ok) {
        console.warn(`[safehubby] push provider ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
        return { sent: 0, failed: messages.length };
      }
      return { sent: messages.length, failed: 0 };
    } catch (err) {
      console.warn(`[safehubby] push failed: ${err instanceof Error ? err.message : "unknown"}`);
      return { sent: 0, failed: messages.length };
    } finally {
      clearTimeout(timer);
    }
  },
};
