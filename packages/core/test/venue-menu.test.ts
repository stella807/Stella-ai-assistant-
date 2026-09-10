import { describe, expect, it } from "vitest";
import { menuForCategories, menuForVenue } from "../src/venue-menu.ts";
import { findDrink } from "../src/drinks.ts";

describe("menu inference from location signals", () => {
  it("every drink it can suggest is a real catalogue entry", () => {
    const venues = [
      { name: "The Whisky Room" }, { name: "Lantern Wine Bar" }, { types: ["brewery"] },
      { types: ["mexican_restaurant"] }, { types: ["sports_bar"] }, { primaryType: "night_club" },
      { types: ["coffee_shop"] }, { types: ["restaurant"] }, { types: ["shoe_shop"] },
    ];
    for (const v of venues) {
      for (const id of menuForVenue(v).drinkIds) {
        expect(findDrink(id), `${id} is not in the catalogue`).toBeDefined();
      }
    }
  });

  it("never returns an empty menu, however odd the place", () => {
    expect(menuForVenue({ types: ["laundromat"] }).drinkIds.length).toBeGreaterThan(0);
    expect(menuForVenue({}).drinkIds.length).toBeGreaterThan(0);
  });

  it("reads the venue's own name, not just its type", () => {
    // Places would tag this `bar`; the name is the only thing that says whisky.
    const menu = menuForVenue({ name: "Bourbon & Rye", types: ["bar", "restaurant"] });
    expect(menu.drinkIds[0]).toBe("shot-whiskey");
    expect(menu.reason).toMatch(/whiskey/i);
  });

  it("leads a brewery with the craft pour, which is the stronger one", () => {
    const menu = menuForVenue({ types: ["brewery", "bar"] });
    expect(menu.drinkIds[0]).toBe("beer-ipa");
    // The whole point: the IPA is logged at 6.8%, not a generic 5%.
    expect(findDrink("beer-ipa")!.abv).toBeGreaterThan(findDrink("beer-regular")!.abv);
  });

  it("picks agave over the generic restaurant tag for a taqueria", () => {
    const menu = menuForVenue({ name: "Marisol Cantina", types: ["restaurant", "bar"] });
    expect(menu.drinkIds).toContain("cocktail-margarita");
    expect(menu.drinkIds).toContain("shot-tequila");
  });

  it("says plainly when it does not know the place", () => {
    expect(menuForVenue({ types: ["hardware_store"] }).reason).toMatch(/not known/i);
  });

  it("leads an expensive room with measured pours, a cheap one with well drinks", () => {
    const pricey = menuForVenue({ types: ["cocktail_bar"], priceLevel: 4 });
    expect(pricey.drinkIds[0]).toBe("cocktail-old-fashioned");

    const cheap = menuForVenue({ types: ["cocktail_bar"], priceLevel: 1 });
    expect(cheap.drinkIds[0]).toBe("cocktail-mixed");
  });

  it("keeps each archetype's own lead when price reorders it", () => {
    // The same price level, two rooms: the cocktail bar still leads with the
    // cocktail, the whiskey bar with the neat pour. A single global ranking
    // would have handed both the same first tap.
    expect(menuForVenue({ types: ["cocktail_bar"], priceLevel: 4 }).drinkIds[0]).toBe("cocktail-old-fashioned");
    expect(menuForVenue({ name: "Bourbon & Rye", priceLevel: 4 }).drinkIds[0]).toBe("spirit-neat");
  });

  it("never invents a drink the archetype did not already offer", () => {
    const base = menuForVenue({ types: ["brewery"] }).drinkIds;
    for (const level of [1, 2, 3, 4]) {
      const withPrice = menuForVenue({ types: ["brewery"], priceLevel: level }).drinkIds;
      expect([...withPrice].sort()).toEqual([...base].sort());
    }
  });

  it("still answers a bare category list", () => {
    expect(menuForCategories(["wine_bar"])).toContain("wine-red");
  });
});
