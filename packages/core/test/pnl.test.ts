import { describe, expect, it } from "vitest";
import {
  CALCULATOR_PLANS, cardFeeCents, defaultPnlInputs, findPlan, monthlyProfit, setMonthlyFreebies, defaultMonthlyFreebies,
  MAX_BOOKED_HOURS, assistantPayoutFor, serviceFeeFor,
  errandCardCostCents, errandFeeCents, errandIssuingCostCents, errandMarginCents, errandPayoutCents,
  type PnlInputs,
} from "../src/index.ts";

const base = (over: Partial<PnlInputs> = {}): PnlInputs => ({ ...defaultPnlInputs(), ...over });
const members = (m: Partial<PnlInputs["members"]>) => ({ ...defaultPnlInputs().members, ...m });

describe("the monthly profit calculator", () => {
  it("starts with nothing earned and only the fixed costs owed", () => {
    const r = monthlyProfit(base());
    expect(r.lines).toEqual([]);
    expect(r.fixedCents).toBe(7_500 + 30_000);
    expect(r.netCents).toBe(-r.fixedCents);
  });

  it("charges the card fee on dues the way the app does", () => {
    expect(cardFeeCents(9_399)).toBe(Math.round(9_399 * 0.0349 + 49));
    expect(cardFeeCents(0)).toBe(0);
  });

  it("shows a Premium member as a loss when they use every included hour (ownership chose 4), and keeps the unused part when they do not", () => {
    const price = findPlan("premium-basic").monthlyCents;
    const full = monthlyProfit(base({ usage: 1, deskMinutes: 0, members: members({ "premium-basic": 1 }) }));
    expect(full.lines[0]!.profitCents).toBeLessThan(0);
    const none = monthlyProfit(base({ usage: 0, members: members({ "premium-basic": 1 }) }));
    expect(none.lines[0]!.profitCents).toBe(price - cardFeeCents(price));
  });

  it("counts desk tasks as assistant time, so a plan with many of them earns less at the same usage", () => {
    const quick = monthlyProfit(base({ usage: 0.4, deskMinutes: 5, members: members({ family: 1 }) })).lines[0]!.profitCents;
    const slow = monthlyProfit(base({ usage: 0.4, deskMinutes: 30, members: members({ family: 1 }) })).lines[0]!.profitCents;
    expect(slow).toBeLessThan(quick);
  });

  it("earns about $8 an hour on assistant hours sold beyond the plans", () => {
    const r = monthlyProfit(base({ extraAssistantHours: 100 }));
    const per = r.lines[0]!.profitCents / 100;
    expect(per).toBeGreaterThan(700);
    expect(per).toBeLessThan(1000);
  });

  it("puts the Wingman Club near $62 a member at 50% and 25% attendance with a group", () => {
    const r = monthlyProfit(base({ clubMembers: 100 }));
    const per = r.lines[0]!.profitCents / 100;
    expect(per).toBeGreaterThan(5_500);
    expect(per).toBeLessThan(6_900);
  });

  it("earns less per club member when more of them turn up", () => {
    const few = monthlyProfit(base({ clubMembers: 100, clubLightAttendance: 0.2, clubBigAttendance: 0.1 })).netCents;
    const many = monthlyProfit(base({ clubMembers: 100, clubLightAttendance: 0.9, clubBigAttendance: 0.6 })).netCents;
    expect(many).toBeLessThan(few);
  });

  it("says how many more Premium members it takes to break even, and how long cash lasts", () => {
    // At light usage: with 4 hours included, Premium only earns when about half of them go unused.
    const r = monthlyProfit(base({ usage: 0.1, payrollCents: 1_200_000, cashCents: 3_000_000 }));
    expect(r.netCents).toBeLessThan(0);
    expect(r.premiumToBreakEven).toBe(Math.ceil(-r.netCents / r.perMemberCents["premium-basic"]));
    expect(r.runwayMonths).toBeCloseTo(3_000_000 / -r.netCents, 1);
    // Once there are enough members, the answer is zero and there is no runway to worry about.
    const enough = monthlyProfit(base({ members: members({ "premium-basic": r.premiumToBreakEven + 5 }), usage: 0.1, payrollCents: 1_200_000, cashCents: 3_000_000 }));
    expect(enough.netCents).toBeGreaterThanOrEqual(0);
    expect(enough.premiumToBreakEven).toBe(0);
    expect(enough.runwayMonths).toBeNull();
  });

  it("follows the owner's free-each-month switch: with it off, nothing is given away so plans keep more", () => {
    const inputs = base({ usage: 1, deskMinutes: 0, members: members({ basic: 10 }) });
    const on = monthlyProfit(inputs).lines[0]!.profitCents;
    setMonthlyFreebies({ ...defaultMonthlyFreebies(), enabled: false });
    try {
      expect(monthlyProfit(inputs).lines[0]!.profitCents).toBeGreaterThan(on);
    } finally {
      setMonthlyFreebies(null);
    }
  });

  it("copes with nonsense without throwing", () => {
    const r = monthlyProfit(base({ usage: 9, deskMinutes: -5, clubMembers: -3, paidErrands: Number.NaN, members: members({ basic: 2.7 }) }));
    expect(Number.isFinite(r.netCents)).toBe(true);
    for (const p of CALCULATOR_PLANS) expect(Number.isFinite(r.perMemberCents[p])).toBe(true);
  });

  describe("what you keep, after paying assistants and errand runners", () => {
    const scenario = base({
      members: members({ "premium-basic": 100, "premium-plus": 40, family: 10, free: 80 }),
      usage: 0.3, extraAssistantHours: 50, paidErrands: 120, errandTier: "nearby-store", errandCapCents: 2_000,
      payrollCents: 0, insuredPeople: 2, otherFixedCents: 50_000,
    });

    it("splits the money into assistants, errand runners and Stripe, and they add up with what you keep", () => {
      const r = monthlyProfit(scenario);
      const revenue = r.lines.reduce((sum, l) => sum + l.revenueCents, 0);
      expect(r.payouts.assistantsCents).toBeGreaterThan(0);
      expect(r.payouts.runnersCents).toBeGreaterThan(0);
      expect(r.payouts.cardFeesCents).toBeGreaterThan(0);
      // Without the Wingman Club (whose venue costs are not worker pay), every cent of cost is one of the three payouts.
      expect(revenue - r.payouts.assistantsCents - r.payouts.runnersCents - r.payouts.cardFeesCents).toBe(r.grossProfitCents);
      expect(r.netCents).toBe(r.grossProfitCents - r.fixedCents);
    });

    it("pays assistants $35 an hour on the hours it counts, and the runner the real errand rate", () => {
      const only = monthlyProfit(base({ extraAssistantHours: 10, paidErrands: 10, errandTier: "in-building", errandCapCents: 1_000 }));
      expect(only.payouts.assistantsCents).toBe(10 * 3_500);
      expect(only.payouts.runnersCents).toBe(10 * errandPayoutCents("in-building"));
    });

    it("works the errand income out from the real fee: the fee less the runner, Stripe and the task card", () => {
      const r = monthlyProfit(base({ paidErrands: 100, errandTier: "nearby-store", errandCapCents: 2_000 }));
      const line = r.lines.find((l) => l.id === "errands")!;
      const fee = errandFeeCents("nearby-store", 2_000);
      const kept = fee - errandPayoutCents("nearby-store") - errandCardCostCents(2_000 + fee) - errandIssuingCostCents(2_000);
      expect(line.revenueCents).toBe(100 * fee);
      expect(line.profitCents).toBe(100 * kept);
      expect(kept).toBeGreaterThanOrEqual(errandMarginCents("nearby-store"));
    });
  });

  describe("hospital caretaker days", () => {
    it("counts what the client pays for a day, less the caretaker's pay and Stripe's cut", () => {
      const r = monthlyProfit(base({ hospitalDays: 10 }));
      const line = r.lines.find((l) => l.id === "hospital-days")!;
      const price = serviceFeeFor("wait-with-someone", false, 1, MAX_BOOKED_HOURS, true);
      const pay = assistantPayoutFor("wait-with-someone", false, 1, MAX_BOOKED_HOURS, true);
      expect(price).toBeGreaterThan(pay);
      expect(line.revenueCents).toBe(10 * price);
      expect(line.profitCents).toBe(10 * (price - pay - errandCardCostCents(price)));
      expect(line.profitCents).toBeGreaterThan(0);
      expect(r.payouts.assistantsCents).toBe(10 * pay);
      expect(r.grossProfitCents).toBe(line.profitCents);
    });

    it("is nothing when no days are booked", () => {
      expect(monthlyProfit(base({ hospitalDays: 0 })).lines.find((l) => l.id === "hospital-days")).toBeUndefined();
    });
  });
});
