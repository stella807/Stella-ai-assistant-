import { apiBase, platform } from "./native/platform.ts";
import type {
  Alert, AssistantProfile, BacEstimate, Charge, CheckIn, ConciergeCategory, ConciergeTask, DeskTask,
  EliteBooking, EliteService, EliteServiceId, ErrandTierId, FlightInfo, OnBehalfOf,
  IdentityPhoto, LaunchProgress, LaunchStepId, LocationPing, MasterAccount, MasterAuditEntry, NearbyStore, NightOut, PickupRequest, Plan, ProviderStatus, TeamActivity,
  RecoveryPlan, ShareGrant, SpendRequest,
  Statement, Subscription, Venue, VoiceMessage,
} from "@safehubby/core";

export interface CrewMemberView {
  travelerId: string;
  displayName: string;
  drinks: number | null;
  state: "steady" | "ahead" | "quiet" | "heading-home" | "home-safe";
  missedCheckIns: number;
}

export interface CrewView {
  crew: { id: string; name: string; joinCode: string; members: any[] };
  members: CrewMemberView[];
  everyoneHome: boolean;
  active: boolean;
}

export interface Basket {
  id: string;
  name: string;
  blurb: string;
  tier: "standard" | "premium";
  /** True when this basket needs a plan the signed-in account doesn't have. */
  locked: boolean;
  items: { sku: string; name: string; priceCents: number; qty: number }[];
}

export interface CarePackageState {
  auth: { enabled: boolean; basketId: string; capCents: number; triggerBand: string; deliverTo: string } | null;
  orders: { id: string; basketId: string; totalCents: number; deliverTo: string; reason: string; etaMinutes: number }[];
  /** "prepared" until a pharmacy partnership exists; nothing is charged then. */
  mode?: "prepared" | "ordered";
  note?: string | null;
  handoff?: { provider: string; url: string; description: string } | null;
}

export interface RedFlag { id: string; label: string; detail: string }
export interface EmergencyNumber { region: string; countryName: string; number: string; poisonControl?: string }
export interface Assessment {
  escalation: "call-emergency" | "get-checked" | "stay-and-watch";
  headline: string;
  steps: string[];
  flagged: RedFlag[];
}

export interface SecureQuote {
  provider: string;
  fareEstimateCents: number;
  currency: string;
  etaMinutes: number;
  description: string;
  disclosures: string[];
}

export interface GameDef {
  id: string;
  name: string;
  tagline: string;
  howItWorks: string;
  forfeit: string;
  reward: number;
  minPlayers: number;
}

export interface PendingOrder {
  id: string;
  provider: string;
  vendorName: string;
  lines: { sku: string; name: string; priceCents: number; qty: number }[];
  totalCents: number;
  deliverTo: string;
  queuedBecause: string;
  status: string;
}

export interface PartyCategory { id: string; name: string; blurb: string }
export interface PartyItem {
  sku: string; name: string; category: string; vendor: string;
  priceCents: number; unit: string; rental: boolean; serves?: number;
}
export interface CartLine { sku: string; qty: number }
export interface CartSummary {
  lines: { item: PartyItem; qty: number; lineTotalCents: number }[];
  subtotalCents: number; rentalCents: number; purchaseCents: number; coversGuests: number | null;
}

export interface NightSummary {
  night: NightOut;
  bac: BacEstimate;
  stats: { alcoholicDrinks: number; standardDrinks: number; calories: number; missedCheckIns: number };
  pendingCheckIn: CheckIn | null;
  lastPing: LocationPing | null;
  alerts: Alert[];
  carePackage: CarePackageState;
  promptEmergencyCheck: boolean;
}

export interface WatchView {
  grant: ShareGrant;
  sharingActive: boolean;
  traveler: { id: string; displayName: string } | null;
  night: Pick<NightOut, "id" | "status" | "startedAt" | "drinkLimit" | "drinks" | "checkIns">;
  lastPing: LocationPing | null;
  bac: BacEstimate | null;
  stats: NightSummary["stats"];
  alerts: Alert[];
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface Account {
  id: string;
  email: string;
  displayName: string;
  planId: string;
  homeLabel: string;
}

export type PaymentProcessor = "paypal" | "stripe";

export interface TextAlertsState { enabled: boolean; phoneLast4?: string; language?: "en" | "es"; providerReady: boolean }

export interface EmailAlertsState { enabled: boolean; emailHint?: string; language?: "en" | "es"; providerReady: boolean }

/** What the server sends to show one task card — see adapters/cards.ts. */
/** What the browser needs to show one task card, from whichever issuer made it. */
export type CardView =
  | { provider: "stripe"; ephemeralKeySecret: string }
  | { provider: "lithic"; embedSession: string; environment: "sandbox" | "production" };

export interface BalanceSummary {
  loadedCents: number; refundedCents: number; heldCents: number; spentCents: number; availableCents: number;
}
export type BalanceInfo = BalanceSummary & {
  minLoadCents: number;
  maxLoadCents: number;
  crypto: { ready: true } | { ready: false; note: string };
};

export interface PaymentMethod {
  id: string;
  processor: PaymentProcessor;
  brand: string;
  last4: string;
  /** Masked account name where there are no digits, e.g. a PayPal email. */
  accountLabel?: string;
  /** Absent on an account-based method — see PaymentMethodOnFile in core. */
  expMonth?: number;
  expYear?: number;
}

export interface ProcessorStatus {
  id: string;
  name: string;
  mode: "automatic" | "handoff" | "unavailable";
  requires: string;
}

export interface AttachPaymentMethodInput {
  processor: PaymentProcessor;
  /** The processor's own client-tokenized id — a PayPal payment-token id or
   *  a Stripe PaymentMethod id.
   *  Required only once the processor is
   *  `automatic`; the manual fields below are the handoff-mode fallback. */
  token?: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

/** A ledger line, with the two strings the server pre-renders for display. */
export type BillingCharge = Charge & { kindLabel: string; railNote: string };

/**
 * The whole account in one shape. Subscription and per-trip charges arrive
 * together on purpose — they are one account, and splitting the request is how
 * a UI ends up presenting them as two products.
 */
export interface Billing {
  method: PaymentMethod | null;
  live: boolean;
  subscription: Subscription | null;
  plan: Plan;
  planNote: string;
  statement: Statement;
  charges: BillingCharge[];
  rails: { rail: string; note: string }[];
  trialDays: number;
}

export interface DriverApplicationInput {
  tier: "standard" | "secure-transport";
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  licenseNumber: string;
  licenseExpiry: string;
  yearsDriving: number;
  vehicle: { make: string; model: string; year: number; licensePlate: string };
  protectiveLicenseNumber?: string;
  protectiveLicenseState?: string;
  yearsProtectiveExperience?: number;
  /** Optional — see resume.ts in core for the size/type ceiling. */
  resume?: { base64: string; mimeType: string; fileName: string };
  backgroundCheckConsent: boolean;
}

async function request<T>(
  method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>,
): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method,
    // The session is an HttpOnly cookie, so it must ride along explicitly.
    credentials: "include",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as any)?.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** The launch-party window, as the API reports it. Carried on the public
 *  catalog so a signed-out visitor can be told about it. */
export interface LaunchStatus {
  open: boolean;
  /** `open` is the only one that discounts anything; the other two exist so
   *  the copy can tell "not yet" from "over" instead of calling both closed. */
  phase: "upcoming" | "open" | "closed";
  discountRate: number;
  startsAt: string;
  endsAt: string;
  note: string;
}

export interface StaffRoleInfo {
  id: string;
  label: string;
  description: string;
  drives: boolean;
  /** What it pays, in a sentence — built on the server from the real rates. */
  pay: string;
  /** How many people we are still looking for. Zero means not hiring yet. */
  openings: number;
  hiring: boolean;
}

export interface HiringBenefit {
  id: string;
  label: string;
  detail: string;
  roles?: string[];
}

export interface StaffApplicationInput {
  role: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  experience: string;
  resume?: { base64: string; mimeType: string; fileName: string };
  hoursPerWeek: number;
  backgroundCheckConsent: boolean;
  /** Liability insurance (field roles) and, for armed work, both licences. */
  credentials?: {
    kind: "liability-insurance" | "firearms-license" | "guard-license";
    number: string; issuer: string; expiresAt: string;
    document: { base64: string; mimeType: string; fileName: string } | null;
  }[];
}

export interface TaskTextMessage {
  id: string;
  taskId: string;
  sender: "traveler" | "assistant";
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface ShareInvite {
  code: string;
  url: string;
  message: string;
  /** How many accounts have signed up with this code so far. */
  joined: number;
  launch: LaunchStatus;
}

export const api = {
  catalog: () => request<{
    drinks: any[]; plans: any[]; rewards: any[]; launch: LaunchStatus;
    eliteUnlock: {
      thresholdCents: number; trailingRevenueCents: number; unlocked: boolean; percent: number;
      targetClientsLow: number; targetClientsHigh: number; safetyMultiple: number;
    };
  }>("GET", "/api/catalog"),

  me: () => request<{ traveler: Account | null }>("GET", "/api/auth/me"),
  signup: (input: {
    email: string; password: string; displayName: string; homeLabel?: string;
    /** Whoever invited them, if they arrived on a ?ref= link or typed a code.
     *  An unknown code is ignored server-side rather than failing signup. */
    referralCode?: string;
  }) =>
    request<{ traveler: Account }>("POST", "/api/auth/signup", input),
  share: () => request<ShareInvite>("GET", "/api/share"),

  /** Public: no account, because the person this is for cannot use the app
   *  yet. `delivered` is false while no mail provider is configured. */
  joinNewsletter: (input: { email: string; source?: string }) =>
    request<{
      subscribed: true; alreadyOnList: boolean; delivered: boolean; note: string; launch: LaunchStatus;
    }>("POST", "/api/newsletter", input),

  staffRoles: () => request<{ roles: StaffRoleInfo[]; benefits: HiringBenefit[] }>("GET", "/api/staff/roles"),
  applyForStaffRole: (input: StaffApplicationInput) =>
    request<{ id: string; role: string; status: string }>("POST", "/api/staff/apply", input),
  login: (input: { email: string; password: string }) =>
    request<{ traveler: Account }>("POST", "/api/auth/login", input),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),
  exportAccount: () => request<Record<string, unknown>>("GET", "/api/account/export"),
  stripeConfig: () => request<{ ready: true; publishableKey: string } | { ready: false; note: string }>("GET", "/api/payment/stripe/config"),
  stripeCheckoutSession: (planId: string, cadence: "monthly" | "annual") =>
    request<{ client_secret: string }>("POST", "/api/payment/stripe/checkout-session", { planId, cadence }),
  stripeSetupIntent: () => request<{ clientSecret: string }>("POST", "/api/payment/stripe/setup-intent", {}),
  paypalConfig: () => request<{ ready: true; clientId: string } | { ready: false; note: string }>("GET", "/api/payment/paypal/config"),
  /** Step one of saving a PayPal account (`paypal`) or a typed card (`card`). */
  paypalSetupToken: (kind: "paypal" = "paypal") =>
    request<{ id: string }>("POST", "/api/payment/paypal/setup-token", { kind }),
  paypalPaymentToken: (setupToken: string) =>
    request<{ token: string }>("POST", "/api/payment/paypal/payment-token", { setupToken }),
  textAlerts: (scope: "account" | "assistant") =>
    request<TextAlertsState>("GET", `/api/${scope}/text-alerts`),
  saveTextAlerts: (scope: "account" | "assistant", input: { phone?: string; consent: boolean; language: "en" | "es" }) =>
    request<{ enabled: boolean; phoneLast4?: string }>("POST", `/api/${scope}/text-alerts`, input),
  emailAlerts: (scope: "account" | "assistant") =>
    request<EmailAlertsState>("GET", `/api/${scope}/email-alerts`),
  saveEmailAlerts: (scope: "account" | "assistant", input: { email?: string; consent: boolean; language: "en" | "es" }) =>
    request<{ enabled: boolean; emailHint?: string }>("POST", `/api/${scope}/email-alerts`, input),
  balance: () => request<BalanceInfo>("GET", "/api/balance"),
  startCryptoLoad: (amountCents: number) =>
    request<{ reference: string }>("POST", "/api/balance/crypto/start", { amountCents }),
  paymentMethod: () => request<{ method: PaymentMethod | null; live: boolean }>("GET", "/api/account/payment-method"),
  paymentProcessors: () => request<{ processors: ProcessorStatus[] }>("GET", "/api/payment/processors"),
  attachPaymentMethod: (input: AttachPaymentMethodInput) =>
    request<{ method: PaymentMethod }>("POST", "/api/account/payment-method", input),
  removePaymentMethod: () => request<{ removed: true }>("POST", "/api/account/payment-method/remove", {}),

  applyToDrive: (input: DriverApplicationInput) =>
    request<{ id: string; status: string; submittedAt: string }>("POST", "/api/drivers/apply", input),
  withdrawApplication: (id: string, email: string) =>
    request<{ id: string; status: string }>("POST", `/api/drivers/applications/${id}/withdraw`, { email }),

  deleteAccount: (password: string, confirm: string) =>
    request<{ deleted: true; summary: Record<string, number>; note: string }>(
      "POST", "/api/account/delete", { password, confirm }),

  traveler: (id: string) => request<any>("GET", `/api/travelers/${id}`),
  startNight: (input: { weightKg: number; widmarkRatio?: number; drinkLimit: number; homeAddressLabel?: string }) =>
    request<NightSummary>("POST", "/api/nights", input),
  night: (id: string) => request<NightSummary>("GET", `/api/nights/${id}`),
  currentNight: () => request<{ night: null } | NightSummary>("GET", "/api/nights/current"),
  logDrink: (nightId: string, drinkId: string, venueName?: string, servings = 1) =>
    request<NightSummary>("POST", `/api/nights/${nightId}/drinks`, { drinkId, servings, venueName }),
  answerCheckIn: (nightId: string, checkInId: string, feelingRating?: number) =>
    request<NightSummary>("POST", `/api/nights/${nightId}/check-ins/${checkInId}/answer`, { feelingRating }),
  ping: (nightId: string, lat: number, lng: number, venueName?: string) =>
    request<NightSummary>("POST", `/api/nights/${nightId}/location`, { lat, lng, venueName }),
  setStatus: (nightId: string, status: NightOut["status"]) =>
    request<NightSummary>("POST", `/api/nights/${nightId}/status`, { status }),
  sos: (nightId: string, silent: boolean) => request<any>("POST", `/api/nights/${nightId}/sos`, { silent }),
  recovery: (nightId: string) => request<RecoveryPlan>("GET", `/api/nights/${nightId}/recovery`),
  venues: (lat: number, lng: number) => request<Venue[]>("GET", `/api/venues?lat=${lat}&lng=${lng}`),
  grant: (scopes: string[], hours: number) =>
    request<ShareGrant>("POST", "/api/grants", { scopes, hours }),
  claimGrant: (inviteCode: string) =>
    request<ShareGrant>("POST", "/api/grants/claim", { inviteCode }),
  revokeGrant: (grantId: string) =>
    request<ShareGrant>("POST", `/api/grants/${grantId}/revoke`, {}),
  watch: (grantId: string) => request<WatchView>("GET", `/api/watch/${grantId}`),
  rideQuotes: (pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number; label?: string }) =>
    request<{
      mode: "automatic" | "handoff";
      provider?: string;
      note?: string;
      estimates?: { productId: string | null; productName: string | null; fareCents: number | null; currency: string; etaMinutes: number | null }[];
      handoffs?: { provider: string; url: string; description: string }[];
      secure?: SecureQuote | null;
      /** Safehubby's own published fare for a coordinated-pickup ride — see
       *  estimateFareCents in ride-coordination.ts. Always present, on
       *  every plan, since it depends on no third-party provider at all. */
      standard: { arrangeFeeCents: number };
    }>("POST", "/api/rides/quote", { pickup, dropoff }),
  bookSecureRide: (pickup: any, dropoff: any) =>
    request<any>("POST", "/api/rides/secure", { pickup, dropoff, acknowledgedDisclosures: true }),
  /** "Coordinate pickup" — Safehubby's own hired drivers, not Uber or Lyft.
   *  See ride-coordination.ts for why this is a request a person on
   *  operations matches to a driver, rather than an instant booking. */
  coordinatePickup: (
    pickup: { lat: number; lng: number; label?: string },
    dropoff: { lat: number; lng: number; label?: string },
    note?: string,
  ) => request<{ request: PickupRequest }>("POST", "/api/rides/coordinate", { pickup, dropoff, note }),
  myPickupRequests: () => request<{ requests: PickupRequest[] }>("GET", "/api/rides/coordinate"),
  cancelPickupRequest: (id: string) =>
    request<{ request: PickupRequest }>("POST", `/api/rides/coordinate/${id}/cancel`, {}),
  homeAddress: () => request<{ address: { lat: number; lng: number; label: string } | null }>("GET", "/api/account/address"),
  saveHomeAddress: (lat: number, lng: number, label: string) =>
    request<{ address: { lat: number; lng: number; label: string } }>("POST", "/api/account/address", { lat, lng, label }),
  fulfillmentStatus: () =>
    request<{
      concierge: ProviderStatus; conciergeDisclosures: string[]; placeSearch: ProviderStatus;
      flightTracking: ProviderStatus; flightTrackingDisclosures: string[];
    }>("GET", "/api/fulfillment/status"),
  /**
   * Free-text place search backing the concierge task flow's place picker —
   * see `PlaceSearchPort` in packages/core. Deliberately returns no mock
   * results when unconfigured; callers should check `fulfillmentStatus()`'s
   * `placeSearch` field and explain plainly rather than showing an empty box.
   */
  placeSearch: (query: string, near: { lat: number; lng: number }) =>
    request<{ places: NearbyStore[] }>(
      "GET", `/api/concierge/places?query=${encodeURIComponent(query)}&lat=${near.lat}&lng=${near.lng}`),
  conciergeQuote: (input: { category: ConciergeCategory; note: string; location: { lat: number; lng: number; label?: string }; spendCapCents: number; quickTask?: boolean; errandTier?: ErrandTierId; onBehalfOf?: OnBehalfOf; peopleCount?: number; hours?: number }) =>
    request<{
      /** Null when Safehubby's own roster is doing the work — there is no
       *  supplier to quote, the rate card already decided the price. */
      quote: { provider: string; etaMinutes: number; description: string } | null; disclosures: string[];
      serviceFeeCents: number; totalCents: number; quickTaskEligible: boolean;
      /** True when this rides on the plan's included grabs — no fee, and
       *  Safehubby pays the runner instead. See included-grabs.ts. */
      feeIncluded: boolean;
      /** Null for no limit. */
      includedGrabsRemaining: number | null;
      /** Clamped to the seats on the signed-in plan, so it can differ from what was asked for. */
      peopleCount: number;
      maxPeopleCount: number;
      /** Present only for work paid by the hour, and only as the server
       *  priced it — the client's number after clamping, not before. */
      hoursBooked?: number;
    }>(
      "POST", "/api/concierge/quote", input),
  /** `quickTask` is what the free tier books these categories as — send it,
   *  or a free account is told to upgrade for a feature it already has. */
  conciergeAssistants: (
    category: ConciergeCategory, location: { lat: number; lng: number }, quickTask?: boolean, armed?: boolean,
  ) =>
    request<{ assistants: AssistantProfile[]; available: number }>(
      "GET", `/api/concierge/assistants?category=${encodeURIComponent(category)}`
        + `&lat=${location.lat}&lng=${location.lng}${quickTask ? "&quickTask=true" : ""}${armed ? "&armed=true" : ""}`),
  bookConcierge: (input: {
    category: ConciergeCategory; note: string; location: { lat: number; lng: number; label?: string };
    spendCapCents: number; assistantId?: string; quickTask?: boolean; errandTier?: ErrandTierId; peopleCount?: number;
    /** For somebody other than the customer. The server takes the location from
     *  the market named here, and refuses the booking without the agreement. */
    onBehalfOf?: OnBehalfOf; acknowledgedOnBehalf?: boolean;
    hours?: number;
    /** A wait with someone in hospital, at the hospital-day rate. */
    hospitalStay?: boolean;
    /** Armed work, for an assistant cleared for it. */
    armed?: boolean;
    /** Required for, and only for, `airport-pickup` — see `ConciergeTaskInput.flight`. */
    flight?: { flightNumber: string; date: string };
  }) =>
    request<{ task: ConciergeTask; booked: { provider: string; etaMinutes: number | null; trackingUrl: string | null } }>(
      "POST", "/api/concierge/tasks", { ...input, acknowledgedDisclosures: true }),
  conciergeTasks: () => request<{ tasks: ConciergeTask[] }>("GET", "/api/concierge/tasks"),
  /** This month's no-fee grabs — `allowance` and `remaining` are null for no
   *  limit. Same shape as the desk-task allowance. */
  includedGrabs: () =>
    request<{ allowance: number | null; used: number; remaining: number | null; resetsAt: string }>(
      "GET", "/api/concierge/included-grabs"),
  /** A flight's schedule, status and (while airborne) position — the
   *  preview before booking an airport pickup, and the same call a booked
   *  task's detail screen makes again to refresh. See FlightTrackingPort. */
  flightLookup: (flightNumber: string, date: string) =>
    request<{ flight: FlightInfo; disclosures: string[] }>(
      "GET", `/api/flights/lookup?flightNumber=${encodeURIComponent(flightNumber)}&date=${encodeURIComponent(date)}`),
  deskTasks: () => request<{
    kinds: { id: string; label: string; description: string }[];
    accessRule: string;
    allowance: number; used: number; remaining: number; resetsAt: string;
    tasks: DeskTask[];
  }>("GET", "/api/desk/tasks"),
  createDeskTask: (input: { kind: string; note: string }) =>
    request<{ task: DeskTask; remaining: number }>("POST", "/api/desk/tasks", input),
  cancelDeskTask: (id: string) => request<{ task: DeskTask }>("POST", `/api/desk/tasks/${id}/cancel`, {}),
  /** The Elite luxury desk's catalogue — jet travel and the rest — see elite.ts. Only reachable on an Elite plan. */
  eliteServices: () =>
    request<{
      desk: ProviderStatus;
      services: (EliteService & { disclosures: string[]; commissionNote: string })[];
    }>("GET", "/api/elite/services"),
  eliteBookings: () => request<{ bookings: EliteBooking[] }>("GET", "/api/elite/bookings"),
  /** Opens a request on the desk. No charge and no hold — the member pays the supplier directly, see elite.ts. */
  requestEliteBooking: (serviceId: EliteServiceId, brief: string) =>
    request<{ booking: EliteBooking; disclosures: string[]; note: string | null }>(
      "POST", "/api/elite/bookings", { serviceId, brief },
    ),
  eliteSpendingCard: () => request<{
    capCents: number; monthKey: string; automatic: boolean;
    card: { id: string; monthKey: string; capCents: number; last4: string; network: string; expMonth: number; expYear: number } | null;
  }>("GET", "/api/elite/spending-card"),
  issueEliteSpendingCard: () => request<{
    card: { id: string; monthKey: string; capCents: number; last4: string; network: string; expMonth: number; expYear: number };
  }>("POST", "/api/elite/spending-card", {}),
  eliteSpendingCardKey: (nonce?: string) =>
    request<{ cardId: string; view?: CardView }>("POST", "/api/elite/spending-card/reveal", nonce ? { nonce } : {}),
  eliteEvents: () => request<{
    events: {
      id: string; label: string; emoji: string; description: string; city: string; date: string;
      capacity: number; rsvpCount: number; hasRoom: boolean; isGoing: boolean;
    }[];
  }>("GET", "/api/elite/events"),
  rsvpEliteEvent: (eventId: string) =>
    request<{ isGoing: boolean; rsvpCount: number }>("POST", `/api/elite/events/${eventId}/rsvp`, {}),
  cancelEliteEventRsvp: (eventId: string) =>
    request<{ isGoing: boolean; rsvpCount: number }>("POST", `/api/elite/events/${eventId}/cancel`, {}),
  clubStatus: () => request<{
    isMember: boolean;
    invited: boolean;
    memberCount: number;
    breakEvenMembers: number;
    overheadCovered: boolean;
    perks: readonly string[];
    disclosures: string[];
    duesCoveredBySafehubby: boolean;
    catalog: { id: string; label: string; emoji: string; retailPerPersonCents: number; negotiatedPerPersonCents: number }[];
    thisMonth: {
      experience: { id: string; label: string; emoji: string; retailPerPersonCents: number; negotiatedPerPersonCents: number };
      duesCents: number;
    };
  }>("GET", "/api/club/status"),
  clubRequests: () => request<{ requests: ClubRequestRow[] }>("GET", "/api/club/requests"),
  askClub: (note: string) => request<{ request: ClubRequestRow }>("POST", "/api/club/requests", { note }),
  clubDesk: () => request<ClubDesk>("GET", "/api/master/club/desk"),
  clubInvite: (travelerId: string, invited: boolean) =>
    request<{ invited: boolean }>("POST", "/api/master/club/invite", { travelerId, invited }),
  clubArrange: (id: string, status: "arranged" | "declined", reply: string) =>
    request<{ ok: true }>("POST", `/api/master/club/requests/${id}`, { status, reply }),
  joinClub: () => request<{ isMember: boolean }>("POST", "/api/club/join", {}),
  leaveClub: () => request<{ isMember: boolean }>("POST", "/api/club/leave", {}),
  completeConcierge: (taskId: string, billedCents?: number) =>
    request<{ task: ConciergeTask }>("POST", `/api/concierge/tasks/${taskId}/complete`, { billedCents }),
  cancelConcierge: (taskId: string) =>
    request<{ task: ConciergeTask }>("POST", `/api/concierge/tasks/${taskId}/cancel`, {}),
  disputeConcierge: (taskId: string, reason: string) =>
    request<{ task: ConciergeTask; refundedCents: number; clawedBack: boolean }>(
      "POST", `/api/concierge/tasks/${taskId}/dispute`, { reason }),
  /** The typed half of a task's thread. Sealed at rest server-side like the
   *  voice clips and photos beside it — see sealTaskMessages. */
  taskMessages: (taskId: string) =>
    request<{ messages: TaskTextMessage[] }>("GET", `/api/concierge/tasks/${taskId}/messages`),
  sendTaskMessage: (taskId: string, body: string) =>
    request<{ message: TaskTextMessage }>("POST", `/api/concierge/tasks/${taskId}/messages`, { body }),

  sendVoiceMessage: (taskId: string, clip: { audioBase64: string; mimeType: string; durationSeconds: number }) =>
    request<{ id: string; createdAt: string }>("POST", `/api/concierge/tasks/${taskId}/voice-messages`, clip),
  voiceMessages: (taskId: string) =>
    request<{ messages: VoiceMessage[] }>("GET", `/api/concierge/tasks/${taskId}/voice-messages`),
  /** One task, for a screen watching it change — see the route's comment for
   *  why this is not the list call. */
  conciergeTask: (taskId: string) =>
    request<{ task: ConciergeTask }>("GET", `/api/concierge/tasks/${taskId}`),
  sendSelfie: (taskId: string, photo: { base64: string; mimeType: string }) =>
    request<{ photo: IdentityPhoto }>("POST", `/api/concierge/tasks/${taskId}/selfie`, photo),

  /**
   * The employee portal's own sign-in — a distinct area from everything
   * above, with its own session cookie (`sh_assistant_session`) rather than
   * the traveler one `request()`'s `credentials: "include"` already carries.
   * Both cookies ride along on every call automatically; the server reads
   * only the one each route cares about, so the two never interfere.
   */
  assistantLogin: (username: string, password: string) =>
    request<{ assistantId: string; mustChangePassword: boolean }>(
      "POST", "/api/assistant/auth/login", { username, password }),
  assistantLogout: () => request<{ ok: true }>("POST", "/api/assistant/auth/logout", {}),
  assistantChangePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("POST", "/api/assistant/auth/change-password", { currentPassword, newPassword }),

  /** Everything below is session-authenticated against that same cookie —
   *  no token in the URL, unlike the old magic-link portal. */
  assistantPortal: () =>
    request<{
      assistantId: string; mustChangePassword: boolean; tasks: (ConciergeTask & { requesterName: string; role?: "runner" | "assistant"; handedOverBy?: string })[];
      unpaidEarningsCents: number; outstandingClawbackCents: number;
      aiAssist: { mode: "automatic" | "handoff" | "unavailable"; requires: string };
    }>("GET", "/api/assistant/portal"),
  /** A faster first draft of the assistant's own wording — see ai-assist.ts. Never sent on its own. */
  assistantAiDraft: (taskId: string, input: { purpose: string; instruction: string }) =>
    request<{ text: string }>("POST", `/api/assistant/tasks/${taskId}/ai-draft`, input),
  assistantSetPayoutDestination: (accountHolderName: string, routingNumber: string, accountNumber: string) =>
    request<{ accountHolderName: string; accountNumberLast4: string }>(
      "POST", "/api/assistant/payout-destination", { accountHolderName, routingNumber, accountNumber }),
  assistantPayoutDestination: () =>
    request<{ destination: { accountHolderName: string; accountNumberLast4: string } | null }>(
      "GET", "/api/assistant/payout-destination"),
  assistantPayouts: () =>
    request<{
      payouts: {
        id: string; periodStart: string; periodEnd: string; totalCents: number; withheldCents?: number;
        status: "pending" | "paid" | "failed"; paidAt?: string; failureReason?: string;
      }[];
      withheldThisYearCents: number;
      unpaidEarningsCents: number; outstandingClawbackCents: number;
    }>("GET", "/api/assistant/payouts"),
  assistantVoiceMessages: (taskId: string) =>
    request<{ messages: VoiceMessage[] }>("GET", `/api/assistant/tasks/${taskId}/voice-messages`),
  assistantSendVoiceMessage: (taskId: string, clip: { audioBase64: string; mimeType: string; durationSeconds: number }) =>
    request<{ id: string; createdAt: string }>("POST", `/api/assistant/tasks/${taskId}/voice-messages`, clip),
  assistantSendSelfie: (taskId: string, photo: { base64: string; mimeType: string }) =>
    request<{ photo: IdentityPhoto }>("POST", `/api/assistant/tasks/${taskId}/selfie`, photo),
  assistantSendCompletionPhoto: (taskId: string, photo: { base64: string; mimeType: string }) =>
    request<{ photo: IdentityPhoto }>("POST", `/api/assistant/tasks/${taskId}/completion-photo`, photo),
  /** Documents a purchase before it happens — photo required, voice
   *  optional. This is what unlocks the task card. */
  assistantSubmitSpendRequest: (taskId: string, input: {
    amountCents: number; note: string;
    photo: { base64: string; mimeType: string };
    voice?: { audioBase64: string; mimeType: string; durationSeconds: number };
  }) =>
    request<{ request: SpendRequest; remainingSpendCents: number }>(
      "POST", `/api/assistant/tasks/${taskId}/spend-request`, input),
  /** The receipt for a documented purchase — what stops it being clawed back. */
  assistantSendReceipt: (taskId: string, requestId: string, photo: { base64: string; mimeType: string }) =>
    request<{ receipt: IdentityPhoto; unaccountedSpendCents: number }>(
      "POST", `/api/assistant/tasks/${taskId}/spend-requests/${requestId}/receipt`, photo),
  /** "It changed" — out of stock, a substitution, a different price. Counts as
   *  answering for the money, so no receipt isn't a penalty. */
  assistantReportChange: (taskId: string, requestId: string, input: {
    note: string; amountCents?: number;
    voice?: { audioBase64: string; mimeType: string; durationSeconds: number };
  }) =>
    request<{ request: SpendRequest; unaccountedSpendCents: number }>(
      "POST", `/api/assistant/tasks/${taskId}/spend-requests/${requestId}/change`, input),
  /** The customer's say on a documented purchase. Declining re-locks the card. */
  decideSpendRequest: (taskId: string, requestId: string, approve: boolean) =>
    request<{ request: SpendRequest; cardUnlocked: boolean }>(
      "POST", `/api/concierge/tasks/${taskId}/spend-requests/${requestId}/decision`, { approve }),
  /** A one-time link to the task card's full number, for paying with it. The
   *  number itself never comes through this API — see revealCard in core. */
  assistantCardKey: (taskId: string, nonce?: string) =>
    request<{ cardId: string; view?: CardView }>("POST", `/api/assistant/tasks/${taskId}/card`, nonce ? { nonce } : {}),
  assistantComplete: (taskId: string, billedCents?: number) =>
    request<{ task: ConciergeTask }>("POST", `/api/assistant/tasks/${taskId}/complete`, { billedCents }),
  assistantRunners: () =>
    request<{ runners: { id: string; name: string; busy: number; capacity: number; available: boolean }[] }>(
      "GET", "/api/assistant/runners"),
  assistantDelegate: (taskId: string, runnerId: string | null) =>
    request<{ task: ConciergeTask }>("POST", `/api/assistant/tasks/${taskId}/delegate`, { runnerId }),
  assistantDecline: (taskId: string) =>
    request<{ task: ConciergeTask }>("POST", `/api/assistant/tasks/${taskId}/decline`, {}),
  bookRide: (providerId: string, pickup: any, dropoff: any) =>
    request<{ bookingId: string; trackingUrl: string }>("POST", "/api/rides/book", { providerId, pickup, dropoff }),
  supplies: () => request<any[]>("GET", "/api/supplies"),
  nearbyStores: (at: { lat: number; lng: number }) =>
    request<NearbyStore[]>("GET", `/api/supplies/stores?lat=${at.lat}&lng=${at.lng}`),
  orderSupplies: (
    items: { id: string; qty: number; name?: string; priceCents?: number }[],
    to: string,
    store?: { name: string; address?: string } | null,
  ) =>
    request<{
      mode: "cart-ready" | "handoff";
      provider?: string;
      trackingUrl?: string | null;
      totalCents?: number;
      note?: string;
      error?: string;
      handoff?: { provider: string; url: string; tracked: boolean; description: string };
    }>("POST", "/api/supplies/order", { items, to, store }),
  pushStatus: () =>
    request<{ devices: number; delivery: { id: string; name: string; mode: string; requires: string } }>(
      "GET", "/api/push/status"),
  registerPushDevice: (token: string, platform: string) =>
    request<{ registered: boolean; delivery: { mode: string } }>("POST", "/api/push/devices", { token, platform }),
  /** So an assistant's phone buzzes the moment a task lands on them, instead
   *  of only when they next open the portal. Same device row as the
   *  traveler-side call above, registered against the assistant's own
   *  session — see requireConciergeAccess's neighbor route in routes.ts. */
  assistantRegisterPushDevice: (token: string, platform: string) =>
    request<{ registered: boolean; delivery: { mode: string } }>(
      "POST", "/api/assistant/push/devices", { token, platform }),
  assistantPushStatus: () =>
    request<{ devices: number; delivery: { id: string; name: string; mode: string; requires: string } }>(
      "GET", "/api/assistant/push/status"),

  redeem: (rewardId: string) => request<any>("POST", "/api/points/redeem", { rewardId }),

  crews: () => request<any[]>("GET", "/api/crews"),
  createCrew: (name: string) => request<any>("POST", "/api/crews", { name }),
  joinCrew: (joinCode: string) => request<any>("POST", "/api/crews/join", { joinCode }),
  crew: (crewId: string) => request<CrewView>("GET", `/api/crews/${crewId}`),
  leaveCrew: (crewId: string) => request<any>("POST", `/api/crews/${crewId}/leave`, {}),
  shareCount: (crewId: string, sharesCount: boolean) =>
    request<any>("POST", `/api/crews/${crewId}/share-count`, { sharesCount }),

  baskets: () => request<{ baskets: Basket[]; defaultCapCents: number }>("GET", "/api/care-package/baskets"),
  authorizeCarePackage: (nightId: string, input: { basketId: string; capCents: number; triggerBand: string; deliverTo: string }) =>
    request<CarePackageState>("POST", `/api/nights/${nightId}/care-package/authorize`, input),
  cancelCarePackage: (nightId: string) =>
    request<CarePackageState>("POST", `/api/nights/${nightId}/care-package/cancel`, {}),
  sendCarePackage: (nightId: string, basketId: string) =>
    request<any>("POST", `/api/nights/${nightId}/care-package/send`, { basketId }),

  emergencyInfo: (region: string) =>
    request<{ redFlags: RedFlag[]; emergency: EmergencyNumber | null; notAnAmbulanceService: string }>(
      "GET", `/api/emergency?region=${encodeURIComponent(region)}`),
  assessEmergency: (nightId: string, body: { flags?: string[]; region?: string; emergency?: boolean; concerns?: string[] }) =>
    request<{ assessment: Assessment; emergency: EmergencyNumber | null; script: string[] }>(
      "POST", `/api/nights/${nightId}/emergency/assess`, body),

  games: () => request<{ games: GameDef[] }>("GET", "/api/games"),
  startRound: (gameId: string, players: { id: string; displayName: string }[]) =>
    request<any>("POST", "/api/games/rounds", { gameId, players }),
  rounds: () => request<any[]>("GET", "/api/games/rounds"),
  settleRound: (roundId: string, body: Record<string, unknown>) =>
    request<any>("POST", `/api/games/rounds/${roundId}/settle`, body),
  guess: (roundId: string, guess: number) =>
    request<any>("POST", `/api/games/rounds/${roundId}/guess`, { guess }),

  pendingOrders: () => request<{ band: string; askNow: PendingOrder[]; waiting: PendingOrder[] }>("GET", "/api/orders/pending"),
  queueOrder: (body: Record<string, unknown>) => request<PendingOrder>("POST", "/api/orders", body),
  confirmOrder: (id: string) => request<PendingOrder>("POST", `/api/orders/${id}/confirm`, {}),
  declineOrder: (id: string) => request<PendingOrder>("POST", `/api/orders/${id}/decline`, {}),

  partyCatalog: () => request<{ categories: PartyCategory[]; items: PartyItem[] }>("GET", "/api/party/catalog"),
  partySuggest: (guests: number) => request<{ guests: number; lines: CartLine[]; summary: CartSummary }>("GET", `/api/party/suggest?guests=${guests}`),
  partyCart: () => request<{ lines: CartLine[]; summary: CartSummary }>("GET", "/api/party/cart"),
  savePartyCart: (lines: CartLine[]) => request<{ lines: CartLine[]; summary: CartSummary }>("POST", "/api/party/cart", { lines }),

  /** The whole account's money in one call — see GET /api/billing. */
  billing: () => request<Billing>("GET", "/api/billing"),
  /** The automatic-renewal terms to show before the subscriber agrees. */
  renewalTerms: (planId: string, cadence: "monthly" | "annual") =>
    request<RenewalTermsView>(
      "GET", `/api/billing/renewal-terms?planId=${encodeURIComponent(planId)}&cadence=${cadence}`),
  /**
   * `consent` carries the price the subscriber was actually shown. The server
   * refuses a paid plan without it, and refuses one whose price no longer
   * matches the offer — see auto-renewal.ts.
   */
  subscribe: (planId: string, cadence: "monthly" | "annual", consent?: { priceCents: number }) =>
    request<Billing & { charged: Charge | null; awaitingStoreReceipt: boolean; note: string }>(
      "POST", "/api/subscription",
      { planId, cadence, platform: platform(), ...(consent ? { renewalConsent: consent } : {}) }),
  cancelSubscription: () =>
    request<Billing & { note: string }>("POST", "/api/subscription/cancel", {}),
  confirmStorePurchase: (chargeId: string, receipt: string) =>
    request<Billing & { verified: boolean; note: string }>(
      "POST", `/api/billing/charges/${chargeId}/confirm`, { receipt }),

  /**
   * Master access — the owner/secretary dashboard, a third identity space
   * with its own session cookie (`sh_master_session`). See master-access.ts
   * and the `/master` routes in routes.ts.
   *
   * `masterCreateAccount` and the `...WithAdminKey` pair carry the shared
   * `SAFEHUBBY_ADMIN_KEY` directly, as a header rather than a cookie — there
   * is no session to authenticate with yet when provisioning the very
   * first account, or when the key for the only owner account has been
   * lost and nobody can sign in to revoke it any other way. Every other
   * call rides the master session cookie like the rest of this file rides
   * the traveler one; an owner's own session can list and revoke accounts
   * too (see `requireAdmin`'s dual gate), which is what the dashboard uses.
   */
  masterCreateAccount: (adminKey: string, input: { name: string; email: string; role: "owner" | "secretary" | "club-assistant" }) =>
    request<{ account: MasterAccount; key: string }>(
      "POST", "/api/admin/master-accounts", input, { "x-admin-key": adminKey }),
  masterListAccountsWithAdminKey: (adminKey: string) =>
    request<MasterAccountRow[]>("GET", "/api/admin/master-accounts", undefined, { "x-admin-key": adminKey }),
  masterRevokeAccountWithAdminKey: (adminKey: string, id: string) =>
    request<MasterAccount>("POST", `/api/admin/master-accounts/${id}/revoke`, {}, { "x-admin-key": adminKey }),
  masterListAccounts: () => request<MasterAccountRow[]>("GET", "/api/admin/master-accounts"),
  masterRevokeAccount: (id: string) => request<MasterAccount>("POST", `/api/admin/master-accounts/${id}/revoke`, {}),
  masterLogin: (key: string) =>
    request<{ accountId: string; name: string; role: "owner" | "secretary" | "club-assistant" }>(
      "POST", "/api/master/auth/login", { key }),
  masterLogout: () => request<{ ok: true }>("POST", "/api/master/auth/logout", {}),
  masterOverview: () => request<MasterOverview>("GET", "/api/master/overview"),
  masterWithholding: () =>
    request<{ year: string; totalWithheldCents: number; workers: { assistantId: string; name: string; paidCents: number; withheldCents: number }[] }>(
      "GET", "/api/master/withholding"),
  masterAuditLog: () => request<MasterAuditEntry[]>("GET", "/api/master/audit-log"),

  /** Move a staff application through review. Owner only — `write` is not a
   *  scope a secretary holds, so the buttons are hidden for them and the
   *  server refuses regardless. */
  masterReviewStaffApplication: (id: string, status: "under-review" | "approved" | "rejected", note?: string) =>
    request<{ id: string; status: string }>(
      "POST", `/api/staff/applications/${id}/review`, { status, ...(note ? { note } : {}) }),

  /** Hire an approved applicant onto the roster. Returns the portal
   *  credentials **once** — they are not stored readably and cannot be
   *  shown again, so the caller has to surface them immediately. */
  masterApplicationCredential: (id: string, kind: string) =>
    request<{ fileName: string; mimeType: string; base64: string }>("GET", `/api/applications/${encodeURIComponent(id)}/credential/${encodeURIComponent(kind)}`),
  masterHireStaffApplication: (id: string, market: string, profile?: { bio?: string; age?: number; yearsExperience?: number; photoUrl?: string; armed?: boolean }) =>
    request<{ assistant: { id: string; name: string }; credentials: { username: string; tempPassword?: string } }>(
      "POST", `/api/staff/applications/${id}/hire`, { market, ...profile }),
  /** Tick one of the launch steps the app cannot observe for itself. The
   *  server refuses an observed step outright — see launch-plan.ts. */
  masterMarkLaunchStep: (id: LaunchStepId, done: boolean) =>
    request<{ ok: true }>("POST", `/api/master/launch/${id}`, { done }),
  masterGetPricing: () => request<any>("GET", "/api/master/pricing"),
  masterSetPrice: (roleOrService: string, priceCents: number, reason?: string) =>
    request<any>("POST", "/api/master/pricing/override", { roleOrService, priceCents, reason }),
  /** The file an applicant attached, for the review queue. */
  masterApplicationResume: (id: string) =>
    request<{ fileName: string; mimeType: string; base64: string }>("GET", `/api/applications/${encodeURIComponent(id)}/resume`),
  masterGetPayroll: () => request<any>("GET", "/api/master/payroll"),
  masterProcessPayroll: (period: string) =>
    request<any>("POST", "/api/master/payroll/process", { period }),
};

export interface ClubRequestRow {
  id: string; travelerId: string; note: string; status: "open" | "arranged" | "declined";
  reply?: string; createdAt: string; updatedAt: string;
}

export interface ClubDesk {
  account: { name: string; role: string };
  members: { id: string; name: string; email: string }[];
  invitable: { id: string; name: string; email: string; invited: boolean }[];
  thisMonth: { label: string; id: string };
  requests: (ClubRequestRow & { memberName: string })[];
  update: {
    customers: number; clubMembers: number; clubInvited: number; openClubRequests: number;
    tasksInProgress: number; tasksDoneThisWeek: number; pickupsWaiting: number;
  };
}

export type MasterAccountRow = MasterAccount & { scopes: string[]; active: boolean };

/** Present only when the signed-in role's scopes include it — see
 *  `GET /api/master/overview` in routes.ts. A missing key means "you can't
 *  see this," never "there is nothing here." */
export interface MasterOverview {
  account: { id: string; name: string; role: "owner" | "secretary" | "club-assistant" };
  scopes: string[];
  generatedAt: string;
  customers?: { id: string; name: string; email: string; planId: string; clubMember: boolean }[];
  operations?: {
    activeConciergeTasks: number;
    openDeskTasks: number;
    rosterActive: number;
    rosterTotal: number;
    pendingDriverApplications: number;
    pendingStaffApplications: number;
    applications: {
      staff: {
        id: string; role: string; fullName: string; city: string; state: string; hoursPerWeek: number; status: string;
        submittedAt: string; hasResume: boolean;
        credentials?: { kind: "liability-insurance" | "firearms-license" | "guard-license"; number: string; issuer: string; expiresAt: string }[];
      }[];
      drivers: { id: string; fullName: string; city: string; state: string; status: string; submittedAt: string; hasResume: boolean }[];
    };
    recommendedHeadcount: Record<string, number>;
    hiredByRole: Record<string, number>;
    wingmanClubMembers: number;
    team: TeamActivity;
  };
  money?: {
    settledChargesCents: number;
    chargeCount: number;
    pendingChargesCents: number;
    pendingChargeCount: number;
    byKind: Record<string, number>;
    unpaidPayoutsCents: number;
    eliteUnlock: {
      thresholdCents: number; trailingRevenueCents: number; unlocked: boolean; percent: number;
      targetClientsLow: number; targetClientsHigh: number; safetyMultiple: number;
    };
    launch: LaunchProgress;
  };
}

/** GET /api/billing/renewal-terms. */
export interface RenewalTermsView {
  planId: string;
  planName: string;
  cadence: "monthly" | "annual";
  priceCents: number;
  firstChargeAt: string;
  trialDays: number;
  trialEndsAt?: string;
  /** False for a free plan, which has nothing to renew into. */
  required: boolean;
}

export { ApiError };
