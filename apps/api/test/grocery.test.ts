import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStoreNote, storeLocator, storeLocatorSource } from "../src/adapters/grocery.ts";

const ORIGINAL_ENV = { ...process.env };
const HERE = { lat: 40.714, lng: -74.003 };

/** Same reasoning as venues.test.ts: GOOGLE_PLACES_API_KEY is a module-level
 *  const, so exercising the configured path means a fresh import per test. */
async function freshGrocery(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../src/adapters/grocery.ts");
}

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});

describe("buildStoreNote", () => {
  it("says nothing when no store was chosen", () => {
    expect(buildStoreNote(null)).toBeUndefined();
    expect(buildStoreNote(undefined)).toBeUndefined();
  });

  it("names the store and address as a preference, not an instruction to route to it", () => {
    const note = buildStoreNote({ name: "Corner Market", address: "210 Bridge St" });
    expect(note).toMatch(/Corner Market/);
    expect(note).toMatch(/210 Bridge St/);
    expect(note).toMatch(/if it's available/i);
  });

  it("still works with no address", () => {
    expect(buildStoreNote({ name: "Corner Market" })).toMatch(/Corner Market/);
  });
});

describe("storeLocator", () => {
  it("falls back to the mock list with no Google Places key configured", async () => {
    expect(storeLocatorSource).toBe("mock");
    const found = await storeLocator.nearby({ lat: 40.7135, lng: -74.0041 });
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatchObject({ name: expect.any(String), address: expect.any(String) });
  });

  it("sorts by distance from the given point", async () => {
    const found = await storeLocator.nearby({ lat: 40.7161, lng: -73.9989 });
    expect(found[0].name).toBe("Downtown Pharmacy");
  });
});

describe("storeLocator — Google Places, real fetch mapping", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ORIGINAL_ENV }; vi.resetModules(); });

  it("maps a Places result into a NearbyStore with an address", async () => {
    const mod = await freshGrocery({ GOOGLE_PLACES_API_KEY: "pk" });
    expect(mod.storeLocatorSource).toBe("google-places");
    (fetch as any).mockResolvedValueOnce(jsonResponse({
      places: [{
        id: "p1", displayName: { text: "Downtown Pharmacy" }, formattedAddress: "88 Harbor Ave",
        location: { latitude: 40.7161, longitude: -73.9989 },
      }],
    }));
    const found = await mod.storeLocator.nearby(HERE);
    expect(found).toEqual([{ id: "places:p1", name: "Downtown Pharmacy", address: "88 Harbor Ave", lat: 40.7161, lng: -73.9989 }]);
  });

  it("searches pharmacy and grocery types, not bars — a different job than venues.ts", async () => {
    const mod = await freshGrocery({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ places: [] }));
    await mod.storeLocator.nearby(HERE);
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchNearby");
    const body = JSON.parse(opts.body);
    expect(body.includedTypes).toEqual(["grocery_store", "supermarket", "pharmacy", "convenience_store"]);
    expect(opts.headers["X-Goog-Api-Key"]).toBe("pk");
  });

  it("names an unrecognized store rather than leaving it blank, and defaults a missing address", async () => {
    const mod = await freshGrocery({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ places: [{ id: "p2" }] }));
    const found = await mod.storeLocator.nearby(HERE);
    expect(found[0]).toMatchObject({ name: "Unnamed store", address: "", lat: HERE.lat, lng: HERE.lng });
  });

  it("falls back to the mock on a request error, never an empty picker", async () => {
    const mod = await freshGrocery({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    const found = await mod.storeLocator.nearby(HERE);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].id).not.toMatch(/^places:/);
  });

  it("falls back to the mock on a non-ok response", async () => {
    const mod = await freshGrocery({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({}, false, 403));
    const found = await mod.storeLocator.nearby(HERE);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].id).not.toMatch(/^places:/);
  });

  it("falls back to the mock when Places returns zero results", async () => {
    const mod = await freshGrocery({ GOOGLE_PLACES_API_KEY: "pk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ places: [] }));
    const found = await mod.storeLocator.nearby(HERE);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].id).not.toMatch(/^places:/);
  });
});
