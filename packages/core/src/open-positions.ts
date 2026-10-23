import { ERRAND_MILEAGE_CENTS, ERRAND_TIERS, errandPayoutCents } from "./errand-tiers.ts";
import { ARMED_HOURLY_PAYOUT_CENTS, HOSPITAL_DAY_PAYOUT_CENTS, PA_HOURLY_RATE_CENTS } from "./concierge.ts";
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
 * today. They size a pilot in one area of Puerto Rico, with the owner doing the
 * desk work, so most roles are zero. A role at zero still takes applications —
 * it just says it is not hiring yet.
 */
export const OPEN_POSITIONS: Record<StaffRole, number> = {
  driver: 0,
  // Personal assistants are the go: they cover errands as well as sitting with
  // somebody and checking on them, so they are the hire that opens the service.
  // Errand runners are on hold until there is volume that a dedicated runner
  // would be busy for.
  "personal-assistant": 5,
  // Hospital days, at ownership's direction.
  caretaker: 3,
  "errand-runner": 0,
  secretary: 0,
  "social-media-manager": 0,
  lawyer: 0,
  "web-developer": 0,
  physician: 0,
  nurse: 0,
  "wingman-club-coordinator": 0,
};

/** How many openings remain once some are filled. Never negative. */
export function openingsFor(role: StaffRole, hired: number): number {
  return Math.max(0, OPEN_POSITIONS[role] - hired);
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * What the role pays, in a sentence — built from the constants the money is
 * actually paid with, never typed. An applicant deciding whether to apply is
 * the reader a stale number costs the most.
 */
export function payLabelFor(role: StaffRole, language: "en" | "es" = "en"): string {
  const es = language === "es";
  if (role === "errand-runner") {
    const pays = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
    const [lo, hi, mile] = [usd(Math.min(...pays)), usd(Math.max(...pays)), usd(ERRAND_MILEAGE_CENTS)];
    return es
      ? `De ${lo} a ${hi} por encargo, según el tamaño, más ${mile} por milla. Necesitas tu propio seguro de responsabilidad civil`
      : `${lo} to ${hi} per errand, by size, plus ${mile} a mile. Bring your own liability insurance`;
  }
  if (role === "caretaker") {
    const [day, hour] = [usd(HOSPITAL_DAY_PAYOUT_CENTS), usd(PA_HOURLY_RATE_CENTS)];
    return es
      ? `${day} por un día de hospital (hasta 12 horas); ${hour} la hora en visitas más cortas. Necesitas tu propio seguro de responsabilidad civil`
      : `${day} per hospital day (up to 12 hours); ${hour} an hour for shorter visits. Bring your own liability insurance`;
  }
  if (role === "personal-assistant") {
    const [hour, day, armed] = [usd(PA_HOURLY_RATE_CENTS), usd(HOSPITAL_DAY_PAYOUT_CENTS), usd(ARMED_HOURLY_PAYOUT_CENTS)];
    return es
      ? `${hour} la hora; ${day} por un día de hospital (hasta 12 horas); ${armed} la hora en trabajos armados, con licencia de armas y de guardia. Necesitas tu propio seguro de responsabilidad civil`
      : `${hour} an hour; ${day} for a hospital day (up to 12 hours); ${armed} an hour on armed jobs, with firearms and guard licences. Bring your own liability insurance`;
  }
  const info = STAFF_ROLES.find((r) => r.id === role);
  if (info && info.hourlyCents > 0) {
    return es
      ? `${usd(info.hourlyCents)} la hora, unas ${info.prelaunchHoursPerWeek} horas a la semana`
      : `${usd(info.hourlyCents)} an hour, about ${info.prelaunchHoursPerWeek} hours a week`;
  }
  // Paid per trip and not yet live: see driver-pay.ts. Said rather than skipped.
  return es ? "Pago por viaje: las tarifas están en la solicitud para manejar" : "Paid per trip — see the driver application for the rates";
}
