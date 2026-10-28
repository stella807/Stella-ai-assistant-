import { PROCESSOR_FEE_FIXED_CENTS, PROCESSOR_FEE_RATE, deskTaskAllowanceFor, findPlan, includedConciergeHours, type PlanId } from "./billing.ts";
import { PA_CUSTOMER_HOURLY_CENTS, PA_HOURLY_RATE_CENTS } from "./concierge.ts";
import { errandPayoutCents } from "./errand-tiers.ts";
import { errandCreditFor, includedGrabAllowanceFor } from "./included-grabs.ts";
import {
  CLUB_EXPERIENCES, CLUB_GROUP_RATE_MIN_MEMBERS, CLUB_INCLUDED_EVENT_MAX_CENTS, CLUB_MONTHLY_DUES_CENTS, CLUB_PREMIUM_CREDIT_CENTS,
  CLUB_PREMIUM_MARKUP, CLUB_PREMIUM_MONTHS, isIncludedEvent,
} from "./wingman-club.ts";

/**
 * A month of the business as a spreadsheet: what comes in, what it costs to
 * deliver, what is left, and what has to be paid whether or not anyone books.
 *
 * Built from the same prices and allowances the app charges with, so changing a
 * price, or switching the free-each-month perks off, changes the answer. What it
 * cannot know it asks for, and says so: how much of what members are given they
 * actually use, how many show up to club events, and what the fixed costs are.
 * It is a planning tool, not a forecast.
 */

export type CalculatorPlan = Extract<PlanId, "free" | "basic" | "premium-basic" | "premium-plus" | "family">;
export const CALCULATOR_PLANS: CalculatorPlan[] = ["free", "basic", "premium-basic", "premium-plus", "family"];

export interface PnlInputs {
  /** Paying (or free) members on each plan. */
  members: Record<CalculatorPlan, number>;
  /** Share of what members are given each month that they actually use: hours, pickups, credit, desk tasks. 0-1. */
  usage: number;
  /** Assistant minutes one included desk task takes. */
  deskMinutes: number;
  /** Assistant hours customers buy beyond what their plan includes, in a month. */
  extraAssistantHours: number;
  /** Errands customers pay the fee on, in a month, and what Safehubby keeps on each after card fees. */
  paidErrands: number;
  keptPerErrandCents: number;
  /** Wingman Club members, and the share who go to light outings and to bigger days. */
  clubMembers: number;
  clubLightAttendance: number;
  clubBigAttendance: number;
  /** Fixed costs, per month. */
  payrollCents: number;
  insuredPeople: number;
  otherFixedCents: number;
  /** Cash in the bank, for how long a loss can be carried. 0 to leave it out. */
  cashCents: number;
}

export interface PnlLine {
  id: string;
  label: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  /** One plain sentence on how it was worked out. */
  note: string;
}

export interface PnlResult {
  lines: PnlLine[];
  grossProfitCents: number;
  fixed: { id: string; label: string; cents: number }[];
  fixedCents: number;
  netCents: number;
  /** What one more member of a plan adds to the month, at this usage. */
  perMemberCents: Record<CalculatorPlan, number>;
  /** How many more Premium members would bring the month to zero; 0 if it is already there. */
  premiumToBreakEven: number;
  /** Months the cash lasts at this loss; null when there is no loss or no cash entered. */
  runwayMonths: number | null;
}

export const defaultPnlInputs = (): PnlInputs => ({
  members: { free: 0, basic: 0, "premium-basic": 0, "premium-plus": 0, family: 0 },
  usage: 0.4,
  deskMinutes: 15,
  extraAssistantHours: 0,
  paidErrands: 0,
  keptPerErrandCents: 250,
  clubMembers: 0,
  clubLightAttendance: 0.5,
  clubBigAttendance: 0.25,
  payrollCents: 0,
  insuredPeople: 1,
  otherFixedCents: 30_000,
  cashCents: 0,
});

/** The card processor's cut of one charge, rounded to the cent. */
export const cardFeeCents = (amountCents: number): number =>
  amountCents <= 0 ? 0 : Math.round(amountCents * PROCESSOR_FEE_RATE + PROCESSOR_FEE_FIXED_CENTS);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
const whole = (n: number) => Math.max(0, Math.round(Number.isFinite(n) ? n : 0));

/** What one member of a plan leaves each month: dues, less the card fee, the included hours and pickups they use, the credit, and desk-task time. */
function planProfitPerMemberCents(plan: CalculatorPlan, usage: number, deskMinutes: number): { revenue: number; cost: number; profit: number } {
  const p = findPlan(plan);
  const revenue = p.monthlyCents;
  const hours = includedConciergeHours(plan);
  const grabs = includedGrabAllowanceFor(plan) ?? 0; // unlimited (Elite) is not in this calculator
  const credit = errandCreditFor(plan);
  const desk = deskTaskAllowanceFor(plan);
  const deskCents = Math.round((deskMinutes / 60) * PA_HOURLY_RATE_CENTS);
  const given = hours * PA_HOURLY_RATE_CENTS + grabs * errandPayoutCents("in-building") + credit + desk * deskCents;
  const cost = cardFeeCents(revenue) + Math.round(given * usage);
  return { revenue, cost, profit: revenue - cost };
}

/** What a Wingman Club member leaves each month: the $99, less the card fee and the outing they go to. A mix of light months and bigger days. */
function clubProfitPerMemberCents(members: number, lightAttendance: number, bigAttendance: number): number {
  const atGroupRate = members >= CLUB_GROUP_RATE_MIN_MEMBERS;
  const unit = (e: { negotiatedPerPersonCents: number; retailPerPersonCents: number }) => (atGroupRate ? e.negotiatedPerPersonCents : e.retailPerPersonCents);
  const light = CLUB_EXPERIENCES.filter(isIncludedEvent);
  const big = CLUB_EXPERIENCES.filter((e) => !isIncludedEvent(e));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const lightCost = avg(light.map(unit));
  const bigCost = avg(big.map(unit));
  const dues = CLUB_MONTHLY_DUES_CENTS - cardFeeCents(CLUB_MONTHLY_DUES_CENTS);
  // A light month: the included outing is paid for by the dues, for those who go (the extra, if any, is theirs).
  const lightExtraPaid = avg(light.map((e) => Math.max(0, unit(e) - CLUB_INCLUDED_EVENT_MAX_CENTS)));
  const lightMonth = dues - lightAttendance * (lightCost - lightExtraPaid);
  // A bigger day: each member who goes pays the price plus the markup less the credit their dues carry,
  // and the club pays the venue the price; those who stay home leave the dues untouched.
  const bigPaid = avg(big.map((e) => Math.max(0, Math.round(unit(e) * (1 + CLUB_PREMIUM_MARKUP)) - CLUB_PREMIUM_CREDIT_CENTS)));
  const bigMonth = dues + bigAttendance * (bigPaid - bigCost);
  const bigShare = CLUB_PREMIUM_MONTHS.length / 12;
  return Math.round((1 - bigShare) * lightMonth + bigShare * bigMonth);
}

export function monthlyProfit(raw: PnlInputs): PnlResult {
  const usage = clamp(raw.usage, 0, 1);
  const deskMinutes = clamp(raw.deskMinutes, 0, 240);
  const lines: PnlLine[] = [];

  for (const plan of CALCULATOR_PLANS) {
    const n = whole(raw.members[plan]);
    if (n === 0) continue;
    const per = planProfitPerMemberCents(plan, usage, deskMinutes);
    const name = findPlan(plan).name;
    lines.push({
      id: `plan-${plan}`, label: `${name} members`, revenueCents: per.revenue * n, costCents: per.cost * n, profitCents: per.profit * n,
      note: plan === "free"
        ? "Free members pay nothing; each one who uses their free pickup costs the runner's pay."
        : `Each pays ${(per.revenue / 100).toFixed(2)}; the card fee and the share of included hours, pickups, credit and desk tasks they use come out.`,
    });
  }

  const extraHours = whole(raw.extraAssistantHours);
  if (extraHours > 0) {
    const perHourFee = Math.round(PA_CUSTOMER_HOURLY_CENTS * PROCESSOR_FEE_RATE + PROCESSOR_FEE_FIXED_CENTS / 2); // an average two-hour booking
    const revenue = extraHours * PA_CUSTOMER_HOURLY_CENTS;
    const cost = extraHours * (PA_HOURLY_RATE_CENTS + perHourFee);
    lines.push({
      id: "extra-hours", label: "Assistant hours sold beyond the plans", revenueCents: revenue, costCents: cost, profitCents: revenue - cost,
      note: "Customers pay $45 an hour, the assistant earns $35, and the card fee comes off (an average two-hour booking).",
    });
  }

  const errands = whole(raw.paidErrands);
  if (errands > 0) {
    const profit = errands * whole(raw.keptPerErrandCents);
    lines.push({
      id: "errands", label: "Errands with a fee", revenueCents: profit, costCents: 0, profitCents: profit,
      note: "What Safehubby keeps on each after the runner's pay and the card fee. Enter your own average.",
    });
  }

  const clubMembers = whole(raw.clubMembers);
  if (clubMembers > 0) {
    const per = clubProfitPerMemberCents(clubMembers, clamp(raw.clubLightAttendance, 0, 1), clamp(raw.clubBigAttendance, 0, 1));
    lines.push({
      id: "club", label: "Wingman Club", revenueCents: clubMembers * CLUB_MONTHLY_DUES_CENTS, costCents: clubMembers * (CLUB_MONTHLY_DUES_CENTS - per),
      profitCents: clubMembers * per,
      note: "The $99, less the card fee and the outings members go to, plus the markup on bigger days. Below 10 members, outings cost the venue's regular price.",
    });
  }

  const grossProfitCents = lines.reduce((s, l) => s + l.profitCents, 0);
  const insured = whole(raw.insuredPeople);
  const fixed = [
    { id: "payroll", label: "Payroll (employees)", cents: whole(raw.payrollCents) },
    { id: "insurance", label: `Liability insurance (${insured} ${insured === 1 ? "person" : "people"})`, cents: insured * 7500 },
    { id: "other", label: "Hosting, tools, marketing and other", cents: whole(raw.otherFixedCents) },
  ];
  const fixedCents = fixed.reduce((s, f) => s + f.cents, 0);
  const netCents = grossProfitCents - fixedCents;

  const perMemberCents = Object.fromEntries(
    CALCULATOR_PLANS.map((p) => [p, planProfitPerMemberCents(p, usage, deskMinutes).profit]),
  ) as Record<CalculatorPlan, number>;
  const premium = perMemberCents["premium-basic"];
  const premiumToBreakEven = netCents >= 0 || premium <= 0 ? 0 : Math.ceil(-netCents / premium);
  const cash = whole(raw.cashCents);
  const runwayMonths = netCents < 0 && cash > 0 ? Math.round((cash / -netCents) * 10) / 10 : null;

  return { lines, grossProfitCents, fixed, fixedCents, netCents, perMemberCents, premiumToBreakEven, runwayMonths };
}
