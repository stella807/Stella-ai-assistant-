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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as any)?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  catalog: () => request<{ drinks: any[]; plans: any[]; rewards: any[] }>("GET", "/api/catalog"),
  traveler: (id: string) => request<any>("GET", `/api/travelers/${id}`),
  startNight: (input: { travelerId: string; weightKg: number; widmarkRatio?: number; drinkLimit: number; homeAddressLabel?: string }) =>
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
  grant: (travelerId: string, guardianId: string, scopes: string[], hours: number) =>
    request<ShareGrant>("POST", "/api/grants", { travelerId, guardianId, createdBy: travelerId, scopes, hours }),
  revokeGrant: (grantId: string, revokedBy: string) =>
    request<ShareGrant>("POST", `/api/grants/${grantId}/revoke`, { revokedBy }),
  watch: (grantId: string) => request<WatchView>("GET", `/api/watch/${grantId}`),
  rideQuotes: (travelerId: string, pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) =>
    request<RideQuote[]>("POST", "/api/rides/quote", { travelerId, pickup, dropoff }),
  bookRide: (travelerId: string, providerId: string, pickup: any, dropoff: any) =>
    request<{ bookingId: string; trackingUrl: string }>("POST", "/api/rides/book", { travelerId, providerId, pickup, dropoff }),
  supplies: () => request<any[]>("GET", "/api/supplies"),
  orderSupplies: (travelerId: string, items: { id: string; qty: number }[], to: string) =>
    request<{ orderId: string; etaMinutes: number }>("POST", "/api/supplies/order", { travelerId, items, to }),
  redeem: (travelerId: string, rewardId: string) =>
    request<any>("POST", "/api/points/redeem", { travelerId, rewardId }),
};

export { ApiError };
