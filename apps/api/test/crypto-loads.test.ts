import { describe, expect, it } from "vitest";
import { balanceSummary } from "@safehubby/core";
import { creditCryptoLoad, cryptoLoadPrice, startCryptoLoad } from "../src/crypto-loads.ts";
import { SEED } from "../src/seed.ts";
import type { Db, StoreLike } from "../src/store.ts";

const now = new Date("2027-01-01T00:00:00Z");
function memoryStore(): StoreLike {
  const db: Db = structuredClone(SEED);
  return { data: db, update: (fn) => fn(db), reset: () => {}, save: () => {} };
}

describe("crypto balance loads", () => {
  it("prices a load from what the server recorded, never from the payer", () => {
    const store = memoryStore();
    const ref = startCryptoLoad(store, "t1", 2500, now);
    expect(cryptoLoadPrice(store, ref)).toEqual({ currency: "USD", value: "25.00", description: "Safehubby balance" });
    expect(cryptoLoadPrice(store, "cl_made_up")).toBeNull();
  });

  it("credits the balance once, however many times settlement is delivered", () => {
    const store = memoryStore();
    const ref = startCryptoLoad(store, "t1", 2500, now);
    expect(creditCryptoLoad(store, ref, now)).toBe(true);
    expect(creditCryptoLoad(store, ref, now)).toBe(false);
    expect(balanceSummary(store.data.balanceEntries, store.data.holds, "t1").availableCents).toBe(2500);
    expect(store.data.balanceEntries[0]).toMatchObject({ source: "crypto", reference: `openreceive:${ref}` });
  });

  it("will not invoice a load that is already paid", () => {
    const store = memoryStore();
    const ref = startCryptoLoad(store, "t1", 2500, now);
    creditCryptoLoad(store, ref, now);
    expect(cryptoLoadPrice(store, ref)).toBeNull();
  });

  it("drops unpaid loads after a day, but keeps paid ones", () => {
    const store = memoryStore();
    const paid = startCryptoLoad(store, "t1", 2500, now);
    creditCryptoLoad(store, paid, now);
    const stale = startCryptoLoad(store, "t1", 1000, now);
    startCryptoLoad(store, "t1", 1000, new Date(now.getTime() + 25 * 3_600_000));
    const refs = store.data.cryptoLoads!.map((l) => l.reference);
    expect(refs).toContain(paid);
    expect(refs).not.toContain(stale);
  });
});
