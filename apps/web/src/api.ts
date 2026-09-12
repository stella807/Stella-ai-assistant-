import { apiBase, platform } from "./native/platform.ts";
import type {
  Alert, AssistantProfile, BacEstimate, Charge, CheckIn, ConciergeCategory, ConciergeTask,
  IdentityPhoto, LocationPing, NearbyStore, NightOut, Plan, ProviderStatus, RecoveryPlan, ShareGrant,
  SpendRequest,
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

export type PaymentProcessor = "stripe" | "paypal";
export type WalletType = "apple-pay" | "google-pay";

export interface PaymentMethod {
  id: string;
  processor: PaymentProcessor;
  wallet?: WalletType;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface ProcessorStatus {
  id: string;
  name: string;
  mode: "automatic" | "handoff" | "unavailable";
  requires: string;
}

export interface AttachPaymentMethodInput {
  processor: PaymentProcessor;
  wallet?: WalletType;
  /** The processor's own client-tokenized id — a Stripe PaymentMethod id or a
   *  PayPal payment-token id. Required only once the processor is
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
  backgroundCheckConsent: boolean;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(apiBase() + path, {
    method,
    // The session is an HttpOnly cookie, so it must ride along explicitly.
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as any)?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  catalog: () => request<{ drinks: any[]; plans: any[]; rewards: any[] }>("GET", "/api/catalog"),

  me: () => request<{ traveler: Account | null }>("GET", "/api/auth/me"),
  signup: (input: { email: string; password: string; displayName: string; homeLabel?: string }) =>
    request<{ traveler: Account }>("POST", "/api/auth/signup", input),
  login: (input: { email: string; password: string }) =>
    request<{ traveler: Account }>("POST", "/api/auth/login", input),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),
  exportAccount: () => request<Record<string, unknown>>("GET", "/api/account/export"),
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
    }>("POST", "/api/rides/quote", { pickup, dropoff }),
  bookSecureRide: (pickup: any, dropoff: any) =>
    request<any>("POST", "/api/rides/secure", { pickup, dropoff, acknowledgedDisclosures: true }),
  fulfillmentStatus: () =>
    request<{ concierge: ProviderStatus; conciergeDisclosures: string[]; placeSearch: ProviderStatus }>(
      "GET", "/api/fulfillment/status"),
  /**
   * Free-text place search backing the concierge task flow's place picker —
   * see `PlaceSearchPort` in packages/core. Deliberately returns no mock
   * results when unconfigured; callers should check `fulfillmentStatus()`'s
   * `placeSearch` field and explain plainly rather than showing an empty box.
   */
  placeSearch: (query: string, near: { lat: number; lng: number }) =>
    request<{ places: NearbyStore[] }>(
      "GET", `/api/concierge/places?query=${encodeURIComponent(query)}&lat=${near.lat}&lng=${near.lng}`),
  conciergeQuote: (input: { category: ConciergeCategory; note: string; location: { lat: number; lng: number; label?: string }; spendCapCents: number; quickTask?: boolean; peopleCount?: number }) =>
    request<{
      quote: { provider: string; etaMinutes: number; description: string }; disclosures: string[];
      serviceFeeCents: number; totalCents: number; quickTaskEligible: boolean;
      /** Clamped to the seats on the signed-in plan, so it can differ from what was asked for. */
      peopleCount: number;
      maxPeopleCount: number;
    }>(
      "POST", "/api/concierge/quote", input),
  conciergeAssistants: (category: ConciergeCategory, location: { lat: number; lng: number }) =>
    request<{ assistants: AssistantProfile[]; available: number }>(
      "GET", `/api/concierge/assistants?category=${encodeURIComponent(category)}&lat=${location.lat}&lng=${location.lng}`),
  bookConcierge: (input: {
    category: ConciergeCategory; note: string; location: { lat: number; lng: number; label?: string };
    spendCapCents: number; assistantId?: string; quickTask?: boolean; peopleCount?: number;
  }) =>
    request<{ task: ConciergeTask; booked: { provider: string; etaMinutes: number | null; trackingUrl: string | null } }>(
      "POST", "/api/concierge/tasks", { ...input, acknowledgedDisclosures: true }),
  conciergeTasks: () => request<{ tasks: ConciergeTask[] }>("GET", "/api/concierge/tasks"),
  completeConcierge: (taskId: string, billedCents?: number) =>
    request<{ task: ConciergeTask }>("POST", `/api/concierge/tasks/${taskId}/complete`, { billedCents }),
  cancelConcierge: (taskId: string) =>
    request<{ task: ConciergeTask }>("POST", `/api/concierge/tasks/${taskId}/cancel`, {}),
  disputeConcierge: (taskId: string, reason: string) =>
    request<{ task: ConciergeTask; refundedCents: number; clawedBack: boolean }>(
      "POST", `/api/concierge/tasks/${taskId}/dispute`, { reason }),
  sendVoiceMessage: (taskId: string, clip: { audioBase64: string; mimeType: string; durationSeconds: number }) =>
    request<{ id: string; createdAt: string }>("POST", `/api/concierge/tasks/${taskId}/voice-messages`, clip),
  voiceMessages: (taskId: string) =>
    request<{ messages: VoiceMessage[] }>("GET", `/api/concierge/tasks/${taskId}/voice-messages`),
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
      assistantId: string; mustChangePassword: boolean; tasks: (ConciergeTask & { requesterName: string })[];
      unpaidEarningsCents: number; outstandingClawbackCents: number;
    }>("GET", "/api/assistant/portal"),
  assistantSetPayoutDestination: (accountHolderName: string, routingNumber: string, accountNumber: string) =>
    request<{ accountHolderName: string; accountNumberLast4: string }>(
      "POST", "/api/assistant/payout-destination", { accountHolderName, routingNumber, accountNumber }),
  assistantPayoutDestination: () =>
    request<{ destination: { accountHolderName: string; accountNumberLast4: string } | null }>(
      "GET", "/api/assistant/payout-destination"),
  assistantPayouts: () =>
    request<{
      payouts: {
        id: string; periodStart: string; periodEnd: string; totalCents: number;
        status: "pending" | "paid" | "failed"; paidAt?: string; failureReason?: string;
      }[];
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
  /** The customer's say on a documented purchase. Declining re-locks the card. */
  decideSpendRequest: (taskId: string, requestId: string, approve: boolean) =>
    request<{ request: SpendRequest; cardUnlocked: boolean }>(
      "POST", `/api/concierge/tasks/${taskId}/spend-requests/${requestId}/decision`, { approve }),
  /** A one-time link to the task card's full number, for paying with it. The
   *  number itself never comes through this API — see revealCard in core. */
  assistantRevealCard: (taskId: string) =>
    request<{
      revealUrl: string;
      card: { id: string; last4: string; network: string; expMonth: number; expYear: number };
      spendCapCents: number;
    }>("POST", `/api/assistant/tasks/${taskId}/card`, {}),
  assistantComplete: (taskId: string, billedCents?: number) =>
    request<{ task: ConciergeTask }>("POST", `/api/assistant/tasks/${taskId}/complete`, { billedCents }),
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
  subscribe: (planId: string, cadence: "monthly" | "annual") =>
    request<Billing & { charged: Charge | null; awaitingStoreReceipt: boolean; note: string }>(
      "POST", "/api/subscription", { planId, cadence, platform: platform() }),
  cancelSubscription: () =>
    request<Billing & { note: string }>("POST", "/api/subscription/cancel", {}),
  confirmStorePurchase: (chargeId: string, receipt: string) =>
    request<Billing & { verified: boolean; note: string }>(
      "POST", `/api/billing/charges/${chargeId}/confirm`, { receipt }),
};

export { ApiError };
