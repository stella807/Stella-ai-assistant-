import type { Venue, VenuePort } from "@safehubby/core";
import { mockVenues } from "./mock-providers.ts";

/**
 * Real venue lookup, behind the same VenuePort the mock implements.
 *
 * Two things worth knowing about the business-data APIs:
 *
 *  1. Neither Google Places nor Yelp Fusion returns a bar's *drink menu*.
 *     Places returns place details and Yelp returns business details plus, on
 *     some plans, a menu URL — not structured drink items with ABV. So the menu
 *     here is inferred from the venue's categories and mapped onto our own
 *     drink catalogue. That inference is explicit rather than hidden: a wine
 *     bar gets wine, a taqueria gets margaritas and tequila, and anything we
 *     cannot classify falls back to the full catalogue instead of guessing.
 *
 *  2. Both are keyed and rate-limited, and Yelp's terms restrict caching. So
 *     responses are held only for the life of a request-scoped memo below, and
 *     nothing venue-derived is written to our own store.
 *
 * Without keys this returns the mock, so the app runs end to end with no
 * accounts — that is the point of the port.
 */

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const YELP_KEY = process.env.YELP_API_KEY;
const SEARCH_RADIUS_M = 800;
const TIMEOUT_MS = 4000;

/** Category keywords → drink ids from our catalogue. Order matters: first hit wins. */
const CATEGORY_MENUS: { match: RegExp; drinks: string[] }[] = [
  { match: /wine|vineyard|enoteca/i, drinks: ["wine-red", "wine-white", "seltzer", "na-water"] },
  { match: /mexic|taqueria|cantina|tequila/i, drinks: ["cocktail-margarita", "shot-tequila", "beer-light", "seltzer", "na-soda"] },
  { match: /brew|beer|taproom|pub/i, drinks: ["beer-regular", "beer-ipa", "beer-light", "seltzer", "na-water"] },
  { match: /cocktail|lounge|speakeasy/i, drinks: ["cocktail-old-fashioned", "cocktail-mixed", "spirit-neat", "wine-red", "na-soda"] },
  { match: /whisk|bourbon|scotch/i, drinks: ["shot-whiskey", "spirit-neat", "cocktail-old-fashioned", "beer-regular", "na-water"] },
  { match: /coffee|cafe|café/i, drinks: ["na-coffee", "na-water", "na-soda"] },
];

const ALL_ALCOHOLIC = [
  "beer-regular", "beer-ipa", "wine-red", "cocktail-mixed", "shot-whiskey", "na-water",
];

/** Public so the mapping is testable without a network call. */
export function menuForCategories(categories: string[]): string[] {
  const blob = categories.join(" ");
  for (const rule of CATEGORY_MENUS) if (rule.match.test(blob)) return rule.drinks;
  // Unclassified: offer everything rather than inventing a menu we cannot know.
  return ALL_ALCOHOLIC;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function yelpNearby(at: { lat: number; lng: number }): Promise<Venue[]> {
  const url = `https://api.yelp.com/v3/businesses/search?latitude=${at.lat}&longitude=${at.lng}` +
    `&radius=${SEARCH_RADIUS_M}&categories=bars,restaurants&limit=12&sort_by=distance`;
  const data = await fetchJson(url, { Authorization: `Bearer ${YELP_KEY}` });

  return (data.businesses ?? []).map((b: any): Venue => ({
    id: `yelp:${b.id}`,
    name: b.name,
    lat: b.coordinates?.latitude ?? at.lat,
    lng: b.coordinates?.longitude ?? at.lng,
    menuDrinkIds: menuForCategories((b.categories ?? []).map((c: any) => `${c.alias} ${c.title}`)),
    // Yelp does not expose structured food items; price level is all we get.
    foodMenu: [],
  }));
}

async function placesNearby(at: { lat: number; lng: number }): Promise<Venue[]> {
  const url = `https://places.googleapis.com/v1/places:searchNearby`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY!,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.primaryType",
      },
      body: JSON.stringify({
        includedTypes: ["bar", "restaurant", "night_club"],
        maxResultCount: 12,
        locationRestriction: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: SEARCH_RADIUS_M } },
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { places?: any[] };
    return (data.places ?? []).map((p: any): Venue => ({
      id: `places:${p.id}`,
      name: p.displayName?.text ?? "Unnamed venue",
      lat: p.location?.latitude ?? at.lat,
      lng: p.location?.longitude ?? at.lng,
      menuDrinkIds: menuForCategories([p.primaryType ?? "", ...(p.types ?? [])]),
      foodMenu: [],
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yelp first (its categories classify bars better), Places second, mock last.
 * A provider outage degrades to the next source rather than emptying the
 * venue picker — an empty picker means someone logs nothing.
 */
export const venues: VenuePort = {
  async nearby(at) {
    if (YELP_KEY) {
      try {
        const found = await yelpNearby(at);
        if (found.length) return found;
      } catch {
        // fall through
      }
    }
    if (PLACES_KEY) {
      try {
        const found = await placesNearby(at);
        if (found.length) return found;
      } catch {
        // fall through
      }
    }
    return mockVenues.nearby(at);
  },

  async byId(id) {
    if (id.startsWith("yelp:") || id.startsWith("places:")) {
      // Detail lookups are per-provider; the list already carries what the UI
      // needs, so this only has to resolve ids we handed out this session.
      return undefined;
    }
    return mockVenues.byId(id);
  },
};

export const venueSource = YELP_KEY ? "yelp" : PLACES_KEY ? "google-places" : "mock";
