import { describe, expect, it } from "vitest";
import {
  BASKETS, DEFAULT_CAP_CENTS, MAX_CAP_CENTS, authorizeCarePackage, basketTotalCents,
  buildOrder, findBasket, shouldSendAutomatically, type CarePackageAuth,
} from "../src/care-package.ts";

const T0 = new Date("2026-01-01T19:00:00Z");

const auth = (over: Partial<CarePackageAuth> = {}): CarePackageAuth => ({
  enabled: true, basketId: "hydration", capCents: DEFAULT_CAP_CENTS,
  triggerBand: "high", deliverTo: "142 Rowan St", authorizedAt: T0.toISOString(), ...over,
});

describe("baskets", () => {
  it("all cost something and fit the default cap", () => {
    for (const b of BASKETS) {
      expect(basketTotalCents(b)).toBeGreaterThan(0);
      expect(basketTotalCents(b)).toBeLessThanOrEqual(DEFAULT_CAP_CENTS);
    }
  });

  it("rejects an unknown basket", () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => findBasket("caviar")).toThrow();
  });
});

describe("authorizing a run", () => {
  const base = { basketId: "hydration" as const, capCents: DEFAULT_CAP_CENTS, triggerBand: "high" as const, deliverTo: "142 Rowan St", now: T0 };

  it("works while sober", () => {
    const a = authorizeCarePackage({ ...base, currentBand: "none" });
    expect(a.enabled).toBe(true);
    expect(a.deliverTo).toBe("142 Rowan St");
  });

  it("still works at the low band, before impairment", () => {
    expect(authorizeCarePackage({ ...base, currentBand: "low" }).enabled).toBe(true);
  });

  it("REFUSES once the person is already impaired", () => {
    // The whole point: an impaired person cannot consent to spending money.
    for (const band of ["moderate", "high", "severe"] as const) {
      expect(() => authorizeCarePackage({ ...base, currentBand: band })).toThrow(/before you start drinking/i);
    }
  });

  it("requires a sane cap", () => {
    expect(() => authorizeCarePackage({ ...base, capCents: 0, currentBand: "none" })).toThrow();
    expect(() => authorizeCarePackage({ ...base, capCents: MAX_CAP_CENTS + 1, currentBand: "none" })).toThrow();
  });

  it("refuses a basket that exceeds the cap rather than trimming it silently", () => {
    expect(() => authorizeCarePackage({ ...base, basketId: "morning-after", capCents: 200, currentBand: "none" }))
      .toThrow(/more than your cap/i);
  });

  it("requires a delivery address", () => {
    expect(() => authorizeCarePackage({ ...base, deliverTo: "   ", currentBand: "none" })).toThrow();
  });
});

describe("automatic sending", () => {
  it("does nothing without authorization", () => {
    expect(shouldSendAutomatically({ auth: null, band: "severe", existingOrders: [] })).toBe(false);
    expect(shouldSendAutomatically({ auth: auth({ enabled: false }), band: "severe", existingOrders: [] })).toBe(false);
  });

  it("waits for the trigger band", () => {
    expect(shouldSendAutomatically({ auth: auth(), band: "moderate", existingOrders: [] })).toBe(false);
    expect(shouldSendAutomatically({ auth: auth(), band: "high", existingOrders: [] })).toBe(true);
    expect(shouldSendAutomatically({ auth: auth(), band: "severe", existingOrders: [] })).toBe(true);
  });

  it("honours a lower trigger band", () => {
    expect(shouldSendAutomatically({ auth: auth({ triggerBand: "moderate" }), band: "moderate", existingOrders: [] })).toBe(true);
  });

  it("never sends twice automatically in one night", () => {
    const already = [buildOrder("o1", "hydration", "142 Rowan St", "auto", T0)];
    expect(shouldSendAutomatically({ auth: auth(), band: "severe", existingOrders: already })).toBe(false);
  });

  it("still allows an automatic run after a hand-sent one", () => {
    const byHand = [buildOrder("o1", "food", "142 Rowan St", "guardian", T0)];
    expect(shouldSendAutomatically({ auth: auth(), band: "high", existingOrders: byHand })).toBe(true);
  });

  it("refuses to exceed the cap even once triggered", () => {
    expect(shouldSendAutomatically({ auth: auth({ capCents: 100 }), band: "severe", existingOrders: [] })).toBe(false);
  });
});

describe("orders", () => {
  it("record why they were sent and what they cost", () => {
    const order = buildOrder("o1", "morning-after", "142 Rowan St", "auto", T0);
    expect(order.reason).toBe("auto");
    expect(order.totalCents).toBe(basketTotalCents(findBasket("morning-after")));
    expect(order.etaMinutes).toBeGreaterThan(0);
  });
});
