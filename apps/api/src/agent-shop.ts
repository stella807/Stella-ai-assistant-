import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  SHOP_MAX_LINES, SHOP_MAX_ORDER_CENTS, SHOP_MAX_QTY, SHOP_QUOTE_TTL_MINUTES, ShopError, canMoveOrder, centsToUsdcMicros,
  priceQuote, quoteExpired, releaseStock, reserveStock, validateProduct, validateShipping,
  type ShipTo, type ShopOrder, type ShopOrderStatus, type ShopQuote,
} from "@safehubby/core";
import { encodeHeader, type Respond, type Resource, type X402Charger } from "./agent-paywall.ts";
import { RateLimiter } from "./auth.ts";
import type { Cipher } from "./crypto.ts";
import type { StoreLike } from "./store.ts";

/**
 * The agent shop: AI agents buy physical goods for their people, paying USDC
 * on Solana through x402, with no account. The rules (prices, stock, limits,
 * an order's life) are in @safehubby/core's agent-shop.ts; this is the HTTP
 * side and the money.
 *
 * An agent's whole visit, every step JSON under /api/shop (the paywall never
 * charges for /api/, so browsing is free):
 *
 *   GET  /api/shop                      what is for sale, where it ships, how to buy
 *   POST /api/shop/quotes               { items, shipTo } -> a priced quote, held 15 minutes
 *   POST /api/shop/quotes/:id/pay       402 with the price; again with PAYMENT-SIGNATURE -> the order
 *   GET  /api/shop/orders/:id           the order's status and tracking
 *
 * Paying is careful about the moment money moves. The payment is verified,
 * then the stock is set aside and the quote marked as settling, and only then
 * is it put on chain. Asking to pay a quote that is already paid returns the
 * same order: an agent retrying after a timeout is never charged twice. If the
 * facilitator cannot say whether a payment went through, the quote stays
 * settling, with its stock set aside and the payer's wallet noted, for the
 * owner to settle by hand (POST /api/shop/admin/quotes/:id).
 *
 * The owner works the shop with the admin key (`x-admin-key`): the catalog,
 * the shipping rules, the orders with their addresses, and their status.
 * Refunds are sent by hand from the owner's wallet to the order's `payer`;
 * nothing here can move money out.
 *
 * Addresses are encrypted at rest with the site's key (SAFEHUBBY_ENCRYPTION_KEY)
 * and erased once an order is done (see sweepShop in core).
 */

export interface AgentShopDeps {
  store: StoreLike;
  charger: X402Charger;
  cipher: Cipher;
  /** The site's public address, for the addresses agents are given. */
  origin: () => string;
  now?: () => Date;
  /** Whether a request carries the owner's admin key. */
  isOwner: (adminKey: string | null) => boolean;
}

export interface ShopRequest {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  body: unknown;
  clientKey: string;
  adminKey: string | null;
}

/** A refusal with its status. Written out longhand: Node's type-stripping, which runs the server, has no parameter properties. */
class Answer extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const newId = (prefix: string, bytes: number) => `${prefix}_${randomBytes(bytes).toString("base64url")}`;

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "cache-control": "no-store", ...headers, "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(json)) });
  res.end(json);
}

/** An order as the agent sees it: no address, which only the owner needs. */
const publicOrder = (o: ShopOrder, origin: string) => ({
  orderId: o.id, status: o.status, lines: o.lines,
  subtotal: money(o.subtotalCents), shipping: money(o.shippingCents), total: money(o.totalCents), totalCents: o.totalCents,
  paidAt: o.paidAt, updatedAt: o.updatedAt, transaction: o.transaction, network: o.network,
  ...(o.tracking ? { tracking: o.tracking } : {}), ...(o.note ? { note: o.note } : {}),
  orderUrl: `${origin}/api/shop/orders/${o.id}`,
});

export function createAgentShop(deps: AgentShopDeps) {
  const now = deps.now ?? (() => new Date());
  const limits = { quotes: new RateLimiter(30, 60 * 60_000), pay: new RateLimiter(30, 60 * 60_000), orders: new RateLimiter(240, 60 * 60_000) };
  const data = () => deps.store.data;
  const seal = (shipTo: ShipTo) => deps.cipher.encrypt(JSON.stringify(shipTo));
  const open = (sealed: string | null): ShipTo | null => {
    if (!sealed) return null;
    try { return JSON.parse(deps.cipher.decrypt(sealed)) as ShipTo; } catch { return null; }
  };
  const limited = (limiter: RateLimiter, key: string) => {
    if (limiter.hit(key)) throw new Answer(429, "Too many requests. Try again later.");
  };

  function catalog() {
    const origin = deps.origin();
    const shipping = data().shopShipping ?? null;
    const products = (data().shopProducts ?? []).filter((p) => p.active).map((p) => ({
      productId: p.id, name: p.name, description: p.description, price: money(p.priceCents), priceCents: p.priceCents,
      inStock: p.stock, ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
    }));
    return {
      shop: "Safehubby agent shop",
      about: "Physical goods an AI agent can buy for its person. No account: pay in USDC on Solana through x402 and keep the order id.",
      currency: "USD, paid in USDC on Solana", network: deps.charger.network,
      shipsTo: shipping?.countries ?? [],
      shipping: shipping ? { flat: money(shipping.flatCents), freeOver: shipping.freeOverCents === null ? null : money(shipping.freeOverCents) } : null,
      limits: { linesPerOrder: SHOP_MAX_LINES, perProduct: SHOP_MAX_QTY, orderTotal: money(SHOP_MAX_ORDER_CENTS), quoteHeldMinutes: SHOP_QUOTE_TTL_MINUTES },
      products,
      howToBuy: [
        `POST ${origin}/api/shop/quotes with JSON { "items": [{ "productId": "...", "qty": 1 }], "shipTo": { "name", "line1", "line2"?, "city", "region"?, "postalCode", "country", "phone"?, "email"?, "instructions"? } }`,
        "POST the quote's payUrl: it answers 402 with the price in a PAYMENT-REQUIRED header (x402 version 2)",
        "POST the payUrl again with your signed payment in a PAYMENT-SIGNATURE header: it answers 201 with the order",
        "Keep the orderId: it is the only way to see the order. GET its orderUrl for status and tracking",
      ],
      policies: "Sales are final once shipped; before that, write to contact@safehubby.com with the order id. Refunds go back to the paying wallet.",
    };
  }

  function createQuote(r: ShopRequest) {
    limited(limits.quotes, r.clientKey);
    const { items, shipTo } = (r.body ?? {}) as { items?: unknown; shipTo?: unknown };
    const priced = priceQuote(data().shopProducts ?? [], data().shopShipping ?? null, items, shipTo, now());
    const quote: ShopQuote = { ...priced, id: newId("q", 12), shipTo: seal(priced.shipTo), status: "open" };
    deps.store.update((db) => void (db.shopQuotes ??= []).push(quote));
    const origin = deps.origin();
    return {
      quoteId: quote.id, lines: quote.lines,
      subtotal: money(quote.subtotalCents), shipping: money(quote.shippingCents), total: money(quote.totalCents), totalCents: quote.totalCents,
      shipsTo: { name: priced.shipTo.name, city: priced.shipTo.city, country: priced.shipTo.country },
      expiresAt: quote.expiresAt, payUrl: `${origin}/api/shop/quotes/${quote.id}/pay`,
    };
  }

  async function pay(r: ShopRequest, quoteId: string): Promise<void> {
    limited(limits.pay, r.clientKey);
    const origin = deps.origin();
    const find = () => (data().shopQuotes ?? []).find((q) => q.id === quoteId);
    const quote = find();
    if (!quote) throw new Answer(404, "No such quote.");
    if (quote.status === "paid") {
      const order = (data().shopOrders ?? []).find((o) => o.id === quote.orderId);
      if (order) return sendJson(r.res, 200, { alreadyPaid: true, ...publicOrder(order, origin) });
    }
    if (quote.status === "settling") {
      throw new Answer(409, "A payment for this quote is already being processed. Do not pay again; ask the shop about it with this quote id.", { quoteId });
    }
    if (quoteExpired(quote, now())) throw new Answer(410, "This quote has expired. Ask for a new one.", { quotesUrl: `${origin}/api/shop/quotes` });

    let accepts;
    try {
      accepts = await deps.charger.requirements(centsToUsdcMicros(quote.totalCents));
    } catch (err) {
      console.error("[safehubby] Shop: the facilitator did not answer:", err instanceof Error ? err.message : err);
      return respond(r.res, deps.charger.unavailable());
    }
    const resource: Resource = {
      url: `${origin}/api/shop/quotes/${quote.id}/pay`,
      description: `Order: ${quote.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}`,
      mimeType: "application/json",
    };
    const hasPayment = Boolean(r.req.headers["payment-signature"] || r.req.headers["x-payment"]);
    if (!hasPayment) {
      return respond(r.res, deps.charger.paymentRequired(resource, accepts, "Pay this quote to place the order.", { quoteId, total: money(quote.totalCents), expiresAt: quote.expiresAt }));
    }

    const verified = await deps.charger.verify(r.req.headers, accepts, resource);
    if (!verified.ok) return respond(r.res, verified.response);

    // Set the stock aside before any money moves, so a settled payment always has its goods.
    // Checked again here, after the awaits: another request may have paid this quote, or taken the last one, meanwhile.
    const current = find();
    if (!current || current.status !== "open") throw new Answer(409, "This quote changed while the payment was checked. Look it up again before paying.");
    if (quoteExpired(current, now())) throw new Answer(410, "This quote has expired. Ask for a new one.");
    let reserved;
    try {
      reserved = reserveStock(data().shopProducts ?? [], current.lines);
    } catch (err) {
      if (err instanceof ShopError) throw new Answer(409, `${err.message} Ask for a new quote.`);
      throw err;
    }
    deps.store.update((db) => {
      db.shopProducts = reserved;
      Object.assign(current, { status: "settling", settlingSince: now().toISOString(), ...(verified.payer ? { payer: verified.payer } : {}) });
    });

    const done = await deps.charger.settle(verified.payment, accepts, resource);
    if (!done.ok) {
      if (done.failed === "refused") {
        // Nothing moved: give the stock back and let the quote be paid again.
        deps.store.update((db) => {
          db.shopProducts = releaseStock(db.shopProducts ?? [], current.lines);
          current.status = "open";
          delete current.settlingSince;
        });
        return respond(r.res, done.response);
      }
      console.error(`[safehubby] Shop: payment for quote ${current.id} may or may not have gone through (payer ${current.payer ?? "unknown"}). It is held for the owner.`);
      throw new Answer(502, "The payment's result is unknown. Do not pay again: the shop will check it and fill or cancel the order. Ask with this quote id.", { quoteId });
    }

    // Logged before it is written: if the write failed, this line is the record that money arrived.
    console.log(`[safehubby] Shop: ${money(current.totalCents)} paid for quote ${current.id}, transaction ${done.settled.transaction ?? "?"}`);
    const order = placeOrder(current, done.settled.transaction ?? "", done.settled.payer ?? current.payer, done.settled.network ?? deps.charger.network);
    console.log(`[safehubby] Shop: new order ${order.id} (${order.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}), to be shipped`);
    sendJson(r.res, 201, publicOrder(order, origin), { "PAYMENT-RESPONSE": encodeHeader(done.settled) });
  }

  function placeOrder(quote: ShopQuote, transaction: string, payer: string | undefined, network: string): ShopOrder {
    const at = now().toISOString();
    const order: ShopOrder = {
      id: newId("ord", 18), quoteId: quote.id, lines: quote.lines,
      subtotalCents: quote.subtotalCents, shippingCents: quote.shippingCents, totalCents: quote.totalCents,
      shipTo: quote.shipTo, status: "paid", network, transaction, ...(payer ? { payer } : {}), paidAt: at, updatedAt: at,
    };
    deps.store.update((db) => {
      (db.shopOrders ??= []).push(order);
      Object.assign(quote, { status: "paid", orderId: order.id, ...(payer ? { payer } : {}) });
      delete quote.settlingSince;
    });
    return order;
  }

  function orderFor(r: ShopRequest, orderId: string) {
    limited(limits.orders, r.clientKey);
    const order = (data().shopOrders ?? []).find((o) => o.id === orderId);
    if (!order) throw new Answer(404, "No such order.");
    return publicOrder(order, deps.origin());
  }

  /* ---------------- the owner ---------------- */

  function ownerView() {
    return {
      products: data().shopProducts ?? [],
      shipping: data().shopShipping ?? null,
      orders: [...(data().shopOrders ?? [])].sort((a, b) => b.paidAt.localeCompare(a.paidAt))
        .map((o) => ({ ...o, shipTo: o.shipTo === null ? "erased" : open(o.shipTo) ?? "unreadable" })),
      // A payment the server lost track of mid-way. Look the payer up on chain, then mark it paid or failed.
      stuckPayments: (data().shopQuotes ?? []).filter((q) => q.status === "settling")
        .map((q) => ({ quoteId: q.id, since: q.settlingSince, payer: q.payer ?? null, total: money(q.totalCents), lines: q.lines, shipTo: open(q.shipTo) })),
    };
  }

  function putProduct(id: string, body: unknown) {
    const product = validateProduct(id, body, now());
    deps.store.update((db) => {
      const list = (db.shopProducts ??= []);
      const at = list.findIndex((p) => p.id === id);
      if (at >= 0) list[at] = product; else list.push(product);
    });
    return product;
  }

  function putShipping(body: unknown) {
    const shipping = validateShipping(body);
    deps.store.update((db) => void (db.shopShipping = shipping));
    return shipping;
  }

  function moveOrder(orderId: string, body: unknown) {
    const { status, tracking, note } = (body ?? {}) as { status?: unknown; tracking?: unknown; note?: unknown };
    const order = (data().shopOrders ?? []).find((o) => o.id === orderId);
    if (!order) throw new Answer(404, "No such order.");
    const to = status as ShopOrderStatus;
    if (typeof status !== "string" || !canMoveOrder(order.status, to)) throw new Answer(409, `An order that is ${order.status} cannot become ${String(status)}.`);
    const text = (v: unknown, field: string) => {
      if (v === undefined) return undefined;
      if (typeof v !== "string" || v.length > 500) throw new Answer(400, `${field} must be text, 500 characters at most.`);
      return v.trim();
    };
    const trackingText = text(tracking, "tracking"), noteText = text(note, "note");
    deps.store.update((db) => {
      // Cancelled before it shipped: the goods are still here to sell.
      if (order.status === "paid" && to === "cancelled") db.shopProducts = releaseStock(db.shopProducts ?? [], order.lines);
      order.status = to;
      order.updatedAt = now().toISOString();
      if (trackingText) order.tracking = trackingText;
      if (noteText) order.note = noteText;
    });
    return order;
  }

  /** The owner settles a stuck payment after looking it up on chain: it went through (with its transaction), or it did not. */
  function resolveQuote(quoteId: string, body: unknown) {
    const { outcome, transaction } = (body ?? {}) as { outcome?: unknown; transaction?: unknown };
    const quote = (data().shopQuotes ?? []).find((q) => q.id === quoteId);
    if (!quote || quote.status !== "settling") throw new Answer(404, "No payment is stuck on that quote.");
    if (outcome === "paid") {
      if (typeof transaction !== "string" || !transaction.trim()) throw new Answer(400, "Give the transaction that paid it.");
      return placeOrder(quote, transaction.trim(), quote.payer, deps.charger.network);
    }
    if (outcome === "failed") {
      deps.store.update((db) => {
        db.shopProducts = releaseStock(db.shopProducts ?? [], quote.lines);
        quote.status = "open";
        quote.expiresAt = now().toISOString();
        delete quote.settlingSince;
      });
      return { quoteId, status: "released" };
    }
    throw new Answer(400, `outcome is "paid" or "failed".`);
  }

  return {
    /** Answers any request under /api/shop. */
    async handle(r: ShopRequest): Promise<void> {
      const path = r.url.pathname.replace(/\/+$/, "");
      const parts = path.split("/").slice(3); // after /api/shop
      const m = r.method === "HEAD" ? "GET" : r.method;
      try {
        if (parts[0] === "admin") {
          if (!deps.isOwner(r.adminKey)) throw new Answer(401, "The admin key is missing or wrong.");
          if (m === "GET" && parts.length === 1) return sendJson(r.res, 200, ownerView());
          if (m === "PUT" && parts[1] === "products" && parts[2] && parts.length === 3) return sendJson(r.res, 200, putProduct(parts[2], r.body));
          if (m === "PUT" && parts[1] === "shipping" && parts.length === 2) return sendJson(r.res, 200, putShipping(r.body));
          if (m === "POST" && parts[1] === "orders" && parts[2] && parts.length === 3) return sendJson(r.res, 200, moveOrder(parts[2], r.body));
          if (m === "POST" && parts[1] === "quotes" && parts[2] && parts.length === 3) return sendJson(r.res, 200, resolveQuote(parts[2], r.body));
          throw new Answer(404, "Not found");
        }
        if (m === "GET" && parts.length === 0) return sendJson(r.res, 200, catalog(), { "cache-control": "public, max-age=60" });
        if (m === "POST" && parts[0] === "quotes" && parts.length === 1) return sendJson(r.res, 201, createQuote(r));
        if (m === "POST" && parts[0] === "quotes" && parts[1] && parts[2] === "pay" && parts.length === 3) return await pay(r, parts[1]);
        if (m === "GET" && parts[0] === "orders" && parts[1] && parts.length === 2) return sendJson(r.res, 200, orderFor(r, parts[1]));
        throw new Answer(404, "Not found");
      } catch (err) {
        if (err instanceof Answer) return sendJson(r.res, err.status, { error: err.message, ...err.extra });
        if (err instanceof ShopError) return sendJson(r.res, 400, { error: err.message });
        console.error("[safehubby] Shop request failed:", err);
        if (!r.res.headersSent) sendJson(r.res, 500, { error: "Something went wrong on our end." });
      }
    },
  };
}

function respond(res: ServerResponse, answer: Respond): void {
  sendJson(res, answer.status, answer.body, answer.headers);
}

export type AgentShop = ReturnType<typeof createAgentShop>;
