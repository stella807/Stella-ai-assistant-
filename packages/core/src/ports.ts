import type { LocationPing } from "./types.ts";

/**
 * Outbound ports. Core defines the shape; apps/api supplies adapters (mock in
 * development, real Uber/Lyft/DoorDash/Places clients in production). Keeping
 * these as interfaces means the domain and the UI can be built and tested with
 * no third-party keys and no network.
 */

export interface RideQuote {
  providerId: string;
  providerName: string;
  productName: string;
  etaMinutes: number;
  /** Fare is set entirely by the ride provider; we display, never compute it. */
  fareEstimateCents: number;
  currency: string;
  deepLink: string;
}

export interface RideRequest {
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number; label?: string };
  /** Optional stop, e.g. a pharmacy on the way home. */
  waypoint?: { lat: number; lng: number; label?: string };
}

export interface RidePort {
  quote(request: RideRequest): Promise<RideQuote[]>;
  book(request: RideRequest, providerId: string): Promise<{ bookingId: string; trackingUrl: string }>;
}

export interface StoreItem {
  id: string;
  name: string;
  priceCents: number;
  category: "hydration" | "food" | "remedy";
}

export interface DeliveryPort {
  catalog(near: { lat: number; lng: number }): Promise<StoreItem[]>;
  order(items: { id: string; qty: number }[], to: { label: string }): Promise<{ orderId: string; etaMinutes: number }>;
}

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Catalog drink ids this venue is known to serve, for fast logging. */
  menuDrinkIds: string[];
  foodMenu: { id: string; name: string; priceCents: number }[];
}

export interface VenuePort {
  nearby(at: { lat: number; lng: number }): Promise<Venue[]>;
  byId(id: string): Promise<Venue | undefined>;
}

export interface NotificationPort {
  push(to: string, title: string, body: string): Promise<void>;
}

export interface RouteSuggestion {
  summary: string;
  distanceMeters: number;
  durationMinutes: number;
  /** Why this route was preferred — lighting, foot traffic, main roads. */
  reasons: string[];
}

export interface RoutePort {
  safeRoutes(from: LocationPing, to: { lat: number; lng: number }): Promise<RouteSuggestion[]>;
}
