import { describe, expect, it } from "vitest";
import {
  HOTEL_PROGRAM_VENDORS, SUGGESTED_VENDOR_LISTS, SUGGESTED_VENDORS, UNITED_STATES_VENDOR_LIST, VENDOR_CATEGORIES, VENDOR_STATUSES,
} from "../src/vendors.ts";

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
    // Each of these is on the business's own site or profile (its sourceUrl). A number found
    // only in a directory stays in the notes, marked to confirm, never in these fields.
    const publishedByTheBusiness: Record<string, { phone?: string; email?: string }> = {
      // Uvas published its own number on its Instagram profile, and the owner supplied it.
      "vnd-uvas-pr": { phone: "939-473-3219" },
      "vnd-el-san-juan-club": { phone: "787-791-1000" },
      "vnd-etc-puerto-rico": { phone: "939-775-7380", email: "info@etcpuertorico.com" },
      "vnd-virtuoso": { phone: "817-870-0300" },
      "vnd-fora": { email: "support@foratravel.com" },
      "vnd-five-star-alliance": { phone: "1-888-578-2711" },
      "vnd-skylark": { phone: "212-759-5275", email: "info@skylark.com" },
      "vnd-indagare": { phone: "212-988-2611", email: "hotel.reservations@indagare.com" },
      "vnd-inspirato": { phone: "888-625-7525", email: "info@inspirato.com" },
      "vnd-private-upgrades": { phone: "617-778-2318" },
    };
    for (const v of SUGGESTED_VENDORS as Record<string, unknown>[]) {
      const published = publishedByTheBusiness[String(v.id)] ?? {};
      expect(v.phone, String(v.id)).toBe(published.phone);
      expect(v.email, String(v.id)).toBe(published.email);
    }
  });

  it("files the US hotel programs under their own list and the Puerto Rico ones under the default", () => {
    expect(SUGGESTED_VENDOR_LISTS).toContainEqual(UNITED_STATES_VENDOR_LIST);
    const us = HOTEL_PROGRAM_VENDORS.filter((v) => v.listId === UNITED_STATES_VENDOR_LIST.id);
    const pr = HOTEL_PROGRAM_VENDORS.filter((v) => v.listId === undefined);
    expect(us).toHaveLength(15);
    expect(pr).toHaveLength(4);
    expect(us.length + pr.length).toBe(HOTEL_PROGRAM_VENDORS.length);
    for (const v of HOTEL_PROGRAM_VENDORS) expect(SUGGESTED_VENDORS, v.id).toContainEqual(v);
  });

  it("starts every vendor as a lead", () => {
    expect(VENDOR_STATUSES[0]).toBe("lead");
  });
});
