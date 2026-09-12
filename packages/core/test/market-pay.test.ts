import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAY_MARKET, MARKET_PAY, impliedHourlyCents, marketFloorCents, marketPayFor,
  scalePayoutCents,
} from "../src/market-pay.ts";
import {
  CONCIERGE_ASSISTANT_PAYOUT_CENTS, CONCIERGE_CATEGORIES, QUICK_TASK_CATEGORIES,
  assistantPayoutFor, minutesFor, serviceFeeFor,
} from "../src/concierge.ts";
import { LAUNCH_MARKETS, type LaunchMarketId } from "../src/service-area.ts";

const MARKETS = LAUNCH_MARKETS.map((m) => m.id);

describe("the market pay bands", () => {
  it("covers every launch market — a market with no band would be priced by accident", () => {
    for (const id of MARKETS) expect(MARKET_PAY[id]).toBeDefined();
    expect(Object.keys(MARKET_PAY).sort()).toEqual([...MARKETS].sort());
  });

  it("uses the most expensive market as the reference at 1.00", () => {
    const reference = MARKET_PAY[DEFAULT_PAY_MARKET];
    expect(reference.multiplier).toBe(1);
    for (const id of MARKETS) {
      expect(MARKET_PAY[id].multiplier).toBeLessThanOrEqual(1);
      expect(MARKET_PAY[id].midBandCents[1]).toBeLessThanOrEqual(reference.midBandCents[1]);
    }
  });

  it("has a coherent band in every market", () => {
    for (const id of MARKETS) {
      const [low, high] = MARKET_PAY[id].midBandCents;
      expect(low).toBeGreaterThan(0);
      expect(high).toBeGreaterThan(low);
    }
  });

  it("falls back to the most expensive market when the location is unknown", () => {
    // The important direction: an unknown location must never be the cheap
    // path to underpaying somebody.
    expect(marketPayFor(null).id).toBe(DEFAULT_PAY_MARKET);
    expect(marketPayFor(undefined).id).toBe(DEFAULT_PAY_MARKET);
    expect(marketPayFor("atlantis" as LaunchMarketId).id).toBe(DEFAULT_PAY_MARKET);
  });
});

describe("the competitive guarantee", () => {
  /**
   * The promise this whole module exists to keep: in every market Safehubby
   * operates in, every standard task pays at or above the **top** of that
   * market's local mid-level band. Not the midpoint, and not the top of the
   * cheapest market's band — the top of the local one.
   *
   * If a future rate or multiplier edit breaks this, the company has quietly
   * become a below-market employer somewhere, which is exactly the kind of
   * thing nobody notices from inside a diff.
   */
  it("pays at or above the top of the local mid-level band, in every market and category", () => {
    for (const market of MARKETS) {
      const bandTop = MARKET_PAY[market].midBandCents[1];
      for (const { id: category } of CONCIERGE_CATEGORIES) {
        const hourly = impliedHourlyCents(
          assistantPayoutFor(category, false, 1, market),
          minutesFor(category),
        );
        expect(hourly, `${market}/${category}`).toBeGreaterThanOrEqual(bandTop);
      }
    }
  });

  it("holds a quick task to the same bar — reduced pay for a shorter job, not a worse rate", () => {
    // This one caught a real modelling gap: the reduced tier used to be
    // measured against the standard task's minutes, which made a Puerto Rico
    // quick task read as $11.67/hr against a $15-19 local band. It pays less
    // because it takes less time, so it is timed as the shorter job and then
    // held to exactly the same floor as everything else.
    for (const market of MARKETS) {
      const bandTop = MARKET_PAY[market].midBandCents[1];
      for (const category of QUICK_TASK_CATEGORIES) {
        const hourly = impliedHourlyCents(
          assistantPayoutFor(category, true, 1, market),
          minutesFor(category, true),
        );
        expect(hourly, `${market}/${category}`).toBeGreaterThanOrEqual(bandTop);
      }
    }
  });

  it("prices a quick task as genuinely shorter, not just cheaper", () => {
    for (const category of QUICK_TASK_CATEGORIES) {
      expect(minutesFor(category, true)).toBeLessThan(minutesFor(category, false));
      expect(assistantPayoutFor(category, true)).toBeLessThan(assistantPayoutFor(category, false));
    }
  });
});

describe("how pay varies by market", () => {
  it("pays less where the local market is cheaper, and the customer pays less too", () => {
    const la = assistantPayoutFor("grab-something", false, 1, "los-angeles");
    const tx = assistantPayoutFor("grab-something", false, 1, "texas");
    const pr = assistantPayoutFor("grab-something", false, 1, "puerto-rico");
    expect(la).toBeGreaterThan(tx);
    expect(tx).toBeGreaterThan(pr);

    // The point of indexing pay: the customer fee follows it down, so the
    // service is not priced for Los Angeles in San Juan.
    expect(serviceFeeFor("grab-something", false, 1, "puerto-rico"))
      .toBeLessThan(serviceFeeFor("grab-something", false, 1, "los-angeles"));
  });

  it("leaves the reference market on exactly the published national rate card", () => {
    // Indexing was meant to bring the cheaper markets into line, not to
    // quietly reprice the market the card was written for.
    for (const { id: category } of CONCIERGE_CATEGORIES) {
      expect(assistantPayoutFor(category, false, 1, DEFAULT_PAY_MARKET))
        .toBe(CONCIERGE_ASSISTANT_PAYOUT_CENTS[category]);
    }
  });

  it("keeps the margin a share of the fee, not a cut of the pay, in every market", () => {
    for (const market of MARKETS) {
      const pay = assistantPayoutFor("run-errand", false, 1, market);
      const fee = serviceFeeFor("run-errand", false, 1, market);
      expect(fee).toBeGreaterThan(pay);
      expect((fee - pay) / fee).toBeCloseTo(0.2, 2);
    }
  });

  it("still scales with household size on top of the market rate", () => {
    for (const market of MARKETS) {
      const one = assistantPayoutFor("grab-something", false, 1, market);
      const six = assistantPayoutFor("grab-something", false, 6, market);
      expect(six).toBeGreaterThan(one);
    }
  });
});

describe("the scaler itself", () => {
  it("rounds up to the quarter, so a rounding cent lands on the worker's side", () => {
    const out = scalePayoutCents({ baseCents: 1000, minutes: 18, market: "texas" });
    expect(out % 25).toBe(0);
  });

  it("never returns less than the market floor", () => {
    // A base of nearly nothing still has to clear the local band.
    const out = scalePayoutCents({ baseCents: 1, minutes: 60, market: "puerto-rico" });
    expect(out).toBe(marketFloorCents(60, "puerto-rico"));
    expect(impliedHourlyCents(out, 60)).toBeGreaterThanOrEqual(MARKET_PAY["puerto-rico"].midBandCents[1]);
  });

  it("scales the floor for a reduced tier rather than erasing the reduction", () => {
    const full = scalePayoutCents({ baseCents: 900, minutes: 18, market: "texas" });
    const half = scalePayoutCents({ baseCents: 500, minutes: 18, market: "texas", floorShare: 500 / 900 });
    expect(half).toBeLessThan(full);
  });

  it("gives a floor proportional to how long the task runs", () => {
    expect(marketFloorCents(40, "texas")).toBeGreaterThan(marketFloorCents(18, "texas"));
  });
});
