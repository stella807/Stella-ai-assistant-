import type { LocationPing } from "./types.ts";
import type { PushMessage } from "./push.ts";
import type { ProviderStatus } from "./fulfillment.ts";

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
  /** Why those drinks — an inferred menu says so rather than implying a real one. */
  menuReason?: string;
  foodMenu: { id: string; name: string; priceCents: number }[];
}

export interface VenuePort {
  nearby(at: { lat: number; lng: number }): Promise<Venue[]>;
  byId(id: string): Promise<Venue | undefined>;
}

export interface NearbyStore {
  id: string;
  name: string;
  /** Human-readable, for display and for the note passed to a delivery provider. */
  address: string;
  lat: number;
  lng: number;
}

/**
 * "Which real store is this near" — Google Places/Yelp-backed, same as
 * VenuePort. This does not select a delivery provider's retailer for a basket:
 * Instacart's own retailer ids come from its own Retailers endpoint, keyed by
 * postal code, and a Google Place has no reliable mapping onto one. So a
 * chosen store here becomes a preference passed along as a note, not a
 * guaranteed routing — see grocery.ts.
 */
export interface StorePort {
  nearby(at: { lat: number; lng: number }): Promise<NearbyStore[]>;
}

/**
 * Sending the push. What to send and to whom is decided in push.ts; this only
 * carries it. `status` mirrors the fulfilment adapters: the app states whether
 * push is actually configured rather than failing silently, because a guardian
 * who believes they will be woken and will not be is worse off than one who
 * knows the app cannot reach them.
 */
export interface PushPort {
  readonly status: ProviderStatus;
  send(messages: PushMessage[]): Promise<{ sent: number; failed: number }>;
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

/**
 * Free-text place search — "whatever the customer needs": a specific
 * pharmacy, a wine store, a particular restaurant by name — not fixed to one
 * type the way `VenuePort` (bars) and `StorePort` (grocery/pharmacy) are.
 * Backs the concierge task flow's place picker, so a request names a
 * confirmed real place rather than however someone happened to spell it from
 * memory. `status` is exposed the same way every other adapter's is, so the
 * UI can say plainly when search isn't configured rather than offering a box
 * that quietly returns nothing forever.
 */
export interface PlaceSearchPort {
  readonly status: ProviderStatus;
  search(query: string, near: { lat: number; lng: number }): Promise<NearbyStore[]>;
}
