import { describe, expect, it } from "vitest";
import { DRINK_CATALOG, alcoholicDrinks, findDrink, logDrink, standardDrinks, totalStandardDrinks } from "../src/drinks.ts";

describe("drinks", () => {
  it("scores a regular beer at roughly one standard drink", () => {
    const beer = findDrink("beer-regular")!;
    expect(standardDrinks(beer)).toBeCloseTo(1, 1);
  });

  it("scores a 5oz glass of wine at roughly one standard drink", () => {
    const wine = findDrink("wine-red")!;
    expect(standardDrinks(wine)).toBeCloseTo(1, 0);
  });

  it("counts a craft IPA as clearly more than one standard drink", () => {
    expect(standardDrinks(findDrink("beer-ipa")!)).toBeGreaterThan(1.5);
  });

  it("scales with servings", () => {
    const beer = findDrink("beer-regular")!;
    expect(standardDrinks(beer, 3)).toBeCloseTo(standardDrinks(beer) * 3, 5);
  });

  it("rejects unknown drinks and non-positive servings", () => {
    expect(() => logDrink({ id: "1", drinkId: "nope", loggedAt: "2026-01-01T00:00:00Z" })).toThrow();
    expect(() =>
      logDrink({ id: "1", drinkId: "beer-regular", servings: 0, loggedAt: "2026-01-01T00:00:00Z" }),
    ).toThrow();
  });

  it("excludes water and mocktails from the alcoholic count", () => {
    const at = "2026-01-01T00:00:00Z";
    const logged = [
      logDrink({ id: "1", drinkId: "beer-regular", loggedAt: at }),
      logDrink({ id: "2", drinkId: "na-water", loggedAt: at }),
      logDrink({ id: "3", drinkId: "na-coffee", loggedAt: at }),
    ];
    expect(alcoholicDrinks(logged)).toHaveLength(1);
    expect(totalStandardDrinks(logged)).toBeCloseTo(1, 1);
  });

  it("has no catalog entry with a negative or absurd abv", () => {
    for (const d of DRINK_CATALOG) {
      expect(d.abv).toBeGreaterThanOrEqual(0);
      expect(d.abv).toBeLessThan(0.6);
    }
  });
});
