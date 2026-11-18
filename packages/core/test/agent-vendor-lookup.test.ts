import { describe, expect, it } from "vitest";
import { lookupVendorsForAgents } from "../src/agent-vendor-lookup.ts";

describe("the vendor lookup sold to other agents", () => {
  it("finds airport VIP services by place, ignoring accents and case", () => {
    const r = lookupVendorsForAgents({ category: "airport-vip", place: "puerto rico" });
    expect(r.total).toBeGreaterThan(0);
    for (const v of r.results) expect(v.area.toLowerCase()).toContain("puerto rico");
  });
  it("needs every word of the search to match", () => {
    const all = lookupVendorsForAgents({ q: "airport" }).total;
    expect(lookupVendorsForAgents({ q: "airport zzzznotaword" }).total).toBe(0);
    expect(all).toBeGreaterThan(0);
  });
  it("caps the number returned and never exposes the owner's private fields", () => {
    const r = lookupVendorsForAgents({ limit: 999 });
    expect(r.results.length).toBe(25);
    for (const v of r.results) {
      expect(Object.keys(v).sort()).toEqual(expect.arrayContaining(["area", "category", "name", "notes", "offers"]));
      expect(v).not.toHaveProperty("ownerNotes");
      expect(v).not.toHaveProperty("contactName");
      expect(v).not.toHaveProperty("status");
    }
  });
  it("ignores a category it does not know", () => {
    expect(lookupVendorsForAgents({ category: "nope", limit: 1 }).total).toBe(lookupVendorsForAgents({ limit: 1 }).total);
  });
});
