import type {
  DeliveryPort,
  LocationPing,
  RidePort,
  RideQuote,
  RideRequest,
  RoutePort,
  RouteSuggestion,
  StoreItem,
  Venue,
  VenuePort,
} from "@safehubby/core";

/**
 * Development adapters. The real integrations (Uber/Lyft, DoorDash/Instacart,
 * Google Places/Yelp) drop in behind these same ports without the domain or the
 * UI changing. Fares are always echoed from the provider — Safehubby never
 * computes a fare or a driver payout.
 */

const RIDE_PRODUCTS = [
  { providerId: "uber-x", providerName: "Uber", productName: "UberX", base: 1450, eta: 4 },
  { providerId: "uber-comfort", providerName: "Uber", productName: "Comfort", base: 1980, eta: 7 },
  { providerId: "lyft-standard", providerName: "Lyft", productName: "Lyft", base: 1390, eta: 5 },
];

export const mockRides: RidePort = {
  async quote(request: RideRequest): Promise<RideQuote[]> {
    const km = haversineKm(request.pickup, request.dropoff);
    const stopSurcharge = request.waypoint ? 350 : 0;
    return RIDE_PRODUCTS.map((p) => ({
      providerId: p.providerId,
      providerName: p.providerName,
      productName: p.productName,
      etaMinutes: p.eta,
      fareEstimateCents: Math.round(p.base + km * 210 + stopSurcharge),
      currency: "USD",
      deepLink: `https://example.invalid/ride/${p.providerId}`,
    }));
  },
  async book(_request, providerId) {
    const bookingId = `bk_${providerId}_${Date.now().toString(36)}`;
    return { bookingId, trackingUrl: `https://example.invalid/track/${bookingId}` };
  },
};

const STORE_ITEMS: StoreItem[] = [
  { id: "liquid-iv", name: "Liquid I.V. hydration packs (4)", priceCents: 999, category: "hydration" },
  { id: "gatorade", name: "Gatorade, 32oz", priceCents: 349, category: "hydration" },
  { id: "water-case", name: "Bottled water, 12-pack", priceCents: 499, category: "hydration" },
  { id: "pedialyte", name: "Pedialyte", priceCents: 699, category: "hydration" },
  { id: "breakfast-sandwich", name: "Breakfast sandwich", priceCents: 799, category: "food" },
  { id: "banana", name: "Bananas", priceCents: 199, category: "food" },
  { id: "crackers", name: "Saltine crackers", priceCents: 299, category: "food" },
  { id: "ibuprofen", name: "Ibuprofen, 200mg", priceCents: 899, category: "remedy" },
  { id: "antacid", name: "Antacid tablets", priceCents: 599, category: "remedy" },
];

export const mockDelivery: DeliveryPort = {
  async catalog() {
    return STORE_ITEMS;
  },
  async order(items) {
    const count = items.reduce((n, i) => n + i.qty, 0);
    return { orderId: `ord_${Date.now().toString(36)}`, etaMinutes: 25 + Math.min(20, count * 2) };
  },
};

const VENUES: Venue[] = [
  {
    id: "v-anchor", name: "The Anchor Tavern", lat: 40.7148, lng: -74.0018,
    menuDrinkIds: ["beer-regular", "beer-ipa", "wine-red", "shot-whiskey", "cocktail-old-fashioned", "na-water"],
    foodMenu: [
      { id: "f-wings", name: "Wings", priceCents: 1400 },
      { id: "f-burger", name: "Burger & fries", priceCents: 1800 },
      { id: "f-pretzel", name: "Soft pretzel", priceCents: 900 },
    ],
  },
  {
    id: "v-marisol", name: "Marisol Cantina", lat: 40.7171, lng: -74.0064,
    menuDrinkIds: ["cocktail-margarita", "shot-tequila", "beer-light", "seltzer", "na-soda"],
    foodMenu: [
      { id: "f-tacos", name: "Street tacos (3)", priceCents: 1500 },
      { id: "f-chips", name: "Chips & guac", priceCents: 1100 },
    ],
  },
  {
    id: "v-lantern", name: "Lantern Wine Bar", lat: 40.7112, lng: -73.9971,
    menuDrinkIds: ["wine-red", "wine-white", "seltzer", "na-water"],
    foodMenu: [{ id: "f-board", name: "Cheese board", priceCents: 2200 }],
  },
];

export const mockVenues: VenuePort = {
  async nearby(at) {
    return [...VENUES].sort((a, b) => haversineKm(at, a) - haversineKm(at, b));
  },
  async byId(id) {
    return VENUES.find((v) => v.id === id);
  },
};

export const mockRoutes: RoutePort = {
  async safeRoutes(from: LocationPing, to): Promise<RouteSuggestion[]> {
    const km = haversineKm(from, to);
    return [
      {
        summary: "Main streets via Harbor Ave",
        distanceMeters: Math.round(km * 1000 * 1.15),
        durationMinutes: Math.round(km * 13),
        reasons: ["Lit the whole way", "Busy sidewalks after midnight", "Passes a 24h pharmacy"],
      },
      {
        summary: "Shortest walk via Mill Lane",
        distanceMeters: Math.round(km * 1000),
        durationMinutes: Math.round(km * 11),
        reasons: ["Shortest distance", "Poorly lit for two blocks — not recommended alone at night"],
      },
    ];
  },
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
