import { apiBase } from "./native/platform.ts";
import type { Alert, BacEstimate, CheckIn, LocationPing, NightOut, RecoveryPlan, RideQuote, ShareGrant, Venue } from "@safehubby/core";

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
    request<{ mode: string; note?: string; handoffs?: { provider: string; url: string; description: string }[] }>(
      "POST", "/api/rides/quote", { pickup, dropoff }),
  bookRide: (providerId: string, pickup: any, dropoff: any) =>
    request<{ bookingId: string; trackingUrl: string }>("POST", "/api/rides/book", { providerId, pickup, dropoff }),
  supplies: () => request<any[]>("GET", "/api/supplies"),
  orderSupplies: (items: { id: string; qty: number }[], to: string) =>
    request<{ orderId: string; etaMinutes: number }>("POST", "/api/supplies/order", { items, to }),
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

  subscribe: (planId: string, cadence: "monthly" | "annual") =>
    request<{ plan: any; cadence: string; trialDays: number; billingConnected: boolean; note: string }>(
      "POST", "/api/subscription", { planId, cadence }),
};

export { ApiError };
