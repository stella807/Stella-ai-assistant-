import type { CardIssuingPort, IssuedCard } from "@safehubby/core";
import { statusFor } from "@safehubby/core";
import { postJson } from "./fulfillment.ts";

/**
 * Single-use, spend-capped virtual cards for concierge tasks, issued through
 * Revolut Business.
 *
 * What this pays for: the whole point of a concierge task is that the
 * assistant needs to spend money on the subscriber's behalf — grab something,
 * cover a fare, buy what a task needs. Handing them the subscriber's actual
 * card is the thing this app exists to avoid doing carelessly, so Safehubby
 * issues its own card instead, capped at exactly the task's spend cap
 * (`authorizeExactHold` reserves the matching amount on the subscriber's own
 * card at the same time — see routes.ts), and kills the card the moment the
 * task ends.
 *
 * Verified against Revolut's public Business API docs
 * (developer.revolut.com/docs/business): the card-issuing surface there is
 * part of expense management, scoped to members of your own Revolut Business
 * team — there is no endpoint for handing a card to an arbitrary third party
 * who isn't a team member. That is a real constraint this adapter cannot
 * paper over: using it for real means either onboarding the partner network's
 * assistants as authorized cardholders on Safehubby's own Revolut Business
 * account (a vendor-management relationship to set up, not just an API key),
 * or having the partner hold its own Revolut account that Safehubby funds by
 * transfer per task instead of issuing cards directly. This adapter assumes
 * the former. Its endpoint shapes below are a best-effort mapping of Revolut's
 * documented Business API, not verified against a live sandbox — this file is
 * the one place to correct if the real shapes differ.
 *
 * Authentication is genuinely different from every other adapter in this
 * codebase: Revolut's Business API uses OAuth2 with a certificate-bound
 * client (a private key registered with Revolut, used to sign a JWT or for
 * mTLS), not a bare bearer token issued once. `REVOLUT_API_KEY` here stands in
 * for whatever short-lived access token that exchange produces — the exchange
 * itself, and refreshing the token before it expires, are not implemented and
 * have to sit in front of this file in a real deployment.
 */

const REVOLUT_BASE = process.env.REVOLUT_API_BASE;
const REVOLUT_KEY = process.env.REVOLUT_API_KEY;

export const revolutCards: CardIssuingPort = {
  status: statusFor(
    "revolut-cards", "Revolut Business", Boolean(REVOLUT_BASE && REVOLUT_KEY),
    "A Revolut Business account with its OAuth2 client-credentials flow completed for the card-issuing scope (see the adapter's doc comment for why this isn't a bare API key), then REVOLUT_API_BASE and REVOLUT_API_KEY.",
  ),

  async issueCard(input): Promise<IssuedCard> {
    if (!REVOLUT_BASE || !REVOLUT_KEY) throw new Error("Revolut Business is not configured.");

    const data = await postJson(
      `${REVOLUT_BASE.replace(/\/$/, "")}/1.0/cards`,
      { authorization: `Bearer ${REVOLUT_KEY}` },
      {
        // A single-use, one-transaction limit — the cap is exact, not a
        // ceiling this card can be swiped against twice.
        spend_limit: { amount: input.capCents, currency: input.currency },
        single_use: true,
        label: input.label,
        expires_at: input.expiresAt,
      },
    );

    return {
      id: String(data.id ?? ""),
      last4: String(data.last_digits ?? data.last4 ?? "").slice(-4),
      network: data.card_network ?? data.network ?? "Visa",
      expMonth: Number(data.expiry_month ?? 0),
      expYear: Number(data.expiry_year ?? 0),
      revealUrl: data.reveal_url ?? null,
    };
  },

  /**
   * Revolut's sensitive-card-details endpoint, as a one-time link rather than
   * the pan itself — see `revealCard`'s doc in core for why that distinction
   * matters. Endpoint shape is the same best-effort mapping of Revolut's
   * documented Business API as the rest of this file, not verified against a
   * live sandbox.
   */
  async revealCard(cardId: string): Promise<string | null> {
    if (!REVOLUT_BASE || !REVOLUT_KEY) return null;
    const res = await fetch(
      `${REVOLUT_BASE.replace(/\/$/, "")}/1.0/cards/${encodeURIComponent(cardId)}/sensitive-details`,
      { method: "POST", headers: { authorization: `Bearer ${REVOLUT_KEY}` } },
    );
    // A cancelled or expired card has no details to show. That is a normal
    // answer, not a failure — the caller says so instead of showing a dead link.
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`Revolut card reveal failed: ${res.status}`);
    const data = (await res.json()) as { reveal_url?: string; url?: string };
    return data.reveal_url ?? data.url ?? null;
  },

  async cancelCard(cardId: string): Promise<void> {
    if (!REVOLUT_BASE || !REVOLUT_KEY) return;
    const res = await fetch(`${REVOLUT_BASE.replace(/\/$/, "")}/1.0/cards/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${REVOLUT_KEY}` },
    });
    // A card that already expired or was already terminated is not a failure
    // to cancel again — that would turn routine cleanup into a false alarm.
    if (!res.ok && res.status !== 404) throw new Error(`Revolut card cancel failed: ${res.status}`);
  },
};
