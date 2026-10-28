import { describe, expect, it } from "vitest";
import {
  CALCULATOR_PLANS, cardFeeCents, defaultPnlInputs, findPlan, monthlyProfit, setMonthlyFreebies, defaultMonthlyFreebies,
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

  it("makes a Premium member roughly break even when they use every included hour and pickup, and keeps the unused part when they do not", () => {
    const price = findPlan("premium-basic").monthlyCents;
    const full = monthlyProfit(base({ usage: 1, deskMinutes: 0, members: members({ "premium-basic": 1 }) }));
    expect(Math.abs(full.lines[0]!.profitCents)).toBeLessThan(100); // within a dollar of zero
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
    const r = monthlyProfit(base({ payrollCents: 1_200_000, cashCents: 3_000_000 }));
    expect(r.netCents).toBeLessThan(0);
    expect(r.premiumToBreakEven).toBe(Math.ceil(-r.netCents / r.perMemberCents["premium-basic"]));
    expect(r.runwayMonths).toBeCloseTo(3_000_000 / -r.netCents, 1);
    // Once there are enough members, the answer is zero and there is no runway to worry about.
    const enough = monthlyProfit(base({ members: members({ "premium-basic": r.premiumToBreakEven + 5 }), payrollCents: 1_200_000, cashCents: 3_000_000 }));
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
});
