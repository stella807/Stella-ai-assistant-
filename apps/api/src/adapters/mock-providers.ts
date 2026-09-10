import type {
  DeliveryPort,
  LocationPing,
  NearbyStore,
  RidePort,
  RideQuote,
  RideRequest,
  RoutePort,
  RouteSuggestion,
  StoreItem,
  StorePort,
  Venue,
  VenuePort,
  VenueSignals,
} from "@safehubby/core";
import { menuForVenue } from "@safehubby/core";

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

/**
 * Mock venues carry the same signals Google Places returns — primaryType,
 * types, priceLevel — and their menus are derived through the same
 * `menuForVenue` the real adapter uses, rather than hardcoded.
 *
 * That matters more than it looks. Nobody runs this app with a Places key in
 * development, so a hardcoded mock menu means the inference never executes
 * outside production: the one path that decides what a drunk person taps would
 * be the one path nobody ever sees running. These stand in for the API's
 * answer, not for the mapping applied to it.
 */
const MOCK_PLACES: (Omit<Venue, "menuDrinkIds" | "menuReason"> & VenueSignals)[] = [
  {
    id: "v-anchor", name: "The Anchor Tavern", lat: 40.7148, lng: -74.0018,
    primaryType: "bar", types: ["bar", "restaurant", "sports_bar"], priceLevel: 2,
    foodMenu: [
      { id: "f-wings", name: "Wings", priceCents: 1400 },
      { id: "f-burger", name: "Burger & fries", priceCents: 1800 },
      { id: "f-pretzel", name: "Soft pretzel", priceCents: 900 },
    ],
  },
  {
    id: "v-marisol", name: "Marisol Cantina", lat: 40.7171, lng: -74.0064,
    primaryType: "mexican_restaurant", types: ["mexican_restaurant", "bar", "restaurant"], priceLevel: 2,
    foodMenu: [
      { id: "f-tacos", name: "Street tacos (3)", priceCents: 1500 },
      { id: "f-chips", name: "Chips & guac", priceCents: 1100 },
    ],
  },
  {
    id: "v-lantern", name: "Lantern Wine Bar", lat: 40.7112, lng: -73.9971,
    primaryType: "wine_bar", types: ["wine_bar", "bar"], priceLevel: 3,
    foodMenu: [{ id: "f-board", name: "Cheese board", priceCents: 2200 }],
  },
  {
    id: "v-fathom", name: "Fathom Brewing Co.", lat: 40.7129, lng: -74.0089,
    primaryType: "brewery", types: ["brewery", "bar", "restaurant"], priceLevel: 2,
    foodMenu: [{ id: "f-board2", name: "Pretzel board", priceCents: 1300 }],
  },
  {
    // Places would tag this only `bar`. The name is the whole signal.
    id: "v-rye", name: "Bourbon & Rye", lat: 40.7157, lng: -74.0031,
    primaryType: "bar", types: ["bar"], priceLevel: 4,
    foodMenu: [],
  },
  {
    id: "v-vault", name: "The Vault", lat: 40.7183, lng: -74.0052,
    primaryType: "night_club", types: ["night_club", "bar"], priceLevel: 3,
    foodMenu: [],
  },
];

const VENUES: Venue[] = MOCK_PLACES.map(({ primaryType, types, priceLevel, ...venue }) => {
  const menu = menuForVenue({ name: venue.name, primaryType, types, priceLevel });
  return { ...venue, menuDrinkIds: menu.drinkIds, menuReason: menu.reason };
});

export const mockVenues: VenuePort = {
  async nearby(at) {
    return [...VENUES].sort((a, b) => haversineKm(at, a) - haversineKm(at, b));
  },
  async byId(id) {
    return VENUES.find((v) => v.id === id);
  },
};

const STORES: NearbyStore[] = [
  { id: "s-corner-market", name: "Corner Market", address: "210 Bridge St", lat: 40.7135, lng: -74.0041 },
  { id: "s-downtown-pharmacy", name: "Downtown Pharmacy", address: "88 Harbor Ave", lat: 40.7161, lng: -73.9989 },
  { id: "s-quickstop", name: "QuickStop", address: "45 Mill Lane", lat: 40.7102, lng: -74.0007 },
];

export const mockStores: StorePort = {
  async nearby(at) {
    return [...STORES].sort((a, b) => haversineKm(at, a) - haversineKm(at, b));
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
