import type { CardIssuingPort, ProviderStatus } from "@safehubby/core";
import { lithicEmbedSession, lithicEnvironment, lithicTaskCards } from "./lithic-cards.ts";
import { cardViewKey, isStripeCardId, stripeIssuingReady, stripeTaskCards } from "./stripe-cards.ts";

/**
 * Task cards: single-use, spend-capped virtual cards, from Stripe Issuing or
 * Lithic.
 *
 * Stripe is used as soon as Stripe Issuing is set up (STRIPE_SECRET_KEY and
 * STRIPE_ISSUING_CARDHOLDER), so payments and cards sit in one account;
 * Lithic otherwise. `CARD_ISSUER=stripe|lithic` forces one. New cards come
 * from the issuer in use, but a card is always cancelled and shown by the
 * issuer that made it (Stripe's ids start `ic_`), so switching never strands
 * a card that is already out.
 */
export const cardIssuer = (): "stripe" | "lithic" => {
  const forced = process.env.CARD_ISSUER?.trim();
  if (forced === "stripe" || forced === "lithic") return forced;
  return stripeIssuingReady() ? "stripe" : "lithic";
};
const active = () => (cardIssuer() === "stripe" ? stripeTaskCards : lithicTaskCards);
const issuerOf = (cardId: string) => (isStripeCardId(cardId) ? stripeTaskCards : lithicTaskCards);

/** The task-card issuer, read on every call so a setting takes effect without a code change. */
export const taskCards: CardIssuingPort = {
  get status() { return active().status; },
  set status(value) { (active() as { status: ProviderStatus }).status = value; },
  issueCard: (input) => active().issueCard(input),
  revealCard: (id) => issuerOf(id).revealCard(id),
  cancelCard: (id) => issuerOf(id).cancelCard(id),
};

/** What the browser needs to show one card, from whichever issuer made it. */
export type CardView =
  | { provider: "stripe"; ephemeralKeySecret: string }
  | { provider: "lithic"; embedSession: string; environment: "sandbox" | "production" };

/**
 * Stripe needs a nonce from Stripe.js in the page first, so its first call
 * returns null and the browser asks again with the nonce. Lithic needs only
 * the page's origin, which is the app's public address. Either way the number
 * goes from the issuer to the browser — never through this server.
 */
export async function cardViewFor(cardId: string, nonce?: string): Promise<CardView | null> {
  if (isStripeCardId(cardId)) {
    if (!nonce) return null;
    return { provider: "stripe", ephemeralKeySecret: await cardViewKey(cardId, nonce) };
  }
  const origin = publicOrigin();
  if (!origin) throw new Error("Set SAFEHUBBY_PUBLIC_URL to the app's https address so Lithic can show the card there.");
  return { provider: "lithic", embedSession: await lithicEmbedSession(cardId, origin), environment: lithicEnvironment() };
}

/** The app's https origin, for Lithic's embed (which refuses anything else). */
function publicOrigin(): string | null {
  try {
    const url = new URL(process.env.SAFEHUBBY_PUBLIC_URL ?? "");
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
