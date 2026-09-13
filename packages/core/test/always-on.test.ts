import { describe, expect, it } from "vitest";
import {
  COVERED_HOURS_PER_PERSON_PER_MONTH, EMPLOYER_BURDEN_RATE, HOURS_PER_MONTH,
  alwaysOnCost, alwaysOnCostAtOurRate, alwaysOnCostByMarket, includedHoursPriceCents,
} from "../src/always-on.ts";
import { CONCIERGE_FEE_MARGIN, PA_HOURLY_RATE_CENTS } from "../src/concierge.ts";
import { LIABILITY_INSURANCE_CENTS_PER_MONTH } from "../src/staffing.ts";
import { MARKET_PAY } from "../src/market-pay.ts";

describe("what round-the-clock actually takes", () => {
  it("needs more than four people, not one with a generous attitude", () => {
    const { peopleNeeded } = alwaysOnCostAtOurRate();
    expect(peopleNeeded).toBeGreaterThan(4);
    expect(peopleNeeded).toBeLessThan(5);
  });

  it("counts hours actually worked, not hours scheduled", () => {
    // 40 x 52/12 is 173.3, and costing against that leaves every holiday and
    // sick day as an unstaffed hour on a promise that said 24/7.
    expect(COVERED_HOURS_PER_PERSON_PER_MONTH).toBeLessThan(173.33);
    expect(HOURS_PER_MONTH / COVERED_HOURS_PER_PERSON_PER_MONTH)
      .toBeGreaterThan(HOURS_PER_MONTH / 173.33);
  });

  it("insures whole people, because half a person still carries a policy", () => {
    const { insuranceCents, peopleNeeded } = alwaysOnCostAtOurRate();
    expect(insuranceCents).toBe(Math.ceil(peopleNeeded) * LIABILITY_INSURANCE_CENTS_PER_MONTH);
  });

  it("charges employer taxes and comp on top of the wage, not out of it", () => {
    const c = alwaysOnCost(3500);
    expect(c.burdenCents).toBe(Math.round(c.wagesCents * EMPLOYER_BURDEN_RATE));
    expect(c.totalCostCents).toBe(c.wagesCents + c.burdenCents + c.insuranceCents);
  });

  it("keeps the house margin on top of cost, like every other price here", () => {
    const c = alwaysOnCost(3500);
    expect(Math.round(c.priceCents * (1 - CONCIERGE_FEE_MARGIN))).toBe(c.totalCostCents);
  });
});

describe("the number a subscription tier has to survive", () => {
  it("costs five figures a month in every market we operate in", () => {
    for (const [id, cost] of Object.entries(alwaysOnCostByMarket())) {
      expect(cost.priceCents, id).toBeGreaterThan(2_000_000); // over $20,000
    }
  });

  it("is dearest where wages are dearest, and tracks the local band", () => {
    const byMarket = alwaysOnCostByMarket();
    expect(byMarket["los-angeles"].priceCents).toBeGreaterThan(byMarket.texas.priceCents);
    expect(byMarket.texas.priceCents).toBeGreaterThan(byMarket["puerto-rico"].priceCents);
    for (const [id, cost] of Object.entries(byMarket)) {
      expect(cost.hourlyRateCents, id)
        .toBe(MARKET_PAY[id as keyof typeof MARKET_PAY].highBandCents[0]);
    }
  });

  it("scales down honestly for a narrower promise", () => {
    // Nights only is a third of the hours and close to a third of the cost —
    // the fixed part is insurance, which is small next to payroll.
    const full = alwaysOnCost(3500, HOURS_PER_MONTH);
    const third = alwaysOnCost(3500, HOURS_PER_MONTH / 3);
    expect(third.totalCostCents).toBeLessThan(full.totalCostCents / 2.5);
  });
});

describe("included hours, which is the version a tier can carry", () => {
  it("prices an included hour the same as an extra one", () => {
    // An allowance that is cheaper per hour than the published rate is a
    // discount hiding in a subscription; one that is dearer punishes people
    // for prepaying. It should simply be the same hour — to within the cent
    // that rounding a block once rather than four times costs.
    for (const hours of [2, 4, 8, 12, 20]) {
      const drift = Math.abs(includedHoursPriceCents(hours) - hours * includedHoursPriceCents(1));
      expect(drift, `${hours}h`).toBeLessThanOrEqual(hours);
    }
  });

  it("covers the wage and its burden before any margin", () => {
    const wage = PA_HOURLY_RATE_CENTS;
    expect(includedHoursPriceCents(1))
      .toBe(Math.round((wage + wage * EMPLOYER_BURDEN_RATE) / (1 - CONCIERGE_FEE_MARGIN)));
    expect(includedHoursPriceCents(1)).toBeGreaterThan(PA_HOURLY_RATE_CENTS);
  });
});
