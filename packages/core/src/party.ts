/**
 * Party supply: the daytime half of the product.
 *
 * Safehubby already knows a group is getting together and already talks to
 * delivery and ride providers. Planning the thing is the same problem one step
 * earlier — seating, food, decorations, entertainment, and the boring stuff
 * everyone forgets. Vendors here are catalogue entries; a real deployment
 * fulfils them through the same ports as the pharmacy and food runs.
 */

export type PartyCategory = "seating" | "food" | "drinks" | "decorations" | "entertainment" | "essentials";

export interface PartyItem {
  sku: string;
  name: string;
  category: PartyCategory;
  vendor: string;
  /** Unit price. Rentals are priced per day, consumables outright. */
  priceCents: number;
  unit: string;
  /** Rentals come back; consumables do not. Drives the returns copy. */
  rental: boolean;
  /** Roughly how many people one unit covers, for the headcount estimate. */
  serves?: number;
}

export const PARTY_CATALOG: PartyItem[] = [
  // Seating and tables
  { sku: "pt-chair", name: "Folding chair", category: "seating", vendor: "Ridgeline Rentals", priceCents: 250, unit: "per chair / day", rental: true, serves: 1 },
  { sku: "pt-table-8", name: "8ft banquet table", category: "seating", vendor: "Ridgeline Rentals", priceCents: 1200, unit: "per table / day", rental: true, serves: 8 },
  { sku: "pt-cocktail", name: "Cocktail table", category: "seating", vendor: "Ridgeline Rentals", priceCents: 1800, unit: "per table / day", rental: true, serves: 4 },
  { sku: "pt-canopy", name: "10×10 canopy", category: "seating", vendor: "Ridgeline Rentals", priceCents: 6500, unit: "per day", rental: true, serves: 20 },

  // Food
  { sku: "pt-taco-bar", name: "Taco bar, per head", category: "food", vendor: "Marisol Catering", priceCents: 1450, unit: "per person", rental: false, serves: 1 },
  { sku: "pt-bbq", name: "BBQ platter", category: "food", vendor: "Anchor Smokehouse", priceCents: 8900, unit: "serves 10", rental: false, serves: 10 },
  { sku: "pt-charcuterie", name: "Charcuterie board", category: "food", vendor: "Lantern Provisions", priceCents: 6500, unit: "serves 12", rental: false, serves: 12 },
  { sku: "pt-veg", name: "Veggie & dip tray", category: "food", vendor: "Lantern Provisions", priceCents: 3200, unit: "serves 12", rental: false, serves: 12 },
  { sku: "pt-dessert", name: "Dessert tray", category: "food", vendor: "Lantern Provisions", priceCents: 4200, unit: "serves 12", rental: false, serves: 12 },

  // Drinks — non-alcoholic options first and priced to be the easy choice
  { sku: "pt-na-bar", name: "Mocktail bar kit", category: "drinks", vendor: "Anchor Bar Co.", priceCents: 4500, unit: "serves 15", rental: false, serves: 15 },
  { sku: "pt-softs", name: "Soft drinks & water, mixed case", category: "drinks", vendor: "Anchor Bar Co.", priceCents: 2400, unit: "24 cans", rental: false, serves: 12 },
  { sku: "pt-coffee", name: "Coffee urn, 60 cup", category: "drinks", vendor: "Ridgeline Rentals", priceCents: 3500, unit: "per day", rental: true, serves: 30 },
  { sku: "pt-ice", name: "Ice, 20lb bag", category: "drinks", vendor: "Corner Market", priceCents: 700, unit: "per bag", rental: false, serves: 15 },
  { sku: "pt-bartender", name: "Bartender, 4 hours", category: "drinks", vendor: "Anchor Bar Co.", priceCents: 28000, unit: "4 hours", rental: false, serves: 40 },

  // Decorations
  { sku: "pt-lights", name: "Festoon lights, 50ft", category: "decorations", vendor: "Ridgeline Rentals", priceCents: 2200, unit: "per string / day", rental: true },
  { sku: "pt-balloons", name: "Balloon arch kit", category: "decorations", vendor: "Paper & Pine", priceCents: 4800, unit: "per kit", rental: false },
  { sku: "pt-linens", name: "Table linens", category: "decorations", vendor: "Ridgeline Rentals", priceCents: 900, unit: "per table / day", rental: true },
  { sku: "pt-centerpiece", name: "Centrepieces, set of 6", category: "decorations", vendor: "Paper & Pine", priceCents: 5400, unit: "set of 6", rental: false },

  // Entertainment
  { sku: "pt-speaker", name: "PA speaker & mic", category: "entertainment", vendor: "Ridgeline Rentals", priceCents: 7500, unit: "per day", rental: true },
  { sku: "pt-dj", name: "DJ, 3 hours", category: "entertainment", vendor: "Nightshift DJs", priceCents: 45000, unit: "3 hours", rental: false },
  { sku: "pt-yard-games", name: "Yard games set", category: "entertainment", vendor: "Ridgeline Rentals", priceCents: 4000, unit: "per set / day", rental: true },
  { sku: "pt-photobooth", name: "Photo booth", category: "entertainment", vendor: "Nightshift DJs", priceCents: 35000, unit: "3 hours", rental: true },
  { sku: "pt-projector", name: "Projector & screen", category: "entertainment", vendor: "Ridgeline Rentals", priceCents: 9000, unit: "per day", rental: true },

  // Essentials
  { sku: "pt-cups", name: "Cups, plates & cutlery", category: "essentials", vendor: "Corner Market", priceCents: 2800, unit: "serves 24", rental: false, serves: 24 },
  { sku: "pt-cooler", name: "Cooler, 100qt", category: "essentials", vendor: "Ridgeline Rentals", priceCents: 2000, unit: "per day", rental: true },
  { sku: "pt-bins", name: "Bins & liners", category: "essentials", vendor: "Corner Market", priceCents: 1500, unit: "per set", rental: false },
  { sku: "pt-firstaid", name: "First aid kit", category: "essentials", vendor: "Corner Market", priceCents: 2200, unit: "per kit", rental: false },
];

export const PARTY_CATEGORIES: { id: PartyCategory; name: string; blurb: string }[] = [
  { id: "seating", name: "Seating & tables", blurb: "Somewhere for everyone to sit." },
  { id: "food", name: "Food", blurb: "Catering and platters." },
  { id: "drinks", name: "Drinks", blurb: "Bar kit, soft drinks, ice, and someone to pour." },
  { id: "decorations", name: "Decorations", blurb: "Lights, linens, and the nice touches." },
  { id: "entertainment", name: "Entertainment", blurb: "Music, games, and a photo booth." },
  { id: "essentials", name: "Essentials", blurb: "The boring things everyone forgets." },
];

export function itemsIn(category: PartyCategory): PartyItem[] {
  return PARTY_CATALOG.filter((i) => i.category === category);
}

export function findItem(sku: string): PartyItem {
  const item = PARTY_CATALOG.find((i) => i.sku === sku);
  if (!item) throw new Error(`Unknown item: ${sku}`);
  return item;
}

export interface CartLine {
  sku: string;
  qty: number;
}

export interface CartSummary {
  lines: { item: PartyItem; qty: number; lineTotalCents: number }[];
  subtotalCents: number;
  /** Rentals are quoted separately because they have to go back. */
  rentalCents: number;
  purchaseCents: number;
  /** Largest headcount the cart comfortably covers, by the weakest category. */
  coversGuests: number | null;
}

export function summarizeCart(lines: CartLine[]): CartSummary {
  const resolved = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const item = findItem(l.sku);
      return { item, qty: l.qty, lineTotalCents: item.priceCents * l.qty };
    });

  const subtotalCents = resolved.reduce((s, l) => s + l.lineTotalCents, 0);
  const rentalCents = resolved.filter((l) => l.item.rental).reduce((s, l) => s + l.lineTotalCents, 0);

  // Coverage is set by the weakest category that says anything about headcount:
  // twelve chairs and food for forty still seats twelve.
  const byCategory = new Map<PartyCategory, number>();
  for (const l of resolved) {
    if (!l.item.serves) continue;
    byCategory.set(l.item.category, (byCategory.get(l.item.category) ?? 0) + l.item.serves * l.qty);
  }
  const coversGuests = byCategory.size ? Math.min(...byCategory.values()) : null;

  return { lines: resolved, subtotalCents, rentalCents, purchaseCents: subtotalCents - rentalCents, coversGuests };
}

/** A sensible starting cart for a headcount, which the user then edits. */
export function suggestForGuests(guests: number): CartLine[] {
  if (guests <= 0) throw new Error("How many people are coming?");
  const per = (serves: number) => Math.max(1, Math.ceil(guests / serves));
  return [
    { sku: "pt-chair", qty: guests },
    { sku: "pt-table-8", qty: per(8) },
    { sku: "pt-taco-bar", qty: guests },
    { sku: "pt-softs", qty: per(12) },
    { sku: "pt-na-bar", qty: per(15) },
    { sku: "pt-ice", qty: per(15) },
    { sku: "pt-cups", qty: per(24) },
    { sku: "pt-lights", qty: 1 },
    { sku: "pt-yard-games", qty: 1 },
    { sku: "pt-bins", qty: 1 },
  ];
}
