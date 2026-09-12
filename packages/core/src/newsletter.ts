import type { Iso8601 } from "./types.ts";

/**
 * The launch mailing list: people who want to be told when the service is
 * actually running.
 *
 * This exists because of what the pre-launch window is. Somebody who finds
 * Safehubby in October cannot use it until December (see `SERVICE_LIVE_AT`),
 * and the honest thing to offer them is not a signup that does nothing but a
 * way to be told when it does. It is also the cheapest list this company will
 * ever build: people who arrived before there was anything to arrive for.
 *
 * **Nothing here sends mail.** There is no email provider wired into this
 * app, and this module deliberately does not pretend otherwise — it stores an
 * address and a consent timestamp, and the API reports delivery as `handoff`
 * through the same `ProviderStatus` contract every other integration uses. A
 * "check your inbox" message with no mail server behind it is the exact class
 * of lie the fulfilment rules in `fulfillment.ts` exist to prevent, and it is
 * worse here than elsewhere: the whole promise is a message that arrives
 * later.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** RFC 5321 caps an address at 254 characters; anything longer is not an
 *  address, it is someone probing the field. */
const MAX_EMAIL_CHARS = 254;

export type NewsletterSource = "landing" | "signup" | "share" | "other";

export interface NewsletterSubscriber {
  id: string;
  email: string;
  /** Where they subscribed, so the list can be read for what actually
   *  brought people in rather than guessed at. */
  source: NewsletterSource;
  subscribedAt: Iso8601;
  /** Set when they unsubscribe. The record is kept rather than deleted: an
   *  address that has opted out has to stay known, or the next import quietly
   *  re-subscribes it. Deletion on request is a separate, deliberate act —
   *  see `account.ts` for how the app handles erasure. */
  unsubscribedAt?: Iso8601;
  /** The only thing that authorizes an unsubscribe. Random, per-subscriber,
   *  and the reason a one-click link in an email cannot be used to unsubscribe
   *  somebody else by editing the address in the URL. */
  token: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidNewsletterEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && normalized.length <= MAX_EMAIL_CHARS && EMAIL_RE.test(normalized);
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const UNSUBSCRIBE_TOKEN_LENGTH = 32;

/** An unguessable unsubscribe token. `random` is injectable so tests are
 *  deterministic; production passes a CSPRNG-backed source. */
export function newUnsubscribeToken(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < UNSUBSCRIBE_TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

export interface SubscribeInput {
  id: string;
  email: string;
  source?: NewsletterSource;
  token: string;
  now: Date;
}

export function subscribeToNewsletter(input: SubscribeInput): NewsletterSubscriber {
  if (!isValidNewsletterEmail(input.email)) {
    throw new Error("Enter a valid email address.");
  }
  return {
    id: input.id,
    email: normalizeEmail(input.email),
    source: input.source ?? "landing",
    subscribedAt: input.now.toISOString(),
    token: input.token,
  };
}

export function isSubscribed(sub: NewsletterSubscriber): boolean {
  return !sub.unsubscribedAt;
}

/**
 * Adds an address to the list, or re-subscribes one that had opted out.
 *
 * Idempotent by design. Someone who taps the button twice, or who signed up
 * in October and again in November, must not end up on the list twice — a
 * duplicate is two copies of every message, which is the fastest way to teach
 * people to mark this as spam. Returns the list and whether anything changed,
 * so the caller can answer honestly without inspecting it.
 */
export function addSubscriber(
  list: NewsletterSubscriber[],
  input: SubscribeInput,
): { list: NewsletterSubscriber[]; subscriber: NewsletterSubscriber; alreadyOnList: boolean } {
  const fresh = subscribeToNewsletter(input);
  const existing = list.find((s) => s.email === fresh.email);
  if (!existing) {
    return { list: [...list, fresh], subscriber: fresh, alreadyOnList: false };
  }
  if (isSubscribed(existing)) {
    return { list, subscriber: existing, alreadyOnList: true };
  }
  // Previously opted out and now back: clear the opt-out and keep the
  // original record, so the id and token people may already hold still work.
  const revived: NewsletterSubscriber = {
    ...existing,
    unsubscribedAt: undefined,
    subscribedAt: fresh.subscribedAt,
    source: fresh.source,
  };
  return {
    list: list.map((s) => (s.email === revived.email ? revived : s)),
    subscriber: revived,
    alreadyOnList: false,
  };
}

/**
 * Removes an address from the list, on proof of its own token.
 *
 * Unsubscribing is authorized by the token and not by the address, so nobody
 * can opt somebody else out by guessing their email. A wrong token is
 * reported as not-found rather than as "wrong token" — confirming that an
 * address is on the list is itself a disclosure.
 */
export function unsubscribe(
  list: NewsletterSubscriber[],
  email: string,
  token: string,
  now: Date,
): { list: NewsletterSubscriber[]; removed: boolean } {
  const target = normalizeEmail(email);
  const match = list.find((s) => s.email === target && s.token === token);
  if (!match) return { list, removed: false };
  if (!isSubscribed(match)) return { list, removed: true };
  return {
    list: list.map((s) =>
      s.email === target ? { ...s, unsubscribedAt: now.toISOString() } : s),
    removed: true,
  };
}

/** Who would actually receive a launch announcement. */
export function activeSubscribers(list: NewsletterSubscriber[]): NewsletterSubscriber[] {
  return list.filter(isSubscribed);
}
