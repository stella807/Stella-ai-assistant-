import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const HERE = { lat: 40.714, lng: -74.003 };

async function freshPlaceSearch(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../src/adapters/places-search.ts");
}

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ORIGINAL_ENV }; vi.resetModules(); });

describe("placeSearch — unconfigured", () => {
  it("reports handoff and never calls the network", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: undefined });
    expect(mod.placeSearch.status.mode).toBe("handoff");
    expect(await mod.placeSearch.search("CVS", HERE)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("placeSearch — configured", () => {
  it("reports automatic and maps a real result", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: "pk" });
    expect(mod.placeSearch.status.mode).toBe("automatic");
    (fetch as any).mockResolvedValueOnce(jsonResponse({
      places: [{ id: "p1", displayName: { text: "CVS Pharmacy" }, formattedAddress: "99 Main St", location: { latitude: 40.72, longitude: -74.0 } }],
    }));
    const found = await mod.placeSearch.search("CVS", HERE);
    expect(found).toEqual([{ id: "places:p1", name: "CVS Pharmacy", address: "99 Main St", lat: 40.72, lng: -74.0 }]);
  });

  it("sends a text query, not a fixed type list", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ places: [] }));
    await mod.placeSearch.search("the wine store on 5th", HERE);
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    const body = JSON.parse(opts.body);
    expect(body.textQuery).toBe("the wine store on 5th");
    expect(body.locationBias.circle.center).toEqual({ latitude: HERE.lat, longitude: HERE.lng });
  });

  it("never guesses a match for an empty query", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: "pk" });
    expect(await mod.placeSearch.search("   ", HERE)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns nothing rather than throwing on a request failure", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    expect(await mod.placeSearch.search("CVS", HERE)).toEqual([]);
  });

  it("returns nothing on a non-ok response, never a fake match", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({}, false, 429));
    expect(await mod.placeSearch.search("CVS", HERE)).toEqual([]);
  });

  it("names an unrecognized place rather than leaving it blank", async () => {
    const mod = await freshPlaceSearch({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ places: [{ id: "p2" }] }));
    const found = await mod.placeSearch.search("something", HERE);
    expect(found[0]).toMatchObject({ name: "Unnamed place", address: "", lat: HERE.lat, lng: HERE.lng });
  });
});
