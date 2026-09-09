import { afterEach, describe, expect, it } from "vitest";
import { FLAGS, enabledFlags, flagNote, isEnabled, resetFlags, setFlag } from "../src/features.ts";
import { deliverySearch, lyftRide, mapsDirections, pharmacySearch, ridesFor, uberRide } from "../src/deeplinks.ts";

afterEach(resetFlags);

describe("flags", () => {
  it("holds party supply for a later release", () => {
    expect(isEnabled("party-supply")).toBe(false);
  });

  it("keeps every ordering integration off until a partnership exists", () => {
    // None of these providers expose an API a third-party app can order
    // through. Shipping them on would mean inventing fares and baskets.
    for (const flag of ["ride-booking-api", "food-ordering-api", "pharmacy-ordering-api"] as const) {
      expect(isEnabled(flag)).toBe(false);
      expect(flagNote(flag).length).toBeGreaterThan(20);
    }
  });

  it("can be turned on per deployment", () => {
    setFlag("party-supply", true);
    expect(isEnabled("party-supply")).toBe(true);
    expect(enabledFlags()).toContain("party-supply");
  });

  it("resets", () => {
    setFlag("party-supply", true);
    resetFlags();
    expect(isEnabled("party-supply")).toBe(false);
  });

  it("every flag explains itself", () => {
    for (const f of FLAGS) expect(f.note.length).toBeGreaterThan(20);
  });
});

describe("ride hand-off", () => {
  const home = { lat: 40.7488, lng: -73.9857, label: "142 Rowan St" };

  it("builds an Uber universal link with the destination filled in", () => {
    const link = uberRide(home);
    expect(link.url).toContain("m.uber.com/ul/");
    expect(link.url).toContain("action=setPickup");
    expect(link.url).toContain("40.7488");
    expect(link.url).toContain(encodeURIComponent("142 Rowan St").replace(/%20/g, "+"));
  });

  it("lets Uber supply its own pickup fix rather than our stale one", () => {
    expect(uberRide(home).url).toContain("pickup=my_location");
  });

  it("builds a Lyft link", () => {
    expect(lyftRide(home).url).toContain("lyft.com/ride");
    expect(lyftRide(home).url).toContain("-73.9857");
  });

  it("offers a maps fallback for places rideshare does not cover", () => {
    expect(mapsDirections(home).url).toContain("google.com/maps/dir/");
  });

  it("never claims to book or to know a fare", () => {
    for (const link of ridesFor(home)) {
      expect(link.description.toLowerCase()).not.toMatch(/we book|booked for you|\$\d/);
      expect(link.url.startsWith("https://")).toBe(true);
    }
    // Two of the three say who actually takes the payment.
    expect(ridesFor(home).filter((l) => /book there|confirm the fare/i.test(l.description)).length).toBe(2);
  });
});

describe("delivery hand-off", () => {
  it("opens the store with a search rather than pretending to order", () => {
    const dd = deliverySearch("doordash", "chicken soup");
    expect(dd.url).toContain("doordash.com");
    expect(dd.url).toContain("chicken%20soup");
    expect(dd.description).toMatch(/you place and pay/i);

    const ue = deliverySearch("ubereats", "tacos");
    expect(ue.url).toContain("ubereats.com/search");
    expect(ue.description).toMatch(/you place and pay/i);
  });

  it("does the same for the pharmacy run", () => {
    const wg = pharmacySearch("electrolytes");
    expect(wg.url).toContain("walgreens.com");
    expect(wg.description).toMatch(/you place the order/i);
  });

  it("escapes user text into the URL", () => {
    expect(deliverySearch("doordash", "a&b=c").url).toContain("a%26b%3Dc");
  });
});
