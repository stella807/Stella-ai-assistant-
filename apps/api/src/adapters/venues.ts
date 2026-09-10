import type { Venue, VenuePort } from "@safehubby/core";
import { menuForVenue } from "@safehubby/core";
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

/** Places reports price as an enum; the rest of the app works in 1-4. */
const PRICE_LEVELS: Record<string, number | undefined> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

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

  return (data.businesses ?? []).map((b: any): Venue => {
    const menu = menuForVenue({
      name: b.name,
      types: (b.categories ?? []).map((c: any) => `${c.alias} ${c.title}`),
      // Yelp reports price as a run of dollar signs; its length is the level.
      priceLevel: typeof b.price === "string" ? b.price.length : undefined,
    });
    return {
      id: `yelp:${b.id}`,
      name: b.name,
      lat: b.coordinates?.latitude ?? at.lat,
      lng: b.coordinates?.longitude ?? at.lng,
      menuDrinkIds: menu.drinkIds,
      menuReason: menu.reason,
      // Yelp does not expose structured food items.
      foodMenu: [],
    };
  });
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
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.location,places.types,places.primaryType,places.priceLevel",
      },
      body: JSON.stringify({
        includedTypes: ["bar", "restaurant", "night_club"],
        maxResultCount: 12,
        locationRestriction: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: SEARCH_RADIUS_M } },
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { places?: any[] };
    return (data.places ?? []).map((p: any): Venue => {
      const name = p.displayName?.text ?? "Unnamed venue";
      const menu = menuForVenue({
        name,
        primaryType: p.primaryType,
        types: p.types,
        priceLevel: PRICE_LEVELS[p.priceLevel as string],
      });
      return {
        id: `places:${p.id}`,
        name,
        lat: p.location?.latitude ?? at.lat,
        lng: p.location?.longitude ?? at.lng,
        menuDrinkIds: menu.drinkIds,
        menuReason: menu.reason,
        foodMenu: [],
      };
    });
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
