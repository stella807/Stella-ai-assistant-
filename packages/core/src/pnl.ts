import { PROCESSOR_FEE_FIXED_CENTS, PROCESSOR_FEE_RATE, deskTaskAllowanceFor, findPlan, includedConciergeHours, type PlanId } from "./billing.ts";
import { MAX_BOOKED_HOURS, PA_CUSTOMER_HOURLY_CENTS, assistantPayoutFor, livePaHourlyPayCents, serviceFeeFor } from "./concierge.ts";
import { payDeltas } from "./pay-adjustments.ts";
import {
  CARD_FEE_FIXED_CENTS, CARD_FEE_RATE, ERRAND_REFERENCE_CAP_CENTS, ERRAND_TIERS, errandCardCostCents, errandFeeCents, errandIssuingCostCents, errandPayoutCents, type ErrandTierId,
} from "./errand-tiers.ts";
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
  /** Errands customers pay the fee on, in a month, the size of a typical one, and its typical purchase. The fee, the runner's pay, the card fees and the task card are worked out from those. */
  paidErrands: number;
  errandTier: ErrandTierId;
  errandCapCents: number;
  /** The personal assistants you have, and the hours each can work in a month. They are paid $35 for each hour worked, not a salary. */
  assistantCount: number;
  hoursPerAssistant: number;
  /** Trips by drivers Safehubby hires itself, in a month: what each trip pays the driver ($85), and what a client pays per trip (0 until you enter it, which shows only the pay). */
  driverTrips: number;
  driverPayPerTripCents: number;
  driverFareCents: number;
  /** Hospital days booked in a month: a caretaker stays with a patient for the day, charged and paid at the hospital-day rates. */
  hospitalDays: number;
  /** Hours of armed bodyguard work booked in a month, at the armed rate: the client pays it, the bodyguard earns the armed pay. */
  /** Clients who book armed bodyguards in a month, and the hours each books in total. */
  armedClients: number;
  armedHoursEach: number;
  /** What a client pays per armed hour, and what the bodyguard is paid for it, so the margin can be tried at other numbers. */
  armedRateCents: number;
  armedPayCents: number;
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
  /** Where the money went before it reached you: assistants, errand runners and the card processor (Stripe). */
  payouts: { assistantsCents: number; runnersCents: number; driversCents: number; cardFeesCents: number };
  /**
   * The assistant hours this month's members and extra bookings call for, against the hours your assistants can work.
   * Each plan counts its own included hours (Premium 4, Premium Plus 8, Family 12 today), the share used, the desk-task time and any extra hours sold.
   * Hospital caretakers are a separate job and are not counted here.
   */
  assistants: {
    count: number; hoursPerAssistant: number;
    neededHours: number; availableHours: number;
    /** Share of the available hours the work fills; above 100% means you are short. */
    utilization: number;
    /** How many assistants the work needs at the hours each can give. */
    neededCount: number;
    /** What each of your assistants is paid in the month if the work is split evenly; 0 with no assistants entered. */
    payEachCents: number;
  };
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
  hospitalDays: 0,
  armedClients: 0,
  armedHoursEach: 4,
  armedRateCents: 7_500,
  armedPayCents: 5_500,
  assistantCount: 0,
  hoursPerAssistant: 80,
  driverTrips: 0,
  driverPayPerTripCents: 8_500, // each trip pays the driver $85, per the owner: more than Uber Black pays
  driverFareCents: 0,
  errandTier: "nearby-store",
  errandCapCents: ERRAND_REFERENCE_CAP_CENTS,
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
function planProfitPerMemberCents(plan: CalculatorPlan, usage: number, deskMinutes: number): {
  revenue: number; cost: number; profit: number; cardFee: number; assistantPay: number; runnerPay: number; assistantHours: number;
} {
  const p = findPlan(plan);
  const revenue = p.monthlyCents;
  const hours = includedConciergeHours(plan);
  const grabs = includedGrabAllowanceFor(plan) ?? 0; // unlimited (Elite) is not in this calculator
  const credit = errandCreditFor(plan);
  const desk = deskTaskAllowanceFor(plan);
  const deskCents = Math.round((deskMinutes / 60) * livePaHourlyPayCents());
  const assistantGiven = hours * livePaHourlyPayCents() + desk * deskCents;
  const runnerGiven = grabs * errandPayoutCents("in-building") + credit;
  const cardFee = cardFeeCents(revenue);
  const assistantPay = Math.round(assistantGiven * usage);
  const runnerPay = Math.round(runnerGiven * usage);
  const cost = cardFee + assistantPay + runnerPay;
  // The assistant time this member uses: their included hours, and the minutes of their desk tasks, at the usage share.
  const assistantHours = (hours + desk * (deskMinutes / 60)) * usage;
  return { revenue, cost, profit: revenue - cost, cardFee, assistantPay, runnerPay, assistantHours };
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
  const payouts = { assistantsCents: 0, runnersCents: 0, driversCents: 0, cardFeesCents: 0 };
  let neededHours = 0;

  for (const plan of CALCULATOR_PLANS) {
    const n = whole(raw.members[plan]);
    if (n === 0) continue;
    const per = planProfitPerMemberCents(plan, usage, deskMinutes);
    const name = findPlan(plan).name;
    neededHours += per.assistantHours * n;
    payouts.assistantsCents += per.assistantPay * n; payouts.runnersCents += per.runnerPay * n; payouts.cardFeesCents += per.cardFee * n;
    lines.push({
      id: `plan-${plan}`, label: `${name} members`, revenueCents: per.revenue * n, costCents: per.cost * n, profitCents: per.profit * n,
      note: plan === "free"
        ? "Free members pay nothing; each one who uses their free pickup costs the runner's pay."
        : `Each pays ${(per.revenue / 100).toFixed(2)}; the card fee and the share of included hours, pickups, credit and desk tasks they use come out.`,
    });
  }

  const extraHours = whole(raw.extraAssistantHours);
  if (extraHours > 0) {
    const perHourFee = Math.round((PA_CUSTOMER_HOURLY_CENTS + payDeltas().paHourly) * PROCESSOR_FEE_RATE + PROCESSOR_FEE_FIXED_CENTS / 2); // an average two-hour booking
    const revenue = extraHours * (PA_CUSTOMER_HOURLY_CENTS + payDeltas().paHourly);
    const cost = extraHours * (livePaHourlyPayCents() + perHourFee);
    neededHours += extraHours;
    payouts.assistantsCents += extraHours * livePaHourlyPayCents(); payouts.cardFeesCents += extraHours * perHourFee;
    lines.push({
      id: "extra-hours", label: "Assistant hours sold beyond the plans", revenueCents: revenue, costCents: cost, profitCents: revenue - cost,
      note: "Customers pay $45 an hour, the assistant earns $35, and the card fee comes off (an average two-hour booking).",
    });
  }

  const errands = whole(raw.paidErrands);
  if (errands > 0) {
    const tier = ERRAND_TIERS.some((t) => t.id === raw.errandTier) ? raw.errandTier : defaultPnlInputs().errandTier;
    const cap = clamp(raw.errandCapCents, 0, 75_000);
    // The same functions the app charges with: the fee, what the runner is paid, Stripe's cut and the task card.
    const fee = errandFeeCents(tier, cap);
    const runner = errandPayoutCents(tier);
    const processing = errandCardCostCents(cap + fee);
    const issuing = errandIssuingCostCents(cap);
    payouts.runnersCents += errands * runner; payouts.cardFeesCents += errands * (processing + issuing);
    const revenue = errands * fee;
    const cost = errands * (runner + processing + issuing);
    lines.push({
      id: "errands", label: "Errands with a fee", revenueCents: revenue, costCents: cost, profitCents: revenue - cost,
      note: `Each errand charges ${(fee / 100).toFixed(2)}; the runner is paid ${(runner / 100).toFixed(2)}, and Stripe's cut and the task card come out. The purchase itself passes through to the store.`,
    });
  }

  const trips = whole(raw.driverTrips);
  if (trips > 0) {
    const pay = whole(raw.driverPayPerTripCents);
    const fare = whole(raw.driverFareCents);
    const processing = fare > 0 ? errandCardCostCents(fare) : 0;
    payouts.driversCents += trips * pay; payouts.cardFeesCents += trips * processing;
    lines.push({
      id: "drivers", label: "Trips by your own drivers", revenueCents: trips * fare, costCents: trips * (pay + processing),
      profitCents: trips * (fare - pay - processing),
      note: fare > 0
        ? `Each trip charges ${(fare / 100).toFixed(2)} and pays the driver ${(pay / 100).toFixed(2)}, and Stripe's cut comes out.`
        : `Each trip pays the driver ${(pay / 100).toFixed(2)}. Enter what a client pays per trip to see the profit; until then this is only a cost.`,
    });
  }

  const hospitalDays = whole(raw.hospitalDays);
  if (hospitalDays > 0) {
    // The same functions a booking is charged and paid with: the client pays the hospital-day price,
    // the caretaker earns the hospital-day pay, and Stripe takes its cut of the client's charge.
    const price = serviceFeeFor("wait-with-someone", false, 1, MAX_BOOKED_HOURS, true);
    const pay = assistantPayoutFor("wait-with-someone", false, 1, MAX_BOOKED_HOURS, true);
    const processing = errandCardCostCents(price);
    payouts.assistantsCents += hospitalDays * pay; payouts.cardFeesCents += hospitalDays * processing;
    lines.push({
      id: "hospital-days", label: "Hospital caretaker days", revenueCents: hospitalDays * price,
      costCents: hospitalDays * (pay + processing), profitCents: hospitalDays * (price - pay - processing),
      note: `Each day the client pays ${(price / 100).toFixed(2)}, the caretaker is paid ${(pay / 100).toFixed(2)}, and Stripe's cut comes out.`,
    });
  }

  const armedClients = whole(raw.armedClients);
  const armedHours = armedClients * clamp(raw.armedHoursEach, 0, 300);
  if (armedHours > 0) {
    // The client rate and the bodyguard's pay are inputs so the margin can be tried at other numbers. Stripe's fixed
    // 30 cents is charged once per booking, so the hours are counted as bookings of 4 hours, the usual protection job.
    const hourlyPrice = whole(raw.armedRateCents);
    const hourlyPay = whole(raw.armedPayCents);
    const bookings = armedClients * Math.ceil(clamp(raw.armedHoursEach, 0, 300) / 4);
    const processing = Math.ceil(armedHours * hourlyPrice * CARD_FEE_RATE) + bookings * CARD_FEE_FIXED_CENTS;
    const revenue = armedHours * hourlyPrice, pay = armedHours * hourlyPay;
    payouts.assistantsCents += pay; payouts.cardFeesCents += processing;
    lines.push({
      id: "armed-bodyguard", label: "Armed bodyguard hours", revenueCents: revenue, costCents: pay + processing, profitCents: revenue - pay - processing,
      note: `Each hour the client pays ${(hourlyPrice / 100).toFixed(2)} and the bodyguard is paid ${(hourlyPay / 100).toFixed(2)}, less Stripe's cut. You keep about ${((revenue - pay - processing) / armedHours / 100).toFixed(2)} an hour.`,
    });
  }

  const clubMembers = whole(raw.clubMembers);
  if (clubMembers > 0) {
    const per = clubProfitPerMemberCents(clubMembers, clamp(raw.clubLightAttendance, 0, 1), clamp(raw.clubBigAttendance, 0, 1));
    payouts.cardFeesCents += clubMembers * cardFeeCents(CLUB_MONTHLY_DUES_CENTS);
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

  const count = whole(raw.assistantCount);
  const each = clamp(raw.hoursPerAssistant, 0, 300);
  const needed = Math.round(neededHours * 10) / 10;
  const available = count * each;
  const assistants = {
    count, hoursPerAssistant: each, neededHours: needed, availableHours: available,
    utilization: available > 0 ? needed / available : 0,
    neededCount: each > 0 ? Math.ceil(needed / each) : 0,
    payEachCents: count > 0 ? Math.round((needed * livePaHourlyPayCents()) / count) : 0,
  };

  return { lines, grossProfitCents, fixed, fixedCents, netCents, payouts, assistants, perMemberCents, premiumToBreakEven, runwayMonths };
}
