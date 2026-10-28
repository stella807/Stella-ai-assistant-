import { describe, expect, it } from "vitest";
import { SUGGESTED_VENDORS, VENDOR_CATEGORIES, VENDOR_STATUSES } from "../src/vendors.ts";

describe("the suggested vendor list", () => {
  it("has a unique id and a name for every entry", () => {
    const ids = SUGGESTED_VENDORS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of SUGGESTED_VENDORS) expect(v.name.trim().length, v.id).toBeGreaterThan(2);
  });

  it("puts every entry in a real category, and covers each category", () => {
    const known = VENDOR_CATEGORIES.map((c) => c.id);
    for (const v of SUGGESTED_VENDORS) expect(known, v.id).toContain(v.category);
    for (const c of known) expect(SUGGESTED_VENDORS.some((v) => v.category === c), c).toBe(true);
  });

  it("links only to https sources", () => {
    for (const v of SUGGESTED_VENDORS) if (v.sourceUrl) expect(v.sourceUrl, v.id).toMatch(/^https:\/\//);
  });

  it("never carries a phone number or email it did not find", () => {
    for (const v of SUGGESTED_VENDORS as Record<string, unknown>[]) {
      expect(v.phone, String(v.id)).toBeUndefined();
      expect(v.email, String(v.id)).toBeUndefined();
    }
  });

  it("starts every vendor as a lead", () => {
    expect(VENDOR_STATUSES[0]).toBe("lead");
  });
});
