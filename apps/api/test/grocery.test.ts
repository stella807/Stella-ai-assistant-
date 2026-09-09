import { describe, expect, it } from "vitest";
import { buildStoreNote, storeLocator, storeLocatorSource } from "../src/adapters/grocery.ts";

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
