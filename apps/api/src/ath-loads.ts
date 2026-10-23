import {
  ATH_TIMEOUT_SECONDS, authorizeAthPayment, cancelAthPayment, createAthPayment, findAthPayment,
} from "./adapters/ath-movil.ts";
import type { AthLoad, StoreLike } from "./store.ts";
import { newId } from "./store.ts";

/**
 * Balance loads paid with ATH Móvil.
 *
 * The amount is fixed here when the load starts and sent to ATH by this
 * server, never taken from the browser. The member approves it in their ATH
 * Móvil app; the app then asks us to check, and we authorize the payment and
 * credit the balance only once ATH itself says it was approved — and only for
 * the amount ATH says it took.
 */

/** Open loads older than this are dropped; ATH gives up on them long before. */
const PENDING_TTL_MS = 24 * 60 * 60_000;

/** Loads being authorized right now. A second check while one is in flight
 *  must not authorize the same payment twice. */
const inFlight = new Set<string>();

export async function startAthLoad(
  store: StoreLike, input: { travelerId: string; amountCents: number; phone: string; now: Date },
): Promise<AthLoad> {
  const id = newId("al");
  const { ecommerceId, authToken } = await createAthPayment({ amountCents: input.amountCents, phone: input.phone, loadId: id });
  const load: AthLoad = {
    id, travelerId: input.travelerId, amountCents: input.amountCents, ecommerceId, authToken, status: "open",
    createdAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + ATH_TIMEOUT_SECONDS * 1000).toISOString(),
  };
  const cutoff = input.now.getTime() - PENDING_TTL_MS;
  store.update((db) => {
    db.athLoads = (db.athLoads ?? []).filter((l) => l.status === "paid" || new Date(l.createdAt).getTime() > cutoff);
    db.athLoads.push(load);
  });
  return load;
}

export function findAthLoad(store: StoreLike, id: string): AthLoad | null {
  return (store.data.athLoads ?? []).find((l) => l.id === id) ?? null;
}

/** Credits a completed load. Safe to call more than once for the same load. */
export function creditAthLoad(store: StoreLike, id: string, referenceNumber: string, paidAt: Date): boolean {
  const load = findAthLoad(store, id);
  if (!load) return false;
  const entryRef = `athmovil:${id}`;
  if (store.data.balanceEntries.some((e) => e.reference === entryRef)) return false;
  store.update((db) => {
    const target = db.athLoads?.find((l) => l.id === id);
    if (target) Object.assign(target, { status: "paid", paidAt: paidAt.toISOString(), referenceNumber });
    db.balanceEntries.push({
      id: newId("be"), travelerId: load.travelerId, kind: "load", amountCents: load.amountCents,
      reference: entryRef, source: "ath-movil", createdAt: paidAt.toISOString(),
    });
  });
  return true;
}

const setStatus = (store: StoreLike, id: string, status: AthLoad["status"]) =>
  store.update((db) => { const l = db.athLoads?.find((x) => x.id === id); if (l) l.status = status; });

/**
 * Asks ATH where the payment stands and moves it on: authorizes it once the
 * member has approved, credits the balance once ATH completes it, and marks it
 * cancelled or expired otherwise. Returns the load's status afterwards.
 */
export async function checkAthLoad(store: StoreLike, id: string, now: Date): Promise<AthLoad["status"]> {
  const load = findAthLoad(store, id);
  if (!load) throw new Error("That payment was not found.");
  if (load.status !== "open") return load.status;
  if (inFlight.has(id)) return "open";
  inFlight.add(id);
  try {
    const found = await findAthPayment(load.ecommerceId, load.authToken);
    if (found.status === "CANCEL") { setStatus(store, id, "canceled"); return "canceled"; }
    if (found.status === "OPEN") {
      if (now.getTime() > new Date(load.expiresAt).getTime()) {
        await cancelAthPayment(load.ecommerceId).catch(() => {});
        setStatus(store, id, "expired");
        return "expired";
      }
      return "open";
    }
    // Approved in the app (CONFIRM) — take the money. Already COMPLETED means a
    // previous check authorized it and stopped before crediting.
    const done = found.status === "CONFIRM" ? await authorizeAthPayment(load.authToken) : found;
    if (done.totalCents !== undefined && done.totalCents !== load.amountCents) {
      throw new Error("ATH Móvil reported a different amount than this payment was opened for.");
    }
    if (!done.referenceNumber) throw new Error("ATH Móvil did not return a reference for the payment.");
    creditAthLoad(store, id, done.referenceNumber, now);
    return "paid";
  } finally {
    inFlight.delete(id);
  }
}

export async function cancelAthLoad(store: StoreLike, id: string): Promise<void> {
  const load = findAthLoad(store, id);
  if (!load || load.status !== "open") return;
  await cancelAthPayment(load.ecommerceId).catch(() => {});
  setStatus(store, id, "canceled");
}
