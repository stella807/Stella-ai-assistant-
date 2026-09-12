import type { NearbyStore, PlaceSearchPort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Free-text place search for the concierge flow — "grab something from
 * wherever," where the customer names the place rather than picking a fixed
 * category. Google Places (New) Text Search fits this better than the
 * Nearby Search `venues.ts` and `grocery.ts` use: Nearby Search takes a
 * closed list of place types, Text Search takes a query string ("CVS on
 * Main St", "the wine store on 5th") the way a person actually describes
 * where they mean.
 *
 * Deliberately no mock fallback, unlike venues.ts/grocery.ts. Those mock a
 * small, fixed list of clearly-fictional venues used consistently across the
 * app's demo data; an arbitrary free-text query has no such fixed answer to
 * fake — inventing a plausible-looking match for whatever someone typed
 * would be actively misleading rather than a helpful stand-in. Unconfigured
 * or failed search returns nothing, and the UI checks `status` up front to
 * explain that rather than showing a search box that quietly never works.
 */

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SEARCH_RADIUS_M = 5000;
const TIMEOUT_MS = 4000;

async function placesTextSearch(query: string, near: { lat: number; lng: number }): Promise<NearbyStore[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY!,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 10,
        locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: SEARCH_RADIUS_M } },
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { places?: any[] };
    return (data.places ?? []).map((p: any): NearbyStore => ({
      id: `places:${p.id}`,
      name: p.displayName?.text ?? "Unnamed place",
      address: p.formattedAddress ?? "",
      lat: p.location?.latitude ?? near.lat,
      lng: p.location?.longitude ?? near.lng,
    }));
  } finally {
    clearTimeout(timer);
  }
}

export const placeSearch: PlaceSearchPort = {
  status: statusFor(
    "places-search", "Google Places", Boolean(PLACES_KEY),
    "A Google Places API (New) key with Text Search enabled, then GOOGLE_PLACES_API_KEY (shared with venues.ts and grocery.ts).",
  ),

  async search(query, near) {
    if (!PLACES_KEY || !query.trim()) return [];
    try {
      return await placesTextSearch(query.trim(), near);
    } catch {
      return [];
    }
  },
};
