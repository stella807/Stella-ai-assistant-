import type { CardIssuingPort, IssuedCard, ProviderStatus } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Task cards through Lithic (lithic.com): one virtual card per task, capped at
 * the task's spend limit for the life of the card, closed when the task ends.
 * The number is never fetched here — Lithic's embedded card shows it to the
 * assistant straight from Lithic, using a short-lived session this server
 * asks for (`lithicEmbedSession`).
 *
 * `LITHIC_API_KEY` is the key; `LITHIC_ENV=production` points at the live API,
 * anything else at the sandbox, so a key pasted in for testing can never move
 * real money by accident.
 */
export const lithicBase = () =>
  process.env.LITHIC_ENV === "production" ? "https://api.lithic.com/v1" : "https://sandbox.lithic.com/v1";
export const lithicEnvironment = () => (process.env.LITHIC_ENV === "production" ? "production" : "sandbox");
const ready = () => Boolean(process.env.LITHIC_API_KEY);

async function lithic(path: string, method: "GET" | "POST" | "PATCH", body?: unknown, idempotencyKey?: string): Promise<any> {
  const res = await fetch(`${lithicBase()}${path}`, {
    method,
    headers: {
      // Lithic takes the bare key — no "Bearer".
      authorization: process.env.LITHIC_API_KEY!,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string; debugging_request_id?: string } | null;
    throw new Error(detail?.message ?? `Lithic rejected ${path}: ${res.status}`);
  }
  return res.json();
}

let statusOverride: ProviderStatus | undefined;

export const lithicTaskCards: CardIssuingPort = {
  get status() {
    return statusOverride ?? statusFor(
      "lithic", "Lithic", ready(),
      "An approved Lithic card program, then LITHIC_API_KEY (and LITHIC_ENV=production once it is live).",
    );
  },
  set status(value) { statusOverride = value; },

  async issueCard(input): Promise<IssuedCard> {
    if (!ready()) throw new Error("Lithic is not configured.");
    const card = await lithic("/cards", "POST", {
      type: "VIRTUAL",
      state: "OPEN",
      memo: input.label.slice(0, 100),
      // The whole limit, once, for the life of the card.
      spend_limit: input.capCents,
      spend_limit_duration: "FOREVER",
    });
    const exp = String(card.exp_year ?? "");
    return {
      id: String(card.token ?? ""),
      last4: String(card.last_four ?? "").slice(-4),
      network: "Visa",
      expMonth: Number(card.exp_month ?? 0),
      expYear: Number(exp.length === 2 ? `20${exp}` : exp),
      revealUrl: null,
    };
  },

  async revealCard(): Promise<string | null> {
    return null;
  },

  async cancelCard(cardId: string): Promise<void> {
    if (!ready()) return;
    // Closed for good, not paused: a task card is never reused.
    await lithic(`/cards/${encodeURIComponent(cardId)}`, "PATCH", { state: "CLOSED" });
  },
};

/**
 * A short-lived session that lets Lithic's embedded card, on `targetOrigin`,
 * show this one card's number, expiry and CVV. Valid for at most ten minutes.
 */
export async function lithicEmbedSession(cardId: string, targetOrigin: string): Promise<string> {
  if (!ready()) throw new Error("Lithic is not configured.");
  const res = await lithic(`/cards/${encodeURIComponent(cardId)}/embed`, "POST", {
    type: "CARD_EMBED",
    target_origin: targetOrigin,
  });
  if (!res.session) throw new Error("Lithic returned no session for this card.");
  return String(res.session);
}
