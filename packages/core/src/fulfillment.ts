/**
 * Automatic fulfilment.
 *
 * Consumer APIs cannot do this — Uber and Lyft closed theirs to third-party
 * developers, and DoorDash has none for ordering from someone else's
 * restaurant. But the *business* APIs can, and they are real products you
 * apply for rather than partnerships you have to negotiate from scratch:
 *
 *  - **Uber for Business** ("rides for others"): an organisation books and pays
 *    for rides on someone else's behalf. This is the successor to Uber Central
 *    and is exactly the shape Safehubby needs.
 *  - **Uber Direct** / **DoorDash Drive**: last-mile dispatch. Both deliver a
 *    merchant's goods to a customer, so Safehubby has to be the merchant of
 *    record for the basket — which is a supplier agreement, not an API key.
 *
 * Each adapter therefore has three states, and the state is visible to the user
 * rather than hidden: `automatic` when credentials are configured, `handoff`
 * when they are not, and `unavailable` where the provider does not operate.
 * The app never claims to have done something it only linked to.
 */

export type FulfillmentMode = "automatic" | "handoff" | "unavailable";

export interface ProviderStatus {
  id: string;
  name: string;
  mode: FulfillmentMode;
  /** What the operator must do to move this to `automatic`. */
  requires: string;
}

export interface RideRequestInput {
  pickup: { lat: number; lng: number; label?: string };
  dropoff: { lat: number; lng: number; label?: string };
  /** Who the ride is for, when an organisation books on their behalf. */
  riderName: string;
  riderPhone?: string;
  /** Free text passed to the driver, e.g. "waiting by the side entrance". */
  note?: string;
}

export interface BookedRide {
  provider: string;
  bookingId: string;
  /** Provider-set. Safehubby never computes a fare or a driver payout. */
  fareEstimateCents: number | null;
  currency: string;
  etaMinutes: number | null;
  trackingUrl: string | null;
  driver?: { name?: string; vehicle?: string; plate?: string };
}

export interface DeliveryRequestInput {
  items: { sku: string; name: string; qty: number; priceCents: number }[];
  dropoff: { label: string; lat?: number; lng?: number };
  note?: string;
}

export interface DispatchedDelivery {
  provider: string;
  deliveryId: string;
  totalCents: number;
  etaMinutes: number | null;
  trackingUrl: string | null;
}

/** Booking a ride on someone's behalf. Implemented by the business adapters. */
export interface AutomaticRidePort {
  readonly status: ProviderStatus;
  book(input: RideRequestInput): Promise<BookedRide>;
}

/** Dispatching a basket. Safehubby is the merchant of record. */
export interface AutomaticDeliveryPort {
  readonly status: ProviderStatus;
  dispatch(input: DeliveryRequestInput): Promise<DispatchedDelivery>;
}

/**
 * Secure transport: a ride whose driver is a licensed protection professional.
 *
 * Kept as its own port rather than another entry in the ride list, because it
 * is a different product with different law behind it. Armed protective service
 * is licensed state by state in the US, the licence classes differ, and a
 * provider legal in one state may not operate in the next one over. So the
 * adapter must report coverage per location, and the app must never offer this
 * where the provider has not said it operates.
 */
export interface SecureTransportPort {
  readonly status: ProviderStatus;
  /** Whether the provider covers this pickup point, asked before it is offered. */
  coversLocation(at: { lat: number; lng: number }): Promise<boolean>;
  quote(input: RideRequestInput): Promise<SecureTransportQuote | null>;
  book(input: RideRequestInput): Promise<BookedRide>;
}

export interface SecureTransportQuote {
  provider: string;
  /** Provider-set, and materially higher than a normal ride. */
  fareEstimateCents: number;
  currency: string;
  etaMinutes: number;
  /** Shown before booking so nobody is surprised by what they summoned. */
  description: string;
  /** Surfaced in the UI: the user should know what they are agreeing to. */
  disclosures: string[];
}

/**
 * Disclosures shown before any secure-transport booking. These are not legal
 * boilerplate to bury — the whole point of the product is that the driver is
 * armed, and a passenger who did not realise that is a passenger in a situation
 * they did not consent to.
 */
export const SECURE_TRANSPORT_DISCLOSURES = [
  "Your driver is a licensed security professional and may be armed.",
  "This is a private security service, not law enforcement and not an emergency service.",
  "Fares are set by the provider and are substantially higher than a standard ride.",
  "Availability depends on licensed coverage in your area and may be limited at short notice.",
  "In an emergency, call your local emergency number first.",
];

/**
 * A personal-concierge task: a bounded, in-person job — see concierge.ts —
 * dispatched to a partner-network professional. Shaped like SecureTransportPort
 * on purpose (coverage checked before it is offered, a quote before booking),
 * because the same "never claim a provider we cannot verify" rule applies.
 */
export interface ConciergeTaskRequest {
  category: string;
  note: string;
  location: { lat: number; lng: number; label?: string };
  spendCapCents: number;
  requesterName: string;
  requesterPhone?: string;
  /** Purchasing power handed to the assistant, when a card was issued for
   *  this task — see CardIssuingPort. Never the traveler's own card. */
  card?: { last4: string; revealUrl: string };
  /** A specific assistant the subscriber picked from the roster, rather than
   *  leaving assignment to the network's own dispatch. */
  assistantId?: string;
  /** The sign-in for this assistant's account in Safehubby's employee
   *  portal (see `docs/concierge.md`) — present only the first time this
   *  assistant is booked, when the account is freshly provisioned. Forwarded
   *  so the partner network's own dispatch can relay it to the assistant
   *  through whatever channel it already uses to reach them; Safehubby has
   *  none of its own. `tempPassword` is plaintext exactly once, here, and is
   *  never stored or retrievable again — the assistant is expected to change
   *  it on first login. */
  assistantPortalCredentials?: { username: string; tempPassword: string };
}

export interface ConciergeQuote {
  provider: string;
  etaMinutes: number;
  description: string;
}

export interface BookedConciergeTask {
  provider: string;
  taskId: string;
  etaMinutes: number | null;
  trackingUrl: string | null;
  assistant?: { name?: string; phone?: string };
}

/** A profile from the partner network's own roster — see AssistantProfile in
 *  concierge.ts, which this maps onto after the id-shaped bits are stripped. */
export interface AssistantListing {
  id: string;
  name: string;
  bio?: string;
  photoUrl?: string;
  categories: string[];
  maxConcurrentCustomers: number;
  currentCustomers: number;
}

export interface ConciergePort {
  readonly status: ProviderStatus;
  /** Whether the partner network covers this location, asked before it is offered. */
  coversLocation(at: { lat: number; lng: number }): Promise<boolean>;
  /** The roster available for a category near a location, so a subscriber
   *  can pick a specific assistant instead of leaving it to dispatch. Returns
   *  an empty list rather than throwing when the network has nobody to show —
   *  an empty roster is a normal answer, not a failure. */
  listAssistants(input: { category: string; location: { lat: number; lng: number } }): Promise<AssistantListing[]>;
  quote(input: ConciergeTaskRequest): Promise<ConciergeQuote | null>;
  book(input: ConciergeTaskRequest): Promise<BookedConciergeTask>;
}

/**
 * A single-use, spend-capped virtual card, issued for one concierge task so
 * the assistant can actually pay for what the task needs — see
 * `docs/concierge.md` and `apps/api/src/adapters/cards.ts`.
 *
 * Only ever masked. Nothing in `packages/core` or the traveler-facing API
 * carries a full card number — the same rule `PaymentMethodOnFile` already
 * follows for the card on file — because there is nothing here worth leaking
 * past the last four digits. `revealUrl`, when a provider supports it, is the
 * one-time link the *assistant's* dispatch system uses to see the full number;
 * it is never returned to the traveler.
 */
export interface IssuedCard {
  id: string;
  last4: string;
  network: string;
  expMonth: number;
  expYear: number;
  revealUrl: string | null;
}

export interface CardIssuingPort {
  readonly status: ProviderStatus;
  /** Issues one card, capped at exactly `capCents` — no buffer, same
   *  reasoning as `authorizeExactHold` in payment.ts. */
  issueCard(input: { capCents: number; currency: string; label: string; expiresAt: string }): Promise<IssuedCard>;
  /** Kills a card early — a task that ends before it is used should not
   *  leave a live, spend-capped card sitting active. Best-effort: a card
   *  that already expired on its own is not an error to cancel again. */
  cancelCard(cardId: string): Promise<void>;
}

export function statusFor(id: string, name: string, configured: boolean, requires: string): ProviderStatus {
  return { id, name, mode: configured ? "automatic" : "handoff", requires };
}

/**
 * Whether the app may describe an action as done automatically. Consumers use
 * this to pick copy, so a handoff is never announced as a completed booking.
 */
export function isAutomatic(status: ProviderStatus): boolean {
  return status.mode === "automatic";
}
