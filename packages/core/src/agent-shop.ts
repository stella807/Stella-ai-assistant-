/**
 * The agent shop: physical goods that AI agents buy for their people, paid in
 * USDC through x402, with no account (see apps/api/src/agent-shop.ts).
 *
 * This module is the shop's rules, and nothing here touches money, a network
 * or a disk:
 *
 * - **The server sets every price.** An agent says what and how many; the
 *   unit prices, shipping and total come from the owner's catalog. A price an
 *   agent sends is ignored.
 * - **A quote is short-lived.** It holds its price for SHOP_QUOTE_TTL_MINUTES,
 *   so an agent cannot pay today for yesterday's price.
 * - **Stock is checked twice**: when a quote is priced, and again when its
 *   payment arrives, because someone else may have bought the last one since.
 * - **Limits are low on purpose.** Buyers are anonymous wallets, so an order
 *   is capped (SHOP_MAX_ORDER_CENTS) and nothing age-restricted is sold.
 * - **Shipping details are kept only as long as they are needed**:
 *   SHOP_PERSONAL_DATA_DAYS after an order is delivered or refunded, they are
 *   erased and the order keeps only what was bought and paid.
 */

export const SHOP_QUOTE_TTL_MINUTES = 15;
export const SHOP_MAX_LINES = 20;
export const SHOP_MAX_QTY = 10;
/** $1,000. An anonymous buyer has no history to judge, so one order stays small. */
export const SHOP_MAX_ORDER_CENTS = 100_000;
export const SHOP_PERSONAL_DATA_DAYS = 90;

/** USDC has six decimals: a cent is 10,000 of its smallest units. */
export const centsToUsdcMicros = (cents: number): number => cents * 10_000;

export class ShopError extends Error {}

export interface ShopProduct {
  /** Lower case, digits and hyphens: it is in addresses. */
  id: string;
  name: string;
  description: string;
  priceCents: number;
  /** How many can be sold. A sale takes from it; a failed payment gives back. */
  stock: number;
  /** Off, a product is not listed and cannot be quoted, but past orders keep it. */
  active: boolean;
  imageUrl?: string;
  updatedAt: string;
}

export interface ShopShipping {
  /** Where the owner ships: ISO country codes, upper case ("US", "PR"). Empty means nowhere, so nothing can be bought. */
  countries: string[];
  /** One flat rate per order. */
  flatCents: number;
  /** Orders this large or larger ship free; null for never. */
  freeOverCents: number | null;
}

export interface ShipTo {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
  /** For the courier, such as a gate code. */
  instructions?: string;
}

export interface ShopLine { productId: string; name: string; qty: number; unitCents: number }

export interface PricedQuote {
  lines: ShopLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shipTo: ShipTo;
  createdAt: string;
  expiresAt: string;
}

/**
 * A quote as it is kept. `shipTo` is sealed (encrypted) by the server before
 * it is stored; this module never reads it.
 *
 * - open: priced, waiting for payment, until it expires.
 * - settling: a payment was verified, its stock is set aside, and it is being
 *   put on chain. A quote left here (the server stopped mid-payment) needs the
 *   owner to look the payer up on chain.
 * - paid: it became `orderId`.
 */
export interface ShopQuote extends Omit<PricedQuote, "shipTo"> {
  id: string;
  shipTo: string;
  status: "open" | "settling" | "paid";
  settlingSince?: string;
  /** The wallet that paid, as the facilitator saw it: where a refund goes. */
  payer?: string;
  orderId?: string;
}

export type ShopOrderStatus = "paid" | "shipped" | "delivered" | "cancelled" | "refunded";

export interface ShopOrder {
  /** Long and random: with no account, knowing it is what lets an agent see the order. */
  id: string;
  quoteId: string;
  lines: ShopLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  /** Sealed; null once erased (see SHOP_PERSONAL_DATA_DAYS). */
  shipTo: string | null;
  status: ShopOrderStatus;
  network: string;
  transaction: string;
  payer?: string;
  paidAt: string;
  updatedAt: string;
  tracking?: string;
  /** The owner's note to the buyer, such as a refund's transaction. */
  note?: string;
}

const str = (v: unknown, field: string, max: number, required = true): string | undefined => {
  if (v === undefined || v === null || v === "") {
    if (required) throw new ShopError(`${field} is required.`);
    return undefined;
  }
  if (typeof v !== "string") throw new ShopError(`${field} must be text.`);
  const t = v.trim();
  if (!t && required) throw new ShopError(`${field} is required.`);
  if (t.length > max) throw new ShopError(`${field} is too long (${max} characters at most).`);
  return t || undefined;
};

const wholeCents = (v: unknown, field: string, min: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > SHOP_MAX_ORDER_CENTS) {
    throw new ShopError(`${field} must be a whole number of cents from ${min} to ${SHOP_MAX_ORDER_CENTS}.`);
  }
  return v;
};

const COUNTRY = /^[A-Z]{2}$/;

/** A product as the owner sends it. */
export function validateProduct(id: string, input: unknown, now: Date): ShopProduct {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 60) throw new ShopError("A product id is lower-case letters, digits and hyphens.");
  const o = (input ?? {}) as Record<string, unknown>;
  const stock = o.stock;
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0 || stock > 100_000) throw new ShopError("stock must be a whole number from 0.");
  const imageUrl = str(o.imageUrl, "imageUrl", 500, false);
  if (imageUrl && !imageUrl.startsWith("https://")) throw new ShopError("imageUrl must be an https address.");
  return {
    id,
    name: str(o.name, "name", 120)!,
    description: str(o.description, "description", 2_000)!,
    priceCents: wholeCents(o.priceCents, "priceCents", 1),
    stock,
    active: o.active !== false,
    ...(imageUrl ? { imageUrl } : {}),
    updatedAt: now.toISOString(),
  };
}

export function validateShipping(input: unknown): ShopShipping {
  const o = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.countries) || o.countries.length > 250) throw new ShopError("countries must be a list of country codes.");
  const countries = [...new Set(o.countries.map((c) => (typeof c === "string" ? c.trim().toUpperCase() : "")))];
  if (countries.some((c) => !COUNTRY.test(c))) throw new ShopError("A country is a two-letter code, such as US or PR.");
  return {
    countries,
    flatCents: o.flatCents === 0 ? 0 : wholeCents(o.flatCents, "flatCents", 0),
    freeOverCents: o.freeOverCents === null || o.freeOverCents === undefined ? null : wholeCents(o.freeOverCents, "freeOverCents", 1),
  };
}

export function validateShipTo(input: unknown, shipping: ShopShipping): ShipTo {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ShopError("shipTo is required: who receives the order, and where.");
  const o = input as Record<string, unknown>;
  const country = str(o.country, "shipTo.country", 2)!.toUpperCase();
  if (!COUNTRY.test(country)) throw new ShopError("shipTo.country is a two-letter code, such as US or PR.");
  if (!shipping.countries.includes(country)) throw new ShopError(`The shop does not ship to ${country}. It ships to: ${shipping.countries.join(", ") || "nowhere yet"}.`);
  const email = str(o.email, "shipTo.email", 200, false);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ShopError("shipTo.email is not an email address.");
  const phone = str(o.phone, "shipTo.phone", 30, false);
  if (phone && !/^\+?[\d\s().-]{7,30}$/.test(phone)) throw new ShopError("shipTo.phone is not a phone number.");
  const out: ShipTo = {
    name: str(o.name, "shipTo.name", 120)!,
    line1: str(o.line1, "shipTo.line1", 200)!,
    city: str(o.city, "shipTo.city", 100)!,
    postalCode: str(o.postalCode, "shipTo.postalCode", 20)!,
    country,
  };
  const optional = { line2: str(o.line2, "shipTo.line2", 200, false), region: str(o.region, "shipTo.region", 100, false), phone, email, instructions: str(o.instructions, "shipTo.instructions", 300, false) };
  for (const [k, v] of Object.entries(optional)) if (v) (out as unknown as Record<string, string>)[k] = v;
  return out;
}

/** Prices what an agent asks for from the catalog, as of now. Throws ShopError, worded for the agent, when it cannot be sold. */
export function priceQuote(products: readonly ShopProduct[], shipping: ShopShipping | null, items: unknown, shipTo: unknown, now: Date): PricedQuote {
  if (!shipping || shipping.countries.length === 0) throw new ShopError("The shop is not shipping anywhere yet.");
  if (!Array.isArray(items) || items.length === 0) throw new ShopError("items must list at least one product: [{ productId, qty }].");
  if (items.length > SHOP_MAX_LINES) throw new ShopError(`At most ${SHOP_MAX_LINES} lines in one order.`);

  const wanted = new Map<string, number>();
  for (const item of items) {
    const { productId, qty } = (item ?? {}) as { productId?: unknown; qty?: unknown };
    if (typeof productId !== "string") throw new ShopError("Each item needs a productId.");
    const n = qty === undefined ? 1 : qty;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) throw new ShopError("qty must be a whole number from 1.");
    wanted.set(productId, (wanted.get(productId) ?? 0) + n);
  }

  const lines: ShopLine[] = [];
  for (const [productId, qty] of wanted) {
    const product = products.find((p) => p.id === productId && p.active);
    if (!product) throw new ShopError(`There is no product ${productId} for sale.`);
    if (qty > SHOP_MAX_QTY) throw new ShopError(`At most ${SHOP_MAX_QTY} of ${product.name} in one order.`);
    if (qty > product.stock) throw new ShopError(`Only ${product.stock} of ${product.name} left.`);
    lines.push({ productId, name: product.name, qty, unitCents: product.priceCents });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0);
  const shippingCents = shipping.freeOverCents !== null && subtotalCents >= shipping.freeOverCents ? 0 : shipping.flatCents;
  const totalCents = subtotalCents + shippingCents;
  if (totalCents > SHOP_MAX_ORDER_CENTS) throw new ShopError(`One order is at most $${SHOP_MAX_ORDER_CENTS / 100}.`);

  return {
    lines, subtotalCents, shippingCents, totalCents,
    shipTo: validateShipTo(shipTo, shipping),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SHOP_QUOTE_TTL_MINUTES * 60_000).toISOString(),
  };
}

export const quoteExpired = (quote: Pick<ShopQuote, "expiresAt">, now: Date): boolean => now.getTime() >= Date.parse(quote.expiresAt);

/** Takes an order's lines out of stock. Throws ShopError if any has sold out since it was quoted, and then takes nothing. */
export function reserveStock(products: readonly ShopProduct[], lines: readonly ShopLine[]): ShopProduct[] {
  for (const line of lines) {
    const p = products.find((x) => x.id === line.productId);
    if (!p || p.stock < line.qty) throw new ShopError(`${line.name} sold out since this quote was made.`);
  }
  return products.map((p) => {
    const taken = lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0);
    return taken ? { ...p, stock: p.stock - taken } : p;
  });
}

/** Puts an order's lines back, for a payment that did not go through or an order cancelled before it shipped. */
export function releaseStock(products: readonly ShopProduct[], lines: readonly ShopLine[]): ShopProduct[] {
  return products.map((p) => {
    const back = lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0);
    return back ? { ...p, stock: p.stock + back } : p;
  });
}

const NEXT: Record<ShopOrderStatus, ShopOrderStatus[]> = {
  // Cancelling keeps the buyer's money until the owner refunds it, so a cancelled order still moves on to refunded.
  paid: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
};

export function canMoveOrder(from: ShopOrderStatus, to: ShopOrderStatus): boolean {
  return NEXT[from].includes(to);
}

/** Whether an order's shipping details are past keeping: delivered or refunded, and untouched for SHOP_PERSONAL_DATA_DAYS. */
export function shipToExpired(order: Pick<ShopOrder, "status" | "updatedAt" | "shipTo">, now: Date): boolean {
  if (order.shipTo === null) return false;
  if (order.status !== "delivered" && order.status !== "refunded") return false;
  return now.getTime() - Date.parse(order.updatedAt) >= SHOP_PERSONAL_DATA_DAYS * 86_400_000;
}

/**
 * The shop's retention sweep. Quotes that never became orders go a day after
 * they expire, sealed address and all; a paid quote goes too, since its order
 * holds everything. A quote stuck settling stays for the owner. Orders keep
 * their record but lose the shipping details once past keeping.
 */
export function sweepShop(data: { quotes: ShopQuote[]; orders: ShopOrder[] }, now: Date): { quotes: ShopQuote[]; orders: ShopOrder[]; erased: number; dropped: number } {
  const day = 86_400_000;
  const quotes = data.quotes.filter((q) => q.status === "settling" || now.getTime() - Date.parse(q.expiresAt) < day);
  let erased = 0;
  const orders = data.orders.map((o) => {
    if (!shipToExpired(o, now)) return o;
    erased += 1;
    return { ...o, shipTo: null };
  });
  return { quotes, orders, erased, dropped: data.quotes.length - quotes.length };
}
