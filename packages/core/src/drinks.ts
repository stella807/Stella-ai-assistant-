import {
  GRAMS_PER_STANDARD_DRINK,
  type DrinkCategory,
  type DrinkDefinition,
  type LoggedDrink,
} from "./types.ts";

/** Ethanol density, g/mL. Used to turn a pour into grams of alcohol. */
const ETHANOL_DENSITY = 0.789;
const ML_PER_FL_OZ = 29.5735;

/**
 * A small, opinionated catalog. Venue menus (Places/Yelp adapters) layer on top
 * of this: an unknown menu item still resolves to one of these categories so the
 * alcohol math never falls back to a guess of zero.
 */
export const DRINK_CATALOG: DrinkDefinition[] = [
  { id: "beer-light", name: "Light beer", category: "beer", servingOz: 12, abv: 0.042, calories: 103 },
  { id: "beer-regular", name: "Regular beer", category: "beer", servingOz: 12, abv: 0.05, calories: 154 },
  { id: "beer-ipa", name: "IPA / craft beer", category: "beer", servingOz: 16, abv: 0.068, calories: 260 },
  { id: "wine-red", name: "Red wine", category: "wine", servingOz: 5, abv: 0.135, calories: 125 },
  { id: "wine-white", name: "White wine", category: "wine", servingOz: 5, abv: 0.12, calories: 121 },
  { id: "seltzer", name: "Hard seltzer", category: "seltzer", servingOz: 12, abv: 0.05, calories: 100 },
  { id: "cocktail-margarita", name: "Margarita", category: "cocktail", servingOz: 6, abv: 0.13, calories: 280 },
  { id: "cocktail-old-fashioned", name: "Old fashioned", category: "cocktail", servingOz: 3.5, abv: 0.32, calories: 180 },
  { id: "cocktail-mixed", name: "Mixed drink (well)", category: "cocktail", servingOz: 6, abv: 0.12, calories: 200 },
  { id: "shot-whiskey", name: "Shot of whiskey", category: "shot", servingOz: 1.5, abv: 0.4, calories: 97 },
  { id: "shot-tequila", name: "Shot of tequila", category: "shot", servingOz: 1.5, abv: 0.4, calories: 97 },
  { id: "spirit-neat", name: "Spirit, neat", category: "spirit", servingOz: 2, abv: 0.4, calories: 130 },
  { id: "na-water", name: "Water", category: "non-alcoholic", servingOz: 16, abv: 0, calories: 0 },
  { id: "na-soda", name: "Soda / mocktail", category: "non-alcoholic", servingOz: 12, abv: 0, calories: 140 },
  { id: "na-coffee", name: "Coffee", category: "non-alcoholic", servingOz: 8, abv: 0, calories: 5 },
];

const BY_ID = new Map(DRINK_CATALOG.map((d) => [d.id, d]));

export function findDrink(drinkId: string): DrinkDefinition | undefined {
  return BY_ID.get(drinkId);
}

export function drinksByCategory(category: DrinkCategory): DrinkDefinition[] {
  return DRINK_CATALOG.filter((d) => d.category === category);
}

/** Grams of ethanol in one serving of a drink. */
export function ethanolGrams(drink: DrinkDefinition, servings = 1): number {
  return drink.servingOz * ML_PER_FL_OZ * drink.abv * ETHANOL_DENSITY * servings;
}

/** US standard drinks (14g ethanol each) in a serving. */
export function standardDrinks(drink: DrinkDefinition, servings = 1): number {
  return ethanolGrams(drink, servings) / GRAMS_PER_STANDARD_DRINK;
}

export interface LogDrinkInput {
  id: string;
  drinkId: string;
  servings?: number;
  loggedAt: string;
  venueId?: string;
  venueName?: string;
}

export function logDrink(input: LogDrinkInput): LoggedDrink {
  const drink = findDrink(input.drinkId);
  if (!drink) throw new Error(`Unknown drink: ${input.drinkId}`);
  const servings = input.servings ?? 1;
  if (servings <= 0) throw new Error("servings must be positive");

  return {
    id: input.id,
    drinkId: drink.id,
    name: drink.name,
    category: drink.category,
    servings,
    standardDrinks: standardDrinks(drink, servings),
    calories: Math.round(drink.calories * servings),
    loggedAt: input.loggedAt,
    venueId: input.venueId,
    venueName: input.venueName,
  };
}

export function totalStandardDrinks(drinks: LoggedDrink[]): number {
  return drinks.reduce((sum, d) => sum + d.standardDrinks, 0);
}

export function totalCalories(drinks: LoggedDrink[]): number {
  return drinks.reduce((sum, d) => sum + d.calories, 0);
}

/** Alcoholic drinks only — water and mocktails should not count toward a limit. */
export function alcoholicDrinks(drinks: LoggedDrink[]): LoggedDrink[] {
  return drinks.filter((d) => d.category !== "non-alcoholic" && d.standardDrinks > 0);
}
