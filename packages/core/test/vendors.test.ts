import { describe, expect, it } from "vitest";
import {
  AIRPORT_VIP_VENDORS, HOTEL_PROGRAM_VENDORS, SUGGESTED_VENDOR_LISTS, SUGGESTED_VENDORS, UNITED_STATES_VENDOR_LIST, VENDOR_CATEGORIES,
  VENDOR_STATUSES, WORLDWIDE_VENDOR_LIST,
} from "../src/vendors.ts";
import { AIRSSIST_CONTACT, JODOGO_CONTACT, SKYVIP_CONTACT } from "../src/airport-vip-vendors.ts";

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
      // Airport VIP services: a company-wide contact, read on the company's own site (a few from a government
      // or operator document, said so in their notes). The big providers have one contact for every city.
      "vnd-avip-five-stars-san-juan": { phone: "+590 590 52 39 82", email: "info@fivestars-stbarth.com" },
      "vnd-avip-clear-concierge-miami": { email: "clearconcierge@clearme.com" },
      "vnd-avip-heathrow-vip": { phone: "+44 20 8757 2227", email: "enquiriesvip@heathrow.com" },
      "vnd-avip-extime-paris": { phone: "+33 1 80 90 45 15", email: "contact@parisloungenetwork.com" },
      "vnd-avip-precellence-paris": { phone: "+33 1 58 96 39 43", email: "contact@precellence-service.com" },
      "vnd-avip-changi-recommends-singapore": { phone: "+65 8051 9119", email: "changimeetgreet@changirecommends.com.sg" },
      "vnd-avip-jetquay-singapore": { email: "reservations@jetquay.com.sg" },
      "vnd-avip-plaza-premium-hong-kong": { phone: "+852 5700 5329" },
      "vnd-avip-japan-royal-service-tokyo": { phone: "+81 70 1378 1777", email: "info@japanroyalservice.com" },
      "vnd-avip-royal-airport-concierge": { phone: "+1 (855) 455-1555" },
      "vnd-avip-airportassist-network": { phone: "+1 650 308 9964", email: "service@airportassist.com" },
    };
    const MARHABA = { phone: "+971 800 627 4222", email: "marhaba@marhabaservices.com" };
    const providerContact = (id: string): { phone?: string; email?: string } | undefined =>
      id.startsWith("vnd-avip-jodogo-") ? JODOGO_CONTACT
        : id.startsWith("vnd-avip-airssist-") ? AIRSSIST_CONTACT
        : id.startsWith("vnd-avip-skyvip-") ? SKYVIP_CONTACT
        : id.startsWith("vnd-avip-marhaba-") ? MARHABA
        : undefined;
    for (const v of SUGGESTED_VENDORS as Record<string, unknown>[]) {
      const published = publishedByTheBusiness[String(v.id)] ?? providerContact(String(v.id)) ?? {};
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

  describe("airport VIP services, by city", () => {
    it("pins a city and country on each one, and files it by where it is", () => {
      expect(AIRPORT_VIP_VENDORS.length).toBeGreaterThan(80);
      expect(SUGGESTED_VENDOR_LISTS).toContainEqual(WORLDWIDE_VENDOR_LIST);
      for (const v of AIRPORT_VIP_VENDORS) {
        expect(v.category, v.id).toBe("airport-vip");
        expect(v.id, v.id).toMatch(/^vnd-avip-/);
        if (v.area === "Worldwide") { expect(v.listId, v.id).toBe(WORLDWIDE_VENDOR_LIST.id); continue; }
        expect(v.area, v.id).toMatch(/^[^,]+, [^,]+$/);
        const country = v.area.split(", ")[1]!;
        const expected = country === "Puerto Rico" ? undefined : country === "United States" ? UNITED_STATES_VENDOR_LIST.id : WORLDWIDE_VENDOR_LIST.id;
        expect(v.listId, v.id).toBe(expected);
      }
    });

    it("covers Puerto Rico, the US and many other countries", () => {
      const countries = new Set(AIRPORT_VIP_VENDORS.map((v) => v.area.split(", ")[1] ?? v.area));
      expect(countries.has("Puerto Rico")).toBe(true);
      expect(countries.has("United States")).toBe(true);
      expect(countries.size).toBeGreaterThanOrEqual(25);
    });

    it("gives every one a website to check it against, and says where each company's contact came from", () => {
      for (const v of AIRPORT_VIP_VENDORS) {
        expect(v.sourceUrl, v.id).toMatch(/^https:\/\//);
        expect(v.notes.length, v.id).toBeGreaterThan(40);
      }
    });

    it("has one entry per provider and city", () => {
      const keys = AIRPORT_VIP_VENDORS.map((v) => v.name);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("writes the lists' ids the same way vendors.ts does", () => {
      expect(UNITED_STATES_VENDOR_LIST.id).toBe("list-united-states");
      expect(WORLDWIDE_VENDOR_LIST.id).toBe("list-worldwide");
    });
  });
});
