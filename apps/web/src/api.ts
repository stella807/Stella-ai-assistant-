import type { Alert, BacEstimate, CheckIn, LocationPing, NightOut, RecoveryPlan, RideQuote, ShareGrant, Venue } from "@safehubby/core";

export interface NightSummary {
  night: NightOut;
  bac: BacEstimate;
  stats: { alcoholicDrinks: number; standardDrinks: number; calories: number; missedCheckIns: number };
  pendingCheckIn: CheckIn | null;
  lastPing: LocationPing | null;
  alerts: Alert[];
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
  const res = await fetch(path, {
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

  traveler: (id: string) => request<any>("GET", `/api/travelers/${id}`),
  startNight: (input: { weightKg: number; widmarkRatio?: number; drinkLimit: number; homeAddressLabel?: string }) =>
    request<NightSummary>("POST", "/api/nights", input),
  night: (id: string) => request<NightSummary>("GET", `/api/nights/${id}`),
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
  rideQuotes: (pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) =>
    request<RideQuote[]>("POST", "/api/rides/quote", { pickup, dropoff }),
  bookRide: (providerId: string, pickup: any, dropoff: any) =>
    request<{ bookingId: string; trackingUrl: string }>("POST", "/api/rides/book", { providerId, pickup, dropoff }),
  supplies: () => request<any[]>("GET", "/api/supplies"),
  orderSupplies: (items: { id: string; qty: number }[], to: string) =>
    request<{ orderId: string; etaMinutes: number }>("POST", "/api/supplies/order", { items, to }),
  redeem: (rewardId: string) => request<any>("POST", "/api/points/redeem", { rewardId }),
};

export { ApiError };
