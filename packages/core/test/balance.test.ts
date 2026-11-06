import { describe, expect, it } from "vitest";
import {
  BALANCE_MAX_CENTS, BALANCE_MAX_LOAD_CENTS, BALANCE_MIN_LOAD_CENTS,
  balanceSummary, validateLoad, type BalanceEntry,
} from "../src/balance.ts";
import { authorizeExactHold, captureHold, releaseHold } from "../src/payment.ts";

const T0 = new Date("2026-06-15T12:00:00Z");
const load = (id: string, cents: number, over: Partial<BalanceEntry> = {}): BalanceEntry => ({
  id, travelerId: "t1", kind: "load", amountCents: cents, reference: `ref_${id}`, createdAt: T0.toISOString(), ...over,
});
const hold = (id: string, cents: number, fundedBy: "balance" | null = "balance") =>
  ({ ...authorizeExactHold({ id, travelerId: "t1", capCents: cents, now: T0 }), ...(fundedBy ? { fundedBy } : {}) });

describe("balanceSummary", () => {
  it("is what was loaded, less what is reserved by open holds", () => {
    const s = balanceSummary([load("a", 5000)], [hold("h1", 1200)], "t1");
    expect(s).toMatchObject({ loadedCents: 5000, heldCents: 1200, availableCents: 3800 });
  });

  it("gives back what a captured hold did not use, and all of a released one", () => {
    const captured = captureHold(hold("h1", 1500), 1000, T0);
    const released = releaseHold(hold("h2", 700));
    const s = balanceSummary([load("a", 5000)], [captured, released], "t1");
    expect(s).toMatchObject({ spentCents: 1000, heldCents: 0, availableCents: 4000 });
  });

  it("ignores holds paid by card and other people's money", () => {
    const s = balanceSummary(
      [load("a", 5000), load("b", 9000, { travelerId: "t2" })],
      [hold("h1", 2000, null), { ...hold("h2", 2000), travelerId: "t2" }],
      "t1",
    );
    expect(s.availableCents).toBe(5000);
  });

  it("subtracts money already refunded out", () => {
    const s = balanceSummary(
      [load("a", 5000), { ...load("p", 1500), kind: "payout", againstEntryId: "a" }], [], "t1",
    );
    expect(s).toMatchObject({ loadedCents: 5000, refundedCents: 1500, availableCents: 3500 });
  });

  it("never reports a negative balance", () => {
    expect(balanceSummary([], [hold("h1", 900)], "t1").availableCents).toBe(0);
  });
});

describe("validateLoad", () => {
  it("lets any amount from 50 cents up be added, with no limit of our own", () => {
    expect(BALANCE_MIN_LOAD_CENTS).toBe(50);
    for (const cents of [50, 100, 1_234, 50_000, 5_000_000, BALANCE_MAX_LOAD_CENTS]) {
      expect(() => validateLoad(cents, 0), String(cents)).not.toThrow();
    }
  });
  it("does not cap what a balance can hold", () => {
    expect(() => validateLoad(100_000, 10_000_000)).not.toThrow();
    expect(BALANCE_MAX_CENTS).toBeGreaterThan(1_000_000_000);
  });
  it("refuses an amount below Stripe's minimum, above its maximum, or not in whole cents", () => {
    expect(() => validateLoad(BALANCE_MIN_LOAD_CENTS - 1, 0)).toThrow(/at least/i);
    expect(() => validateLoad(0, 0)).toThrow(/at least/i);
    expect(() => validateLoad(BALANCE_MAX_LOAD_CENTS + 1, 0)).toThrow(/at most/i);
    expect(() => validateLoad(1000.5, 0)).toThrow(/whole/i);
    expect(() => validateLoad(Number.NaN, 0)).toThrow();
  });
});
