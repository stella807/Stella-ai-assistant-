import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { Pool } from "pg";
import {
  createProxyRateLimitingConfig, createStack, paymentsSchemaStatements, type HttpHandler,
} from "@openreceive/http";
import { cryptoLoadPrice, creditCryptoLoad, findCryptoLoad } from "../crypto-loads.ts";
import type { StoreLike } from "../store.ts";

/**
 * Crypto payments through OpenReceive (openreceive.org), pinned at 0.4.31.
 *
 * Payments go straight into the operator's own Bitcoin wallet over Lightning,
 * connected by a receive-only NWC code (`NWC_URI`) — OpenReceive has no way to
 * send money out of it. With a swap provider (`LSC_URI_PRIMARY`) customers can
 * also pay in USDT, USDC, SOL or ETH, which arrive as Bitcoin.
 *
 * It only ever loads the prepaid balance, the same as ATH Móvil: a crypto
 * payment cannot be held and charged later the way a card can.
 *
 * OpenReceive keeps its payment attempts in its own two tables in our
 * database — Railway's Postgres in production, a SQLite file beside the
 * development store otherwise — and decides a payment is final only when the
 * wallet itself says so.
 */

export const OPENRECEIVE_PREFIX = "/openreceive";

export const cryptoReady = () => Boolean(process.env.NWC_URI);

export const cryptoRequires =
  "A receive-only NWC code from your Bitcoin wallet in NWC_URI (see docs/billing.md). Optional: LSC_URI_PRIMARY for USDT, USDC, SOL and ETH.";

/** Who is asking, resolved by server.ts from the session cookie. */
interface Native { travelerId: string | null }

async function openDatabase() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    for (const sql of paymentsSchemaStatements("postgres")) await pool.query(sql);
    return pool;
  }
  const { DatabaseSync } = await import("node:sqlite");
  const dir = join(process.cwd(), ".safehubby");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "openreceive.sqlite"));
  for (const sql of paymentsSchemaStatements("sqlite")) db.exec(sql);
  return db;
}

/**
 * The OpenReceive routes, or null when no wallet is configured. Built once at
 * startup; the first request waits for the wallet check, and a bad wallet
 * code answers 503 rather than taking the rest of the server down.
 */
export async function createCryptoRoutes(store: StoreLike): Promise<
  ((req: IncomingMessage, res: ServerResponse, body: string, travelerId: string | null) => Promise<void>) | null
> {
  if (!cryptoReady()) return null;
  const db = await openDatabase();
  const stack = createStack({
    wallet: { nwc: process.env.NWC_URI! },
    storage: {
      db,
      // Runs inside OpenReceive's settlement transaction, once per reference.
      // The balance lives in our own store, not that database, so the credit
      // is idempotent on its own: a rolled-back settlement that retries finds
      // the entry already there and adds nothing.
      onPaid: async ({ reference, paidAt }) => { creditCryptoLoad(store, reference, new Date(paidAt * 1000)); },
    },
    amountFor: async (reference) => cryptoLoadPrice(store, reference),
    // The reference is the payer's claim; this is the check that it is theirs.
    authorize: ({ native, resource }) => {
      const me = (native as Native | undefined)?.travelerId;
      const load = resource.reference ? findCryptoLoad(store, resource.reference) : null;
      return Boolean(me && load && load.travelerId === me);
    },
    // At most 60 invoices an hour per visitor. Cloudflare sits in front of
    // Railway, so its header is the visitor's real address.
    ...createProxyRateLimitingConfig(true, "cf-connecting-ip"),
    prefix: OPENRECEIVE_PREFIX,
  });
  const handler: HttpHandler = stack.handler;

  return async (req, res, body, travelerId) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || k === "host" || k === "content-length") continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0];
    const url = `${proto}://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
    const method = req.method ?? "GET";
    const request = new Request(url, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body }) });
    const response = await handler(request, { native: { travelerId } satisfies Native });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
