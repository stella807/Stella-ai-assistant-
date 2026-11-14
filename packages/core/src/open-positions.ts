import { ERRAND_MILEAGE_CENTS, ERRAND_TIERS, errandPayoutCents } from "./errand-tiers.ts";
import { ARMED_HOURLY_PAYOUT_CENTS, HOSPITAL_DAY_PAYOUT_CENTS, PA_HOURLY_RATE_CENTS, liveArmedHourlyPayCents, liveHospitalDayPayCents, livePaHourlyPayCents } from "./concierge.ts";
import { jobPayRates } from "./pricing-overrides.ts";
import { STAFF_ROLES, type StaffRole } from "./staffing.ts";

/**
 * Who we are hiring right now, and what each role pays — as an applicant sees it.
 *
 * Distinct from `PRELAUNCH_HEADCOUNT` in staffing.ts, which is a budget: the
 * floors the pre-launch cost is worked out against, sized to cover a first
 * weekend across drivers, a physician and a lawyer. That is a plan for what
 * launching could cost, not an ask to the public. Telling somebody "we need
 * eight drivers" when nobody drives for Safehubby yet is how a hiring page
 * turns into a promise.
 *
 * These are the owner's to change: the number of people wanted in each role
 * today. A role at zero still takes applications — it just says it is not
 * hiring yet.
 */
export const OPEN_POSITIONS: Record<StaffRole, number> = {
  // Every role is open, at ownership's direction. Personal assistants are the
  // hire that opens the service, so they carry the most seats; the rest start
  // at three. The careers page never says "not hiring": a job with no seats left just shows no count.
  driver: 3,
  "personal-assistant": 5,
  // Hospital days.
  caretaker: 3,
  "errand-runner": 3,
  secretary: 3,
  "social-media-manager": 3,
  lawyer: 3,
  "web-developer": 3,
  physician: 3,
  nurse: 3,
  "wingman-club-coordinator": 3,
  bodyguard: 2,
  supervisor: 2,
};

/**
 * The day every role above was opened to applicants. A job listing has to say
 * when it was posted, and a search engine drops one that changes its date on
 * every visit, so this is a fixed day and moves only when hiring is reopened.
 */
export const HIRING_OPENED_ON = "2026-10-28";

/** How many openings remain once some are filled. Never negative. */
export function openingsFor(role: StaffRole, hired: number, targets: Partial<Record<StaffRole, number>> = {}): number {
  return Math.max(0, (targets[role] ?? OPEN_POSITIONS[role]) - hired);
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * What the role pays, in a sentence — built from the constants the money is
 * actually paid with, never typed. An applicant deciding whether to apply is
 * the reader a stale number costs the most.
 */
/** Pay the owner has set per job, in cents; a job with no entry pays its default. */
export type JobPayRates = Partial<Record<StaffRole, number>>;

export function payLabelFor(
  role: StaffRole, language: "en" | "es" = "en", rates: JobPayRates = {},
): string {
  const es = language === "es";
  const set = rates[role];
  if (role === "errand-runner" && set) {
    return es
      ? `${usd(set)} por encargo, más ${usd(ERRAND_MILEAGE_CENTS)} por milla. Necesitas tu propio seguro de responsabilidad civil`
      : `${usd(set)} per errand, plus ${usd(ERRAND_MILEAGE_CENTS)} a mile. Bring your own liability insurance`;
  }
  if (role === "errand-runner") {
    const pays = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
    const [lo, hi, mile] = [usd(Math.min(...pays)), usd(Math.max(...pays)), usd(ERRAND_MILEAGE_CENTS)];
    return es
      ? `De ${lo} a ${hi} por encargo, según el tamaño, más ${mile} por milla. Necesitas tu propio seguro de responsabilidad civil`
      : `${lo} to ${hi} per errand, by size, plus ${mile} a mile. Bring your own liability insurance`;
  }
  if (role === "bodyguard") {
    const hour = usd(set ?? liveArmedHourlyPayCents());
    return es
      ? `${hour} la hora, armado. Necesitas tus propias licencias de armas y de guardia de seguridad (Ley 108) y tu propio seguro de responsabilidad civil`
      : `${hour} an hour, armed. Bring your own firearms and security-guard licenses (Ley 108) and your own liability insurance`;
  }
  if (role === "caretaker") {
    const [day, hour] = [usd(set ?? liveHospitalDayPayCents()), usd(livePaHourlyPayCents())];
    return es
      ? `${day} por un día de hospital (hasta 12 horas); ${hour} la hora en visitas más cortas. Necesitas tu propio seguro de responsabilidad civil`
      : `${day} per hospital day (up to 12 hours); ${hour} an hour for shorter visits. Bring your own liability insurance`;
  }
  if (role === "personal-assistant") {
    const [hour, day] = [usd(set ?? livePaHourlyPayCents()), usd(liveHospitalDayPayCents())];
    return es
      ? `${hour} la hora; ${day} por un día de hospital (hasta 12 horas). Sin armas: el trabajo armado es solo para guardaespaldas. Necesitas tu propio seguro de responsabilidad civil`
      : `${hour} an hour; ${day} for a hospital day (up to 12 hours). Unarmed: armed work is for bodyguards only. Bring your own liability insurance`;
  }
  const info = STAFF_ROLES.find((r) => r.id === role);
  const hourly = set ?? info?.hourlyCents ?? 0;
  if (info && hourly > 0) {
    // No hours are carried before launch for this role, so promising "about 0 hours a week" would be both odd and wrong.
    if (info.prelaunchHoursPerWeek <= 0) {
      return es ? `${usd(hourly)} la hora, según haya trabajo` : `${usd(hourly)} an hour, as work comes in`;
    }
    return es
      ? `${usd(hourly)} la hora, unas ${info.prelaunchHoursPerWeek} horas a la semana`
      : `${usd(hourly)} an hour, about ${info.prelaunchHoursPerWeek} hours a week`;
  }
  // Paid per trip and not yet live: see driver-pay.ts. Said rather than skipped.
  return es ? "Pago por viaje: las tarifas están en la solicitud para manejar" : "Paid per trip — see the driver application for the rates";
}

/** Every job on the job list except driving, which has its own per-trip rates. */
export const JOB_PAY_ROLES = STAFF_ROLES.filter((r) => r.id !== "driver");

/** What the one pay figure for a job means, so the owner edits the right thing. */
export function jobPayUnit(role: StaffRole): string {
  if (role === "errand-runner") return "per errand";
  if (role === "caretaker") return "per hospital day";
  return "per hour";
}

export function defaultJobPayCents(role: StaffRole): number {
  if (role === "errand-runner") return Math.min(...ERRAND_TIERS.map((t) => errandPayoutCents(t.id, false)));
  if (role === "caretaker") return HOSPITAL_DAY_PAYOUT_CENTS;
  if (role === "bodyguard") return ARMED_HOURLY_PAYOUT_CENTS;
  if (role === "personal-assistant") return PA_HOURLY_RATE_CENTS;
  return STAFF_ROLES.find((r) => r.id === role)?.hourlyCents ?? 0;
}

/** The owner's job pay as differences from the built-in rates, for the pricing functions to apply. */
export function payDeltasFrom(overrides: Parameters<typeof jobPayRates>[0]): { paHourly: number; hospitalDay: number; errand: number; armedHourly: number } {
  const r = jobPayRates(overrides);
  const diff = (role: StaffRole) => (r[role] === undefined ? 0 : r[role]! - defaultJobPayCents(role));
  return { paHourly: diff("personal-assistant"), hospitalDay: diff("caretaker"), errand: diff("errand-runner"), armedHourly: diff("bodyguard") };
}
