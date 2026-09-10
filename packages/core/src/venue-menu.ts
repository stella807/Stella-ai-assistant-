/**
 * What this place probably pours.
 *
 * Neither Google Places nor Yelp returns a bar's actual drink menu — Places
 * returns place types, Yelp returns categories, and a menu URL at best. So the
 * menu shown in the logger is inferred from what the location APIs *do* return,
 * and the inference is stated in the UI rather than hidden: a guess presented
 * as fact is how someone ends up logging a double as a single.
 *
 * The inference is here rather than in the adapter because it is a pure
 * mapping from signals to drink ids, it is the same for every location
 * provider, and it decides what someone taps at 1am — which makes it worth
 * a test rather than a regex buried in a fetch wrapper.
 *
 * Accuracy matters beyond convenience. The estimate in bac.ts is Widmark on
 * grams of ethanol, so the strength of the entry someone taps drives the whole
 * number. Offering "IPA / craft beer" at a brewery instead of a generic
 * "Regular beer" is not a nicety: it is the difference between counting 6.8%
 * and 5% on every round of the night.
 */

export interface VenueSignals {
  /** Google Places `primaryType`, or the single best label another source gives. */
  primaryType?: string;
  /** Every type/category string the source returned. */
  types?: string[];
  /** The venue's own name. "The Whisky Room" says more than its type does. */
  name?: string;
  /** 1 (cheap) to 4 (expensive), where the source reports it. */
  priceLevel?: number;
}

export interface VenueMenu {
  drinkIds: string[];
  /** Why these drinks — shown to the user, because an inferred menu should say so. */
  reason: string;
}

interface Archetype {
  id: string;
  match: RegExp;
  reason: string;
  drinkIds: string[];
}

/**
 * First match wins, so the order is the specificity order: a "whiskey bar" that
 * is also tagged `bar` and `restaurant` should read as a whiskey bar.
 */
const ARCHETYPES: Archetype[] = [
  {
    id: "whisky",
    match: /whisk|bourbon|scotch|rye\b|distiller/i,
    reason: "Whiskey bar — spirits first",
    drinkIds: ["shot-whiskey", "spirit-neat", "cocktail-old-fashioned", "beer-regular"],
  },
  {
    id: "wine",
    match: /wine|vineyard|enoteca|winery|champagne/i,
    reason: "Wine bar — wine by the glass",
    drinkIds: ["wine-red", "wine-white", "seltzer", "beer-regular"],
  },
  {
    id: "brewery",
    match: /brew|taproom|tap_room|beer|ale\b|pilsner|bierg/i,
    reason: "Brewery — craft pours run stronger than a regular beer",
    drinkIds: ["beer-ipa", "beer-regular", "beer-light", "seltzer"],
  },
  {
    id: "agave",
    match: /mexic|taqueria|cantina|tequila|mezcal|agave/i,
    reason: "Agave bar — margaritas and tequila",
    drinkIds: ["cocktail-margarita", "shot-tequila", "beer-light", "seltzer"],
  },
  {
    id: "pub",
    match: /irish|pub\b|sports_bar|sports bar|tavern|dive/i,
    reason: "Pub — pints and well drinks",
    drinkIds: ["beer-regular", "beer-light", "beer-ipa", "shot-whiskey", "cocktail-mixed"],
  },
  {
    id: "cocktail",
    match: /cocktail|speakeasy|lounge|night_club|nightclub|club\b|rooftop/i,
    reason: "Cocktail bar — mixed drinks run stronger than they taste",
    drinkIds: ["cocktail-old-fashioned", "cocktail-mixed", "cocktail-margarita", "wine-red", "spirit-neat"],
  },
  {
    id: "coffee",
    match: /coffee|cafe|café|espresso|bakery/i,
    reason: "Café — mostly soft drinks",
    drinkIds: ["na-coffee", "na-soda", "beer-regular", "wine-white"],
  },
  {
    id: "restaurant",
    match: /restaurant|steak|sushi|pizza|italian|bistro|diner|grill/i,
    reason: "Restaurant — wine and beer with food",
    drinkIds: ["wine-red", "wine-white", "beer-regular", "cocktail-mixed"],
  },
];

/** What an unclassified bar gets: broad, and never empty. */
const FALLBACK: string[] = [
  "beer-regular", "beer-ipa", "wine-red", "cocktail-mixed", "shot-whiskey", "seltzer",
];

/**
 * Price level nudges which pours lead, because it is the one signal the
 * location APIs give about *how* a place serves. A $$$$ bar pours measured
 * spirits and wine; a $ bar pours well drinks and domestic beer. It reorders
 * the menu — it never invents a drink the archetype did not already include.
 */
const PREMIUM_POURS = new Set(["spirit-neat", "cocktail-old-fashioned", "wine-red", "wine-white"]);
const VALUE_POURS = new Set(["cocktail-mixed", "beer-light", "beer-regular", "shot-whiskey"]);

function applyPriceLevel(drinkIds: string[], priceLevel: number | undefined): string[] {
  if (priceLevel === undefined) return drinkIds;
  const set = priceLevel >= 3 ? PREMIUM_POURS : priceLevel <= 1 ? VALUE_POURS : null;
  if (!set) return drinkIds;

  // Filtering the archetype's own list keeps its ordering intact, so an
  // expensive cocktail bar still leads with the cocktail and an expensive
  // whiskey bar still leads with the neat pour. A single global ranking would
  // override both with whatever happened to be first in it.
  const promoted = drinkIds.filter((id) => set.has(id));
  const rest = drinkIds.filter((id) => !set.has(id));
  return [...promoted, ...rest];
}

export function menuForVenue(signals: VenueSignals): VenueMenu {
  const blob = [signals.name ?? "", signals.primaryType ?? "", ...(signals.types ?? [])].join(" ");
  const hit = ARCHETYPES.find((a) => a.match.test(blob));

  const drinkIds = applyPriceLevel(hit ? hit.drinkIds : FALLBACK, signals.priceLevel);
  return {
    drinkIds,
    reason: hit ? hit.reason : "Menu not known here — showing the usual",
  };
}

/**
 * Kept as its own export because the adapters call it with a bare category
 * list and nothing else, and because a caller that has only categories should
 * not have to fake a signals object to get an answer.
 */
export function menuForCategories(categories: string[]): string[] {
  return menuForVenue({ types: categories }).drinkIds;
}
