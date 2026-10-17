import type { CardIssuingPort, IssuedCard, ProviderStatus } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Single-use, spend-capped virtual cards for tasks, issued with Stripe
 * Issuing — the same Stripe account that charges customers.
 *
 * The assistant needs to pay for what a task asks for without ever touching
 * the customer's card, so each task gets its own virtual card, limited to
 * exactly the task's spend limit and cancelled the moment the task ends.
 *
 * Cards hang off one company cardholder created once in the Stripe dashboard
 * (Issuing → Cardholders → Company), named by `STRIPE_ISSUING_CARDHOLDER`.
 * Stripe Issuing must be enabled on the account.
 *
 * The full number is never fetched here: Stripe shows it to the assistant
 * through its own Issuing Elements, which keeps Safehubby out of PCI scope.
 * Until that view is wired into the portal, `revealCard` returns null and the
 * portal says the number is not available here.
 */
const API = (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");
const ready = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ISSUING_CARDHOLDER);

async function stripeForm(path: string, fields: Record<string, string | number>): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(Object.entries(fields).map(([k, v]): [string, string] => [k, String(v)])).toString(),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message ?? `Stripe Issuing rejected ${path}: ${res.status}`);
  }
  return res.json();
}

let statusOverride: ProviderStatus | undefined;

export const taskCards: CardIssuingPort = {
  // A getter so the key can be set without a restart; the setter lets tests stand a status in.
  get status() {
    return statusOverride ?? statusFor(
      "stripe-issuing", "Stripe Issuing", ready(),
      "Stripe Issuing enabled on your Stripe account, a company cardholder created once in the dashboard, then STRIPE_SECRET_KEY and STRIPE_ISSUING_CARDHOLDER.",
    );
  },
  set status(value) { statusOverride = value; },

  async issueCard(input): Promise<IssuedCard> {
    if (!ready()) throw new Error("Stripe Issuing is not configured.");
    const card = await stripeForm("/v1/issuing/cards", {
      cardholder: process.env.STRIPE_ISSUING_CARDHOLDER!,
      currency: input.currency.toLowerCase(),
      type: "virtual",
      status: "active",
      // The whole limit, once — the cap is exact, not something to swipe twice.
      "spending_controls[spending_limits][0][amount]": input.capCents,
      "spending_controls[spending_limits][0][interval]": "all_time",
      "metadata[label]": input.label.slice(0, 200),
      "metadata[expires_at]": input.expiresAt,
    });
    return {
      id: String(card.id ?? ""),
      last4: String(card.last4 ?? "").slice(-4),
      network: card.brand ?? "Visa",
      expMonth: Number(card.exp_month ?? 0),
      expYear: Number(card.exp_year ?? 0),
      revealUrl: null,
    };
  },

  async revealCard(): Promise<string | null> {
    return null;
  },

  async cancelCard(cardId: string): Promise<void> {
    if (!ready()) return;
    await stripeForm(`/v1/issuing/cards/${encodeURIComponent(cardId)}`, { status: "canceled" });
  },
};

/** The Stripe API version the ephemeral key is made for; Stripe.js's Issuing
 *  Elements need the key and the call to agree on one. */
export const ISSUING_ELEMENTS_API_VERSION = "2024-06-20";

/**
 * A short-lived key that lets Stripe's own Issuing Elements, in the
 * assistant's browser, show this one card's number, expiry and CVC. The
 * number goes from Stripe straight to that browser — never through this
 * server. The nonce comes from Stripe.js (`createEphemeralKeyNonce`), which
 * ties the key to the page that asked for it.
 */
export async function cardViewKey(cardId: string, nonce: string): Promise<string> {
  if (!ready()) throw new Error("Stripe Issuing is not configured.");
  const res = await fetch(`${API}/v1/ephemeral_keys`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": ISSUING_ELEMENTS_API_VERSION,
    },
    body: new URLSearchParams({ issuing_card: cardId, nonce }).toString(),
  });
  if (!res.ok) throw new Error(`Stripe would not open this card: ${res.status}`);
  const key = (await res.json()) as { secret?: string };
  if (!key.secret) throw new Error("Stripe returned no key for this card.");
  return key.secret;
}
