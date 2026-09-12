import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Alert, AssistantAdjustment, AssistantPayout, CarePackageAuth, CarePackageOrder, Charge, ConciergeTask, Crew,
  DriverApplication, GameRound, NightOut, PaymentMethodOnFile, PendingOrder, PreAuthorization, PushDevice,
  ShareGrant, Subscription, VoiceMessage,
} from "@safehubby/core";
import type { EliteBooking, PlanId, PointEntry, Redemption, Referral } from "@safehubby/core";

export interface Traveler {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  // The canonical union from billing.ts rather than a copy of it — a copy
  // silently goes stale the moment a tier is added.
  planId: PlanId;
  homeLabel: string;
  emergencyContacts: { name: string; phone: string }[];
  /** Their own code to share. Minted at signup — see promotions.ts. */
  referralCode?: string;
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
  holds: PreAuthorization[];
  /** One ledger for every charge — subscription, ride, delivery — so a single
   *  screen can show the whole account. See wallet.ts. */
  charges: Charge[];
  subscriptions: Record<string, Subscription>;
  conciergeTasks: ConciergeTask[];
  eliteBookings: EliteBooking[];
  referrals: Referral[];
  voiceMessages: VoiceMessage[];
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
  pushDevices: PushDevice[];
}

const EMPTY: Db = {
  travelers: [], sessions: [], crews: [], carePackages: {}, nights: [], grants: [], alerts: [], points: {}, redemptions: {}, rounds: [], pendingOrders: {}, partyCarts: {},
  paymentMethods: {}, holds: [], charges: [], subscriptions: {}, conciergeTasks: [], eliteBookings: [], referrals: [], voiceMessages: [],
  assistantCredentials: {}, assistantSessions: [],
  assistantPayoutDestinations: {}, payouts: [], assistantAdjustments: [],
  driverApplications: [], pushDevices: [],
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
