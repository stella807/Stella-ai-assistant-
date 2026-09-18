import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Alert, AssistantAdjustment, AssistantPayout, CarePackageAuth, CarePackageOrder, Charge, ConciergeTask, Crew,
  DeskTask, DriverApplication, GameRound, MasterAccount, MasterAuditEntry, NewsletterSubscriber, NightOut,
  PaymentMethodOnFile, PendingOrder,
  HiredAssistant, PreAuthorization, PushDevice, StaffApplication, TextMessage,
  ShareGrant, Subscription, VoiceMessage, PriceOverride,
} from "@safehubby/core";
import type { EliteBooking, PickupRequest, PlanId, PointEntry, Redemption, Referral } from "@safehubby/core";

/** One member's RSVP to one `EliteEvent` (elite.ts) — a flat list rather
 *  than nested under the event, the same shape `Referral` and the other
 *  many-to-one records here use, so it survives a catalogue entry changing
 *  shape later. */
export interface EliteEventRsvp {
  id: string;
  eventId: string;
  travelerId: string;
  createdAt: string;
}

/**
 * One month's spending-allowance card for one Elite member — see
 * `eliteSpendingAllowanceCents` in billing.ts. Funded by Safehubby, not held
 * against the member's own card, which is the whole difference from a
 * concierge task's card (`ConciergeTask.card`). No `revealUrl` here on
 * purpose: like the task card, the one-time reveal link is fetched fresh
 * from Revolut each time (`revolutCards.revealCard`) rather than stored, so
 * there is never a stale link sitting in the database.
 */
export interface EliteSpendingCard {
  id: string;
  travelerId: string;
  /** "2026-09" — one card per member per calendar month; a new month means
   *  a new card, never a topped-up old one. */
  monthKey: string;
  capCents: number;
  cardId: string;
  last4: string;
  network: string;
  expMonth: number;
  expYear: number;
  issuedAt: string;
}

export interface Traveler {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  // The canonical union from billing.ts rather than a copy of it — a copy
  // silently goes stale the moment a tier is added.
  planId: PlanId;
  homeLabel: string;
  /** Where "home" actually is, in coordinates — `homeLabel` alone is a name
   *  on a screen, not a place a driver or an errand runner can be sent to.
   *  Optional because plenty of features (check-ins, drink logging) never
   *  need it; set once via `POST /api/account/address` and reused by
   *  anything that has to send a real person somewhere, rather than asking
   *  again on every request. */
  homeAddress?: { lat: number; lng: number; label: string };
  emergencyContacts: { name: string; phone: string }[];
  /** Their own code to share. Minted at signup — see promotions.ts. */
  referralCode?: string;
  /**
   * Whether they've opted into the Wingman Club — see wingman-club.ts.
   * Deliberately a plain flag with no charge behind it yet, the same
   * "modeled and disclosed before it's live" honesty `driver-pay.ts` uses
   * for driver payouts: the pricing and roster-economics are real and
   * tested, but nothing here moves money. Wiring real dues would follow the
   * same subscription/wallet pattern billing.ts already uses for plans —
   * this flag exists so the roster size behind the economics is a real
   * count rather than a hypothetical one, not to pretend dues are collected.
   */
  clubMember?: boolean;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * An assistant's own sign-in, entirely separate from `Traveler`/`Session` —
 * two distinct areas of the app, two distinct identity spaces. Keyed by
 * `assistantId` (the partner network's own id), one credential per
 * assistant. `mustChangePassword` is true from provisioning until the
 * assistant sets their own password — see `provisionAssistantCredentials`
 * in routes.ts.
 */
export interface AssistantCredential {
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AssistantSession {
  token: string;
  assistantId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * The credential behind a `MasterAccount` (master-access.ts) — a single
 * long random key rather than a username and password, because a master
 * account is provisioned for one specific named person by whoever already
 * holds `SAFEHUBBY_ADMIN_KEY` (see `POST /api/admin/master-accounts`), not
 * self-served. `keyHash` is what a login proves against; the plaintext key
 * exists once, at creation, the same "shown once, hashed thereafter"
 * discipline `AssistantCredential`'s temp password already follows.
 */
export interface MasterCredential {
  keyHash: string;
  createdAt: string;
}

export interface MasterSession {
  token: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Where a biweekly payout is sent — entered by the assistant themselves in
 * their own portal, never by Safehubby staff. The routing number and account
 * number are encrypted at rest (`sealPayoutDestination`/`openPayoutDestination`
 * in crypto.ts) the moment they're written, the same discipline location
 * pings get; `accountNumberLast4` is kept in the clear only so the portal can
 * show "ending in 1234" without decrypting anything just to render a screen.
 */
export interface AssistantPayoutDestination {
  accountHolderName: string;
  routingNumberEnc: string;
  accountNumberEnc: string;
  accountNumberLast4: string;
  updatedAt: string;
}

/** Care-package state hangs off the night rather than off core's NightOut,
 *  which keeps the domain types free of a circular import. */
export interface CarePackageState {
  auth: CarePackageAuth | null;
  orders: CarePackageOrder[];
}

export interface Db {
  travelers: Traveler[];
  sessions: Session[];
  crews: Crew[];
  carePackages: Record<string, CarePackageState>;
  nights: NightOut[];
  grants: ShareGrant[];
  alerts: Alert[];
  points: Record<string, PointEntry[]>;
  redemptions: Record<string, Redemption[]>;
  rounds: GameRound[];
  pendingOrders: Record<string, PendingOrder[]>;
  partyCarts: Record<string, { sku: string; qty: number }[]>;
  paymentMethods: Record<string, PaymentMethodOnFile>;
  /** The traveler's Stripe Customer id, created the first time they open a
   *  payment sheet that needs one. Kept so a member ends up with one Customer
   *  rather than one per visit — Stripe only reuses a method off-session when
   *  it is attached to one. See `ensureStripeCustomer` in adapters/stripe.ts. */
  stripeCustomers: Record<string, string>;
  holds: PreAuthorization[];
  /** One ledger for every charge — subscription, ride, delivery — so a single
   *  screen can show the whole account. See wallet.ts. */
  charges: Charge[];
  subscriptions: Record<string, Subscription>;
  conciergeTasks: ConciergeTask[];
  /** The desk half of the assistant's job — appointments, reminders, the
   *  email nobody wants to write. Included in the plan rather than charged,
   *  so these carry no hold and no card. See desk-tasks.ts. */
  deskTasks: DeskTask[];
  eliteBookings: EliteBooking[];
  /** RSVPs to Elite's own member events — see elite.ts's `ELITE_EVENTS`. */
  eliteEventRsvps: EliteEventRsvp[];
  /** One issued card per Elite member per month — see `EliteSpendingCard`. */
  eliteSpendingCards: EliteSpendingCard[];
  /** Requests to be picked up by a driver Safehubby actually hired — see
   *  ride-coordination.ts. Replaces the old Uber/Lyft hand-off entirely. */
  pickupRequests: PickupRequest[];
  referrals: Referral[];
  voiceMessages: VoiceMessage[];
  /** Typed messages on a task's thread. Sealed at rest alongside the voice
   *  clips and photos — see sealTaskMessages in crypto.ts. */
  textMessages: TextMessage[];
  /** The employee portal's own sign-in — see AssistantCredential/AssistantSession
   *  above. Provisioned the first time an assistant is booked; see routes.ts
   *  provisionAssistantCredentials. */
  assistantCredentials: Record<string, AssistantCredential>;
  assistantSessions: AssistantSession[];
  /** Bank details an assistant entered for themselves — see
   *  AssistantPayoutDestination above. */
  assistantPayoutDestinations: Record<string, AssistantPayoutDestination>;
  /** The record of every biweekly payout actually sent — see payroll.ts and
   *  routes.ts's runPayroll. */
  payouts: AssistantPayout[];
  /** Clawbacks against an assistant's future pay — see AssistantAdjustment
   *  in payroll.ts and disputeConciergeTask in routes.ts. */
  assistantAdjustments: AssistantAdjustment[];
  driverApplications: DriverApplication[];
  /** Applications for the roles that do not drive — see staff-applications.ts. */
  staffApplications: StaffApplication[];
  /** Safehubby's own field workers, hired from approved applications. This
   *  is what makes a hire dispatchable — see roster.ts. */
  assistants: HiredAssistant[];
  /** The launch mailing list. Kept whole, opt-outs included, so a re-import
   *  cannot quietly resubscribe somebody who left. */
  newsletterSubscribers: NewsletterSubscriber[];
  pushDevices: PushDevice[];
  /** Who has master (owner/secretary) access — see master-access.ts and the
   *  `POST /api/admin/master-accounts` bootstrap. Provisioned by whoever
   *  already holds `SAFEHUBBY_ADMIN_KEY`, never self-served. */
  masterAccounts: MasterAccount[];
  masterCredentials: Record<string, MasterCredential>;
  masterSessions: MasterSession[];
  /** Every master-access read, so access is attributable rather than
   *  indistinguishable from a breach — see `recordAccess` in
   *  master-access.ts and its own doc comment on why this exists. */
  masterAuditLog: MasterAuditEntry[];
  /** Dynamic price overrides for all roles, allowing owner to adjust rates
   *  and maintain audit trail of pricing changes. */
  priceOverrides: PriceOverride[];
}

const EMPTY: Db = {
  travelers: [], sessions: [], crews: [], carePackages: {}, nights: [], grants: [], alerts: [], points: {}, redemptions: {}, rounds: [], pendingOrders: {}, partyCarts: {},
  paymentMethods: {}, stripeCustomers: {}, holds: [], charges: [], subscriptions: {}, conciergeTasks: [], deskTasks: [], eliteBookings: [], eliteEventRsvps: [], eliteSpendingCards: [], pickupRequests: [], referrals: [], voiceMessages: [], textMessages: [],
  assistantCredentials: {}, assistantSessions: [],
  assistantPayoutDestinations: {}, payouts: [], assistantAdjustments: [],
  driverApplications: [], staffApplications: [], assistants: [], newsletterSubscribers: [], pushDevices: [],
  masterAccounts: [], masterCredentials: {}, masterSessions: [], masterAuditLog: [],
  priceOverrides: [],
};

/** What routes need from a store, so the file and Postgres backings are
 *  interchangeable and the tested behaviour is the deployed behaviour. */
export interface StoreLike {
  readonly data: Db;
  update(fn: (db: Db) => void): void;
  reset(seed: Db): void;
  save(): void;
}

/**
 * Flat-file JSON persistence. Deliberately boring: this is a prototype backend,
 * and the interesting logic lives in @safehubby/core, so swapping this for
 * Postgres later touches only this file.
 *
 * Used for development and tests. Deployments use PostgresStore, which encrypts
 * location history before it leaves the process — see crypto.ts and SECURITY.md.
 */
export class Store implements StoreLike {
  #path: string;
  #db: Db;

  constructor(path = join(process.cwd(), ".safehubby", "db.json")) {
    this.#path = path;
    this.#db = this.#load();
  }

  #load(): Db {
    if (!existsSync(this.#path)) return structuredClone(EMPTY);
    try {
      return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(this.#path, "utf8")) };
    } catch {
      // A corrupt dev database should not wedge the server on boot.
      return structuredClone(EMPTY);
    }
  }

  get data(): Db {
    return this.#db;
  }

  save(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(this.#path, JSON.stringify(this.#db, null, 2));
  }

  update(fn: (db: Db) => void): void {
    fn(this.#db);
    this.save();
  }

  reset(seed: Db): void {
    this.#db = seed;
    this.save();
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
