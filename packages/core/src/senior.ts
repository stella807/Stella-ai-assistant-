import { validateResume, type Resume } from "./resume.ts";
import type { Iso8601 } from "./types.ts";

/**
 * Basic is the plan for elderly members, at ownership's direction, and
 * joining it takes an ID: a date of birth showing they are at least
 * `SENIOR_MIN_AGE`, and a photo of a government ID that says so.
 *
 * Nothing here can check an ID against a government register — there is no
 * such API — so the photo is kept for staff to look at. Membership opens on
 * submission, so somebody alone without food is not kept waiting on a
 * reviewer; a reviewer who finds the ID does not match rejects it, and the
 * account loses Basic and its errand credit from then on.
 */

export const SENIOR_MIN_AGE = 65;

export type SeniorIdStatus = "submitted" | "approved" | "rejected";

export interface SeniorIdCheck {
  /** YYYY-MM-DD, as printed on the ID. */
  birthDate: string;
  /** A photo or scan of a government ID — a PDF or a clear photo. */
  document: Resume;
  status: SeniorIdStatus;
  submittedAt: Iso8601;
  reviewedAt?: Iso8601;
  /** Why it was rejected, shown back to the member. */
  note?: string;
}

/** Whole years old on `now`, or NaN for a date that is not a real one. */
export function ageOn(birthDate: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return Number.NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const born = new Date(Date.UTC(y, mo - 1, d));
  if (born.getUTCMonth() !== mo - 1 || born.getUTCDate() !== d) return Number.NaN;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d)) age -= 1;
  return age;
}

export function validateSeniorId(input: { birthDate: string; document: Resume }, now: Date): void {
  const age = ageOn(input.birthDate, now);
  if (!Number.isFinite(age) || age > 120) throw new Error("Enter your date of birth as it appears on your ID.");
  if (age < SENIOR_MIN_AGE) throw new Error(`Basic is for members ${SENIOR_MIN_AGE} and over.`);
  try {
    validateResume(input.document);
  } catch {
    throw new Error("Attach a photo of your ID — a driver's licence, state ID or passport.");
  }
}

/** Whether this account may hold Basic and use its errand credit. */
export const isSeniorEligible = (check: SeniorIdCheck | undefined) =>
  Boolean(check) && check!.status !== "rejected";
