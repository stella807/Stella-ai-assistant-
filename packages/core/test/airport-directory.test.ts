import { describe, expect, it } from "vitest";
import { AIRPORT_VIP_VENDORS } from "../src/airport-vip-vendors.ts";
import { AIRPORTS, lookupAirports } from "../src/airport-directory.ts";

describe("the airport directory", () => {
  it("has an entry for every city we research, so none is missing", () => {
    const cities = new Set(AIRPORT_VIP_VENDORS.map((v) => v.area ?? "").filter((a) => a && a !== "Worldwide"));
    const have = new Set(AIRPORTS.map((a) => `${a.city}, ${a.country}`));
    expect([...cities].filter((c) => !have.has(c))).toEqual([]);
  });

  it("gives each airport a name and a three-letter code, and a code never means two different airports", () => {
    const nameOf = new Map<string, string>();
    for (const a of AIRPORTS) for (const p of a.airports) {
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.code).toMatch(/^[A-Z]{3}$/);
      expect(nameOf.get(p.code) ?? p.name).toBe(p.name);
      nameOf.set(p.code, p.name);
    }
  });

  it("finds by city, country, airport name or code, and shows nothing about any service or company", () => {
    expect(lookupAirports({ q: "SJU" }).results[0]).toMatchObject({ city: "San Juan", country: "Puerto Rico" });
    expect(lookupAirports({ q: "heathrow" }).results.map((r) => r.city)).toEqual(["London"]);
    expect(lookupAirports({ country: "japan" }).total).toBeGreaterThanOrEqual(2);
    expect(lookupAirports({ q: "zzzz" }).total).toBe(0);
    const everything = JSON.stringify(lookupAirports({ limit: 999 }));
    for (const forbidden of [/vip/i, /jodogo/i, /skyvip/i, /airssist/i, /marhaba/i, /meet and greet/i, /phone/i, /@/, /https?:/i, /concierge/i]) expect(everything).not.toMatch(forbidden);
  });
});
