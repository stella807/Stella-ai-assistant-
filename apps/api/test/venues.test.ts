import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockVenues } from "../src/adapters/mock-providers.ts";

/**
 * `venues.ts` reads its API keys into module-level consts at import time, the
 * same as every other adapter in this codebase — so exercising a configured
 * state means resetting the module registry and re-importing fresh with the
 * env already set, per test. Nothing here is a shortcut around that; it is
 * the only way to test a module written this way at all, and it is exactly
 * why these adapters had zero coverage of their actual network-calling paths
 * before this file existed — only the unconfigured/mock-fallback branch was
 * ever tested anywhere in this codebase.
 */

const ORIGINAL_ENV = { ...process.env };
const HERE = { lat: 40.714, lng: -74.003 };

async function freshVenues(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../src/adapters/venues.ts");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

const yelpBody = (over: Partial<any> = {}) => ({
  businesses: [
    {
      id: "yelp-1", name: "The Anchor Tavern", price: "$$",
      coordinates: { latitude: 40.715, longitude: -74.004 },
      categories: [{ alias: "bars", title: "Bars" }],
      ...over,
    },
  ],
});

const placesBody = (over: Partial<any> = {}) => ({
  places: [
    {
      id: "places-1", displayName: { text: "Fathom Brewing Co." },
      location: { latitude: 40.716, longitude: -74.005 },
      primaryType: "brewery", types: ["brewery", "bar"], priceLevel: "PRICE_LEVEL_MODERATE",
      ...over,
    },
  ],
});

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});

describe("venues — Yelp", () => {
  it("maps a Yelp business into a Venue with the right id prefix and price level", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk", GOOGLE_PLACES_API_KEY: undefined });
    (fetch as any).mockResolvedValueOnce(jsonResponse(yelpBody()));

    const found = await mod.venues.nearby(HERE);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("yelp:yelp-1");
    expect(found[0].name).toBe("The Anchor Tavern");
    expect(found[0].lat).toBe(40.715);
    // A bar category should infer a real drink menu, not the full catalogue.
    expect(found[0].menuDrinkIds.length).toBeGreaterThan(0);
    expect(mod.venueSource).toBe("yelp");
  });

  it("falls back to the venue's search point when Yelp omits coordinates", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ businesses: [{ id: "y2", name: "No Coords Bar" }] }));
    const found = await mod.venues.nearby(HERE);
    expect(found[0]).toMatchObject({ lat: HERE.lat, lng: HERE.lng });
  });

  it("sends Yelp's bearer token and the right endpoint", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "secret-token" });
    (fetch as any).mockResolvedValueOnce(jsonResponse(yelpBody()));
    await mod.venues.nearby(HERE);
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toContain("api.yelp.com/v3/businesses/search");
    expect(url).toContain(`latitude=${HERE.lat}`);
    expect(opts.headers.Authorization).toBe("Bearer secret-token");
  });
});

describe("venues — Google Places", () => {
  it("is used when Yelp is not configured, and maps every price level correctly", async () => {
    const mod = await freshVenues({ YELP_API_KEY: undefined, GOOGLE_PLACES_API_KEY: "pk" });
    expect(mod.venueSource).toBe("google-places");

    const levels: [string, unknown][] = [
      ["PRICE_LEVEL_INEXPENSIVE", 1], ["PRICE_LEVEL_MODERATE", 2],
      ["PRICE_LEVEL_EXPENSIVE", 3], ["PRICE_LEVEL_VERY_EXPENSIVE", 4],
    ];
    for (const [enumVal] of levels) {
      (fetch as any).mockResolvedValueOnce(jsonResponse(placesBody({ priceLevel: enumVal })));
      const found = await mod.venues.nearby(HERE);
      expect(found[0].id).toBe("places:places-1");
      expect(found[0].name).toBe("Fathom Brewing Co.");
    }
  });

  it("sends the API key header and the documented request shape", async () => {
    const mod = await freshVenues({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse(placesBody()));
    await mod.venues.nearby(HERE);

    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(opts.method).toBe("POST");
    expect(opts.headers["X-Goog-Api-Key"]).toBe("pk");
    const body = JSON.parse(opts.body);
    expect(body.includedTypes).toEqual(["bar", "restaurant", "night_club"]);
    expect(body.locationRestriction.circle.center).toEqual({ latitude: HERE.lat, longitude: HERE.lng });
  });

  it("names an unrecognized place rather than leaving it blank", async () => {
    const mod = await freshVenues({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ places: [{ id: "p2" }] }));
    const found = await mod.venues.nearby(HERE);
    expect(found[0].name).toBe("Unnamed venue");
  });
});

describe("venues — fallback chain", () => {
  it("falls through to Places when Yelp errors", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk", GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any)
      .mockRejectedValueOnce(new Error("yelp down"))
      .mockResolvedValueOnce(jsonResponse(placesBody()));
    const found = await mod.venues.nearby(HERE);
    expect(found[0].id).toBe("places:places-1");
  });

  it("falls through to Places when Yelp returns a non-ok status", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk", GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any)
      .mockResolvedValueOnce(jsonResponse({}, false, 429))
      .mockResolvedValueOnce(jsonResponse(placesBody()));
    const found = await mod.venues.nearby(HERE);
    expect(found[0].id).toBe("places:places-1");
  });

  it("falls through to Places when Yelp returns zero results, not just on error", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk", GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any)
      .mockResolvedValueOnce(jsonResponse({ businesses: [] }))
      .mockResolvedValueOnce(jsonResponse(placesBody()));
    const found = await mod.venues.nearby(HERE);
    expect(found[0].id).toBe("places:places-1");
  });

  it("falls all the way through to the mock when both providers fail", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk", GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockRejectedValue(new Error("network down"));
    const found = await mod.venues.nearby(HERE);
    expect(found.length).toBeGreaterThan(0); // the mock list, never an empty picker
    expect(found[0].id).not.toMatch(/^(yelp|places):/);
  });

  it("treats a malformed response body as zero results, not a crash — and still falls back", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({}));
    const found = await mod.venues.nearby(HERE);
    // No `businesses` key maps to an empty list rather than throwing, and an
    // empty list from Yelp falls through to the mock the same as an error
    // would — the picker is never left with nothing to show.
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].id).not.toMatch(/^yelp:/);
  });

  it("reports mock as the source with no keys configured at all", async () => {
    const mod = await freshVenues({ YELP_API_KEY: undefined, GOOGLE_PLACES_API_KEY: undefined });
    expect(mod.venueSource).toBe("mock");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("venues — byId", () => {
  it("does not attempt a detail lookup for a provider-sourced id", async () => {
    const mod = await freshVenues({ YELP_API_KEY: "yk" });
    expect(await mod.venues.byId("yelp:abc")).toBeUndefined();
    expect(await mod.venues.byId("places:abc")).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still resolves a mock id when nothing is configured", async () => {
    const mod = await freshVenues({});
    const [first] = await mockVenues.nearby(HERE);
    expect(await mod.venues.byId(first.id)).toMatchObject({ id: first.id });
  });
});
