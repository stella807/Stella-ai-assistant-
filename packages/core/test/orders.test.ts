import { describe, expect, it } from "vitest";
import {
  PENDING_TTL_HOURS, askableOrders, canAskNow, confirmOrder, declineOrder,
  isExpired, orderTotalCents, queueOrder, sweepExpired,
} from "../src/orders.ts";

const T0 = new Date("2026-01-02T01:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const lines = [
  { sku: "burrito", name: "Burrito", priceCents: 1450, qty: 2 },
  { sku: "chips", name: "Chips & salsa", priceCents: 550, qty: 1 },
];

const order = () =>
  queueOrder({
    id: "o1", provider: "doordash", vendorName: "Marisol Cantina", lines,
    deliverTo: "142 Rowan St", now: T0, queuedBecause: "You asked for this at 1am.",
  });

describe("queueing", () => {
  it("totals the lines", () => {
    expect(orderTotalCents(lines)).toBe(1450 * 2 + 550);
    expect(order().totalCents).toBe(3450);
  });

  it("starts waiting, not confirmed — nothing is charged on queueing", () => {
    expect(order().status).toBe("waiting");
  });

  it("needs items and an address", () => {
    expect(() => queueOrder({ ...({} as any), id: "o", provider: "doordash", vendorName: "V", lines: [], deliverTo: "x", now: T0, queuedBecause: "" })).toThrow();
    expect(() => queueOrder({ id: "o", provider: "doordash", vendorName: "V", lines, deliverTo: "  ", now: T0, queuedBecause: "" })).toThrow();
  });
});

describe("asking only when sober", () => {
  it("stays silent while the person is impaired", () => {
    for (const band of ["moderate", "high", "severe"] as const) {
      expect(canAskNow(order(), band, at(1))).toBe(false);
    }
  });

  it("asks once they are back under the line", () => {
    expect(canAskNow(order(), "none", at(8))).toBe(true);
    expect(canAskNow(order(), "low", at(8))).toBe(true);
  });

  it("refuses a confirmation taken while impaired, and charges nothing", () => {
    expect(() => confirmOrder(order(), "high", at(1))).toThrow(/nothing has been charged/i);
  });

  it("confirms once sober", () => {
    const done = confirmOrder(order(), "none", at(8));
    expect(done.status).toBe("confirmed");
    expect(done.decidedAt).toBeDefined();
  });

  it("lets them say no", () => {
    expect(declineOrder(order(), at(8)).status).toBe("declined");
  });

  it("will not re-decide a settled order", () => {
    const done = confirmOrder(order(), "none", at(8));
    expect(() => confirmOrder(done, "none", at(9))).toThrow(/already been dealt with/i);
    expect(declineOrder(done, at(9)).status).toBe("confirmed");
  });
});

describe("expiry", () => {
  it("lapses rather than lingering as a surprise charge", () => {
    expect(isExpired(order(), at(PENDING_TTL_HOURS - 1))).toBe(false);
    expect(isExpired(order(), at(PENDING_TTL_HOURS + 1))).toBe(true);
    expect(canAskNow(order(), "none", at(PENDING_TTL_HOURS + 1))).toBe(false);
    expect(() => confirmOrder(order(), "none", at(PENDING_TTL_HOURS + 1))).toThrow(/expired/i);
  });

  it("sweeps lapsed orders", () => {
    const [swept] = sweepExpired([order()], at(PENDING_TTL_HOURS + 2));
    expect(swept!.status).toBe("expired");
  });

  it("lists only what can be asked right now", () => {
    const orders = [order(), { ...order(), id: "o2", status: "confirmed" as const }];
    expect(askableOrders(orders, "none", at(8)).map((o) => o.id)).toEqual(["o1"]);
    expect(askableOrders(orders, "severe", at(1))).toEqual([]);
  });
});
