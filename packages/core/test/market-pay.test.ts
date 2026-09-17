import { describe, expect, it } from "vitest";
import {
  ANCHOR_HOURLY_CENTS, MARKET_PAY, REFERENCE_MARKET, clearsMidBand, describePayAgainstMarket,
  impliedHourlyCents, marketPayFor, reachesHighBand,
} from "../src/market-pay.ts";
import {
  CONCIERGE_CATEGORIES, QUICK_TASK_CATEGORIES, assistantPayoutFor, minutesFor, serviceFeeFor,
} from "../src/concierge.ts";
import { LAUNCH_MARKETS, type LaunchMarketId } from "../src/service-area.ts";

const MARKETS = LAUNCH_MARKETS.map((m) => m.id);
const hourly = (category: Parameters<typeof minutesFor>[0], quick = false) =>
  impliedHourlyCents(assistantPayoutFor(category, quick), minutesFor(category, quick));

describe("the market bands", () => {
  it("covers every market the company operates in", () => {
    expect(Object.keys(MARKET_PAY).sort()).toEqual([...MARKETS].sort());
  });

  it("has a coherent mid and high band everywhere", () => {
    for (const id of MARKETS) {
      const { midBandCents: [ml, mh], highBandCents: [hl, hh] } = MARKET_PAY[id];
      expect(mh).toBeGreaterThan(ml);
      expect(hh).toBeGreaterThan(hl);
      expect(hl).toBeGreaterThan(mh);
    }
  });

  it("treats the most expensive market as the reference", () => {
    for (const id of MARKETS) {
      expect(MARKET_PAY[id].highBandCents[0])
        .toBeLessThanOrEqual(MARKET_PAY[REFERENCE_MARKET].highBandCents[0]);
    }
    expect(ANCHOR_HOURLY_CENTS).toBe(MARKET_PAY[REFERENCE_MARKET].highBandCents[0]);
  });

  it("falls back to the most expensive market for an unknown one", () => {
    expect(marketPayFor(null).id).toBe(REFERENCE_MARKET);
    expect(marketPayFor("atlantis" as LaunchMarketId).id).toBe(REFERENCE_MARKET);
  });
});

describe("one rate, and it is a good rate everywhere", () => {
  /**
   * The promise the rate card is built on, and the reason market-indexed pay
   * was reversed: the same job at the same hour of the night is worth the
   * same thing in San Juan as in Los Angeles, and that one number has to be
   * a rate worth taking in all three markets rather than only the cheap one.
   */
  it("pays the anchor rate or better for every category", () => {
    for (const { id } of CONCIERGE_CATEGORIES) {
      expect(hourly(id), id).toBeGreaterThanOrEqual(ANCHOR_HOURLY_CENTS);
    }
  });

  it("reaches the high-end band in every market, not just the mid band", () => {
    // This work is not mid-level assistant work — it is going to a stranger
    // at night and judging whether they need an ambulance. If a future rate
    // cut drops it back into the mid band, this is what says so.
    for (const market of MARKETS) {
      for (const { id } of CONCIERGE_CATEGORIES) {
        expect(reachesHighBand(assistantPayoutFor(id), minutesFor(id), market), `${market}/${id}`).toBe(true);
        expect(clearsMidBand(assistantPayoutFor(id), minutesFor(id), market), `${market}/${id}`).toBe(true);
      }
    }
  });

  it("is a premium above the whole local range in the cheapest market", () => {
    // Puerto Rico's high-end band tops out at $32; the anchor is $35, so the
    // rate is above the entire local range. That is the "premium where the
    // local market is cheaper" the research called for.
    const pr = MARKET_PAY["puerto-rico"];
    expect(ANCHOR_HOURLY_CENTS).toBeGreaterThan(pr.highBandCents[1]);
  });

  it("deliberately exempts the quick-task tier from the anchor — it's a different role's rate, not a discount on this one", () => {
    // This used to require the anchor here too, on the theory that a quick
    // task is the *same* job done faster. It isn't: `ROLE_CATEGORIES` in
    // roster.ts sends every quick task to the errand-runner role, which
    // never does the work this anchor prices (going to a stranger at night,
    // sitting with them, judging whether they're okay) — and never earns
    // the standard rate for it either. QUICK_TASK_ASSISTANT_PAYOUT_CENTS's
    // own comment has the real errand-runner market data ($18/hr) this is
    // priced against instead.
    for (const category of QUICK_TASK_CATEGORIES) {
      expect(hourly(category, true), category).toBeLessThan(ANCHOR_HOURLY_CENTS);
      expect(assistantPayoutFor(category, true)).toBeLessThan(assistantPayoutFor(category, false));
      expect(minutesFor(category, true)).toBeLessThan(minutesFor(category, false));
    }
  });

  it("pays the same wherever the task happens", () => {
    // No market argument exists any more. This test is the record of why:
    // paying somebody in San Juan less for the identical job was the thing
    // being undone.
    expect(assistantPayoutFor.length).toBeLessThanOrEqual(3);
  });
});

describe("what the customer pays for it", () => {
  it("keeps the margin a share of the fee, never a cut of the pay", () => {
    for (const { id } of CONCIERGE_CATEGORIES) {
      const pay = assistantPayoutFor(id);
      const fee = serviceFeeFor(id);
      expect(fee).toBeGreaterThan(pay);
      expect((fee - pay) / fee).toBeCloseTo(0.2, 2);
    }
  });

  it("earns Safehubby more per task than the old cheaper card did", () => {
    // Worth pinning, because it is the counter-intuitive part: the margin is
    // a share of the fee and the fee is derived from the payout, so paying
    // people more raises the absolute margin per task rather than lowering it.
    const waitFee = serviceFeeFor("wait-with-someone");
    const waitPay = assistantPayoutFor("wait-with-someone");
    expect(waitFee - waitPay).toBeGreaterThan(450);
  });
});

describe("telling an assistant what their rate is worth", () => {
  it("says it beats the whole local range where it does", () => {
    const text = describePayAgainstMarket(
      assistantPayoutFor("wait-with-someone"), minutesFor("wait-with-someone"), "puerto-rico");
    expect(text).toMatch(/above the top/i);
    expect(text).toMatch(/Puerto Rico/);
  });

  it("says it is in the high-end range where it is", () => {
    const text = describePayAgainstMarket(
      assistantPayoutFor("wait-with-someone"), minutesFor("wait-with-someone"), "los-angeles");
    expect(text).toMatch(/high-end/i);
    expect(text).toMatch(/Los Angeles/);
  });

  it("refuses to price a task of no length rather than dividing by zero", () => {
    expect(() => impliedHourlyCents(1000, 0)).toThrow(/positive/i);
  });
});
