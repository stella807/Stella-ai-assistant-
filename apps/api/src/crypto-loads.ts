import type { StoreLike } from "./store.ts";
import { newId } from "./store.ts";

/**
 * Balance loads paid in crypto, through OpenReceive.
 *
 * OpenReceive never takes a price from the payer: it asks `cryptoLoadPrice`
 * for the amount behind a reference, which is a load this server recorded when
 * the customer chose how much to add. The reference is the load's own id, one
 * per load and never reused, which is what OpenReceive relies on to fulfill
 * each payment once.
 */

/** Unpaid loads older than this are dropped; OpenReceive's invoices expire well before. */
const PENDING_TTL_MS = 24 * 60 * 60_000;

export function startCryptoLoad(store: StoreLike, travelerId: string, amountCents: number, now: Date): string {
  const reference = newId("cl");
  const cutoff = now.getTime() - PENDING_TTL_MS;
  store.update((db) => {
    db.cryptoLoads = (db.cryptoLoads ?? []).filter((l) => l.paidAt || new Date(l.createdAt).getTime() > cutoff);
    db.cryptoLoads.push({ reference, travelerId, amountCents, createdAt: now.toISOString() });
  });
  return reference;
}

export function findCryptoLoad(store: StoreLike, reference: string) {
  return (store.data.cryptoLoads ?? []).find((l) => l.reference === reference) ?? null;
}

/** The trusted price for a reference, in OpenReceive's shape. Null once paid,
 *  so a settled load can never be invoiced a second time. */
export function cryptoLoadPrice(store: StoreLike, reference: string) {
  const load = findCryptoLoad(store, reference);
  if (!load || load.paidAt) return null;
  return { currency: "USD", value: (load.amountCents / 100).toFixed(2), description: "Safehubby balance" };
}

/**
 * Credits a paid load to the balance. Safe to call more than once for the same
 * reference: OpenReceive delivers settlement at least once, and retries it if
 * its own transaction rolls back after this has already run.
 */
export function creditCryptoLoad(store: StoreLike, reference: string, paidAt: Date): boolean {
  const load = findCryptoLoad(store, reference);
  if (!load) return false;
  const entryRef = `openreceive:${reference}`;
  if (store.data.balanceEntries.some((e) => e.reference === entryRef)) return false;
  store.update((db) => {
    const target = db.cryptoLoads?.find((l) => l.reference === reference);
    if (target) target.paidAt = paidAt.toISOString();
    db.balanceEntries.push({
      id: newId("be"), travelerId: load.travelerId, kind: "load", amountCents: load.amountCents,
      reference: entryRef, source: "crypto", createdAt: paidAt.toISOString(),
    });
  });
  return true;
}
