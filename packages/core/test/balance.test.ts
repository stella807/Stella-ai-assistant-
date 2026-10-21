import { describe, expect, it } from "vitest";
import {
  BALANCE_MAX_CENTS, BALANCE_MAX_LOAD_CENTS, BALANCE_MIN_LOAD_CENTS,
  allocateRefund, athRefundableCents, balanceSummary, validateLoad, type BalanceEntry,
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
  it("accepts a whole-dollar-or-cent amount inside the limits", () => {
    expect(() => validateLoad(BALANCE_MIN_LOAD_CENTS, 0)).not.toThrow();
    expect(() => validateLoad(BALANCE_MAX_LOAD_CENTS, 0)).not.toThrow();
  });
  it("refuses amounts that are too small, too large, or not whole cents", () => {
    expect(() => validateLoad(BALANCE_MIN_LOAD_CENTS - 1, 0)).toThrow(/at least/i);
    expect(() => validateLoad(BALANCE_MAX_LOAD_CENTS + 1, 0)).toThrow(/at most/i);
    expect(() => validateLoad(1000.5, 0)).toThrow(/whole/i);
    expect(() => validateLoad(Number.NaN, 0)).toThrow();
  });
  it("keeps the whole balance under its ceiling", () => {
    expect(() => validateLoad(BALANCE_MIN_LOAD_CENTS, BALANCE_MAX_CENTS - BALANCE_MIN_LOAD_CENTS)).not.toThrow();
    expect(() => validateLoad(BALANCE_MIN_LOAD_CENTS, BALANCE_MAX_CENTS - BALANCE_MIN_LOAD_CENTS + 1)).toThrow(/balance/i);
  });
});

describe("allocateRefund", () => {
  it("refunds against the newest loads first, never more than each one has left", () => {
    const entries = [
      load("a", 3000, { createdAt: "2026-06-01T00:00:00Z" }),
      load("b", 2000, { createdAt: "2026-06-10T00:00:00Z" }),
    ];
    expect(allocateRefund(entries, "t1", 2500)).toEqual([
      { entryId: "b", reference: "ref_b", amountCents: 2000 },
      { entryId: "a", reference: "ref_a", amountCents: 500 },
    ]);
  });
  it("offers back only what ATH Móvil loads still have, and only what is free", () => {
    const entries = [load("a", 1000), load("c", 5000, { source: "crypto" })];
    expect(athRefundableCents(entries, [], "t1")).toBe(1000);
    expect(athRefundableCents(entries, [hold("h", 5500)], "t1")).toBe(500);
  });

  it("never sends a crypto load back through ATH Móvil", () => {
    const entries = [load("a", 1000), load("c", 5000, { source: "crypto", createdAt: "2026-06-20T00:00:00Z" })];
    expect(allocateRefund(entries, "t1", 1000)).toEqual([{ entryId: "a", reference: "ref_a", amountCents: 1000 }]);
    expect(() => allocateRefund(entries, "t1", 1001)).toThrow(/refund/i);
  });
  it("skips what an earlier refund already took", () => {
    const entries = [load("a", 3000), { ...load("p", 2800), kind: "payout" as const, againstEntryId: "a" }];
    expect(allocateRefund(entries, "t1", 200)).toEqual([{ entryId: "a", reference: "ref_a", amountCents: 200 }]);
    expect(() => allocateRefund(entries, "t1", 201)).toThrow(/refund/i);
  });
  it("refuses a zero or fractional amount", () => {
    expect(() => allocateRefund([load("a", 3000)], "t1", 0)).toThrow();
    expect(() => allocateRefund([load("a", 3000)], "t1", 10.5)).toThrow();
  });
});
