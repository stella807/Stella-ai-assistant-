import { LAUNCH_WINDOW_START, SERVICE_LIVE_AT } from "./promotions.ts";

/**
 * Who Safehubby hires, what it costs to have them on the roster, and what the
 * two-month run-up to go-live adds up to.
 *
 * The pre-launch window (`LAUNCH_WINDOW_START`..`SERVICE_LIVE_AT`) is spent
 * hiring. Customers can sign up during it and are not charged — see
 * `promotions.ts` — so this is a period with **staffing cost and no
 * subscription revenue**, which makes it the one number in the business most
 * worth being able to compute rather than estimate. `prelaunchBudget` is that
 * number.
 *
 * Two commitments are made to everyone hired, and both are modelled here
 * rather than left as a promise in a job post:
 *
 *  - **Liability insurance for every hire, from day one.** Not a perk. People
 *    are being sent to strangers' locations, into other people's cars, and in
 *    the secure-transport case armed — uninsured exposure there is not a risk
 *    the company can absorb and not one a worker should carry personally.
 *  - **A gas stipend for drivers through the pre-launch window.** During those
 *    two months there are no fares, because there are no customers being
 *    served. A driver who accepted an offer, got insured, and showed up for
 *    orientation should not be out of pocket for the privilege of waiting for
 *    launch day.
 *
 * Every figure is one exported constant with its real-world basis in the
 * comment above it, because these are quotes to be replaced by actual quotes,
 * not truths. Nothing here charges anything or pays anyone: it is the model
 * the budget doc and the admin view read from.
 */

export type StaffRole =
  | "driver"
  | "personal-assistant"
  | "errand-runner"
  | "secretary"
  | "social-media-manager"
  | "lawyer";

export interface RoleInfo {
  id: StaffRole;
  label: string;
  /** What the job is, in the words a job post would use. */
  description: string;
  /** Whether the role drives for Safehubby, which is what makes the gas
   *  stipend and commercial auto coverage apply. */
  drives: boolean;
  /**
   * Hours a week this role is actually paid for during the pre-launch window,
   * and the rate for them.
   *
   * Zero for the field roles, and that is the whole reason the gas stipend
   * exists: drivers, assistants and errand runners are paid per job, and
   * during a window with no customers there are no jobs, so there is no wage
   * to pay them. A secretary is the opposite — the pre-launch work *is* the
   * job (processing applications, chasing insurance paperwork, answering the
   * people who signed up), so those hours are real payroll and belong in the
   * budget. Leaving them out was the easy way to make the number look small.
   */
  prelaunchHoursPerWeek: number;
  hourlyCents: number;
}

export const STAFF_ROLES: RoleInfo[] = [
  {
    id: "driver",
    label: "Driver",
    description: "Drive people home. Standard or secure transport, on a published per-trip rate.",
    drives: true,
    prelaunchHoursPerWeek: 0,
    hourlyCents: 0,
  },
  {
    id: "personal-assistant",
    label: "Personal assistant",
    description: "Go to people in person — wait with someone, check on a friend, handle a task end to end.",
    drives: false,
    prelaunchHoursPerWeek: 0,
    hourlyCents: 0,
  },
  {
    id: "errand-runner",
    label: "Errand runner",
    description: "Short, bounded pickups and errands. The quickest way onto the roster, and flexible hours.",
    drives: false,
    prelaunchHoursPerWeek: 0,
    hourlyCents: 0,
  },
  {
    id: "social-media-manager",
    label: "Social media manager",
    description: "Fill the launch: run the accounts, the launch party, the newsletter and the referral push that brings the first customers in.",
    drives: false,
    // The role the original plan forgot, and the one the launch actually
    // depends on. Two months of pre-launch signups, a mailing list and a
    // referral loop are all somebody's job, and if nobody does it the roster
    // below is nine field workers waiting for customers who never heard of
    // us. Paid for the window like the secretary, because the work is the
    // run-up itself — the same rate, because it is the same kind of
    // full-attention desk job.
    prelaunchHoursPerWeek: 20,
    hourlyCents: 2200,
  },
  {
    id: "secretary",
    label: "Secretary",
    description: "Keep the operation running: scheduling, applicant paperwork, customer email, dispatch support.",
    drives: false,
    // Reference: BLS's 2024 median for secretaries and administrative
    // assistants is roughly $45-48k a year, about $22/hour. Part-time at
    // twenty hours a week is what one market's pre-launch paperwork actually
    // needs — a full-time desk before there is a single customer is how a
    // launch spends its runway on overhead.
    prelaunchHoursPerWeek: 20,
    hourlyCents: 2200,
  },
  {
    id: "lawyer",
    label: "Lawyer",
    description: "Draft and review contracts: employment agreements, terms of service, privacy policies, driver agreements, and compliance documentation.",
    drives: false,
    // Pre-launch work: draft all required contracts before launch. $125/hr is
    // market rate for startup legal work. 15 hrs/week during pre-launch window
    // covers contract drafting, employment law review, and regulatory compliance.
    // Post-launch, this could become as-needed consulting or transition to
    // outside counsel.
    prelaunchHoursPerWeek: 15,
    hourlyCents: 12500,
  },
];

export function findRole(id: StaffRole): RoleInfo {
  const role = STAFF_ROLES.find((r) => r.id === id);
  if (!role) throw new Error(`Unknown staff role: ${id}`);
  return role;
}

/**
 * What everyone hired is promised, in the words the job post uses.
 *
 * Data rather than copy in a component, because these are commitments and
 * they are stated in three places — the careers page, the application form,
 * and the offer. Three hand-written copies is three chances for one of them
 * to be more generous than the company actually intends.
 */
export interface HiringBenefit {
  id: string;
  label: string;
  detail: string;
  /** Which roles it applies to. Empty means everyone. */
  roles?: StaffRole[];
}

export const HIRING_BENEFITS: HiringBenefit[] = [
  {
    id: "liability-insurance",
    label: "Liability insurance, from day one",
    detail:
      "Every person hired is covered while working, at no cost to them. You are going to strangers' addresses and into other people's cars — that exposure is the company's to carry, not yours.",
  },
  {
    id: "gas-stipend",
    label: "$10 a week for gas until we launch",
    detail:
      "There are no fares before launch day because there are no customers yet. Drivers who accept an offer and stay on the roster through the run-up get a fuel stipend for every week of it — you should not be out of pocket for waiting on us.",
    roles: ["driver"],
  },
  {
    id: "published-rates",
    label: "The rate is published before you apply",
    detail:
      "What a trip or a task pays is written down and visible up front, and the company's margin is added on top of it rather than taken out of it.",
  },
];

export function benefitsFor(role: StaffRole): HiringBenefit[] {
  return HIRING_BENEFITS.filter((b) => !b.roles || b.roles.includes(role));
}

/* ---------------------------------------------------------------------------
   What a hire costs to carry
   ------------------------------------------------------------------------ */

/**
 * Liability insurance, per person, per month.
 *
 * Reference range: occupational-accident and general-liability cover for
 * gig-style staff commonly quotes around $45-125 per worker per month in the
 * US, with commercial auto for a driving role materially higher again.
 * $75 is a mid-range placeholder for the non-driving roles.
 *
 * This is a placeholder until a broker quotes the real thing. It is
 * deliberately not optimistic: a budget that assumes the cheap end of an
 * insurance range and is wrong has no cover, which is the one line item where
 * being wrong is not recoverable.
 */
export const LIABILITY_INSURANCE_CENTS_PER_MONTH = 7500;

/**
 * The extra monthly premium for a role that drives, on top of the above.
 * Commercial/TNC auto liability is the expensive part of insuring this
 * business, and pretending one number covers both a secretary at a desk and a
 * driver at 2am would understate the budget by more than any other line.
 */
export const DRIVER_INSURANCE_SURCHARGE_CENTS_PER_MONTH = 12500;

/** What one month of cover costs for one person in this role. */
export function insuranceCentsPerMonth(role: StaffRole): number {
  return LIABILITY_INSURANCE_CENTS_PER_MONTH
    + (findRole(role).drives ? DRIVER_INSURANCE_SURCHARGE_CENTS_PER_MONTH : 0);
}

/**
 * The drivers' gas stipend during the pre-launch window: $10 a week, per
 * driver, for the two months before go-live.
 *
 * Read as weekly rather than monthly on purpose. $10 once, or $10 a month, is
 * not a stipend anybody notices; $10 a week for eight weeks is $80 per driver
 * and reads as what it is — we are covering your fuel while you wait for us
 * to open. If the intent was a different cadence this is the one constant to
 * change, and `GAS_STIPEND_WEEKS` below is derived from the window rather
 * than typed twice.
 */
export const GAS_STIPEND_CENTS_PER_WEEK = 1000;

/** The pre-launch window in whole weeks. Derived from the launch dates so it
 *  cannot fall out of step with them. */
export const PRELAUNCH_WEEKS = Math.round(
  (Date.parse(SERVICE_LIVE_AT) - Date.parse(LAUNCH_WINDOW_START)) / (7 * 86_400_000),
);

/** The stipend runs the whole window — same number, named for its own
 *  purpose so a future change to one is a deliberate choice about the other. */
export const GAS_STIPEND_WEEKS = PRELAUNCH_WEEKS;

/** What the stipend costs for one driver across the whole window. */
export function gasStipendCentsPerDriver(): number {
  return GAS_STIPEND_CENTS_PER_WEEK * GAS_STIPEND_WEEKS;
}

/* ---------------------------------------------------------------------------
   The pre-launch hiring plan
   ------------------------------------------------------------------------ */

/**
 * Who we are trying to have on the roster by go-live.
 *
 * Small on purpose. One market, one secretary, one person filling the
 * launch, and enough drivers and assistants to cover a weekend without
 * anyone working every shift of it.
 * Hiring ahead of demand is how a launch burns its runway before it has a
 * single paying customer, so these are floors to serve the first weekend, not
 * an org chart.
 */
export const PRELAUNCH_HEADCOUNT: Record<StaffRole, number> = {
  driver: 8,
  "personal-assistant": 5,
  "errand-runner": 4,
  secretary: 1,
  "social-media-manager": 1,
  lawyer: 1,
};

export interface RoleBudgetLine {
  role: StaffRole;
  label: string;
  headcount: number;
  insuranceCents: number;
  gasCents: number;
  /** Payroll for hours actually worked during the window — see
   *  `prelaunchHoursPerWeek`. Zero for the per-job field roles. */
  wagesCents: number;
  totalCents: number;
}

export interface PrelaunchBudget {
  /** How long the window runs, as whole months and as weeks. */
  months: number;
  weeks: number;
  lines: RoleBudgetLine[];
  insuranceCents: number;
  gasCents: number;
  wagesCents: number;
  /** Everything above, which is the cash needed to stand up the roster
   *  before a single subscription is charged. */
  totalCents: number;
}

/** The pre-launch window in whole months. Derived, not typed. */
export const PRELAUNCH_MONTHS = Math.round(
  (Date.parse(SERVICE_LIVE_AT) - Date.parse(LAUNCH_WINDOW_START)) / (30 * 86_400_000),
);

/**
 * What the pre-launch window costs in staffing, at a given headcount.
 *
 * Three lines: insurance for everyone, the gas stipend for the drivers, and
 * payroll for the hours that are genuinely worked before launch — which today
 * means the secretary and nobody else, because the field roles are paid per
 * job and there are no jobs yet.
 *
 * It is not a full operating budget. It does not model software, insurance
 * brokerage fees, background checks, a phone plan, or the founder's own time,
 * and it should not be read as "this is what launching costs". It is
 * authoritative about one thing: the staffing commitments already made, which
 * is the part that gets left out of the optimistic version.
 */
export function prelaunchBudget(
  headcount: Record<StaffRole, number> = PRELAUNCH_HEADCOUNT,
): PrelaunchBudget {
  const lines: RoleBudgetLine[] = STAFF_ROLES.map((role) => {
    const n = headcount[role.id] ?? 0;
    if (n < 0 || !Number.isInteger(n)) throw new Error(`Headcount for ${role.id} must be a whole number.`);
    const insuranceCents = n * insuranceCentsPerMonth(role.id) * PRELAUNCH_MONTHS;
    const gasCents = role.drives ? n * gasStipendCentsPerDriver() : 0;
    const wagesCents = n * role.prelaunchHoursPerWeek * role.hourlyCents * PRELAUNCH_WEEKS;
    return {
      role: role.id,
      label: role.label,
      headcount: n,
      insuranceCents,
      gasCents,
      wagesCents,
      totalCents: insuranceCents + gasCents + wagesCents,
    };
  });

  const insuranceCents = lines.reduce((sum, l) => sum + l.insuranceCents, 0);
  const gasCents = lines.reduce((sum, l) => sum + l.gasCents, 0);
  const wagesCents = lines.reduce((sum, l) => sum + l.wagesCents, 0);
  return {
    months: PRELAUNCH_MONTHS,
    weeks: PRELAUNCH_WEEKS,
    lines,
    insuranceCents,
    gasCents,
    wagesCents,
    totalCents: insuranceCents + gasCents + wagesCents,
  };
}

/** What insuring the roster costs every month, once the gas stipend has ended. */
export function monthlyInsuranceCents(
  headcount: Record<StaffRole, number> = PRELAUNCH_HEADCOUNT,
): number {
  return STAFF_ROLES.reduce(
    (sum, role) => sum + (headcount[role.id] ?? 0) * insuranceCentsPerMonth(role.id),
    0,
  );
}

/** Weeks per month, for turning an hourly rate into a monthly one. 52/12. */
const WEEKS_PER_MONTH = 52 / 12;

/** Monthly payroll for the salaried hours — the secretary's, today. */
export function monthlyPayrollCents(
  headcount: Record<StaffRole, number> = PRELAUNCH_HEADCOUNT,
): number {
  return Math.round(STAFF_ROLES.reduce(
    (sum, role) => sum
      + (headcount[role.id] ?? 0) * role.prelaunchHoursPerWeek * role.hourlyCents * WEEKS_PER_MONTH,
    0,
  ));
}

/**
 * What carrying the roster costs every month once the service is live: cover
 * for everyone plus the salaried hours. This is the recurring number
 * subscription revenue has to clear before anything else, and the reason it
 * is worth having as a function is that it moves every time headcount does.
 *
 * It excludes per-job pay for drivers and assistants on purpose — that scales
 * with work done and is already priced into each job (`driver-pay.ts`,
 * `CONCIERGE_ASSISTANT_PAYOUT_CENTS`), so counting it here would double-count
 * against the same revenue.
 */
export function monthlyRosterCents(
  headcount: Record<StaffRole, number> = PRELAUNCH_HEADCOUNT,
): number {
  return monthlyInsuranceCents(headcount) + monthlyPayrollCents(headcount);
}
