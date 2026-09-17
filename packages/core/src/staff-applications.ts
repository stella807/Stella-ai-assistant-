import type { Iso8601 } from "./types.ts";
import { findRole, type StaffRole } from "./staffing.ts";
import {
  assertWithdrawable, nextReviewStatus, type ApplicationStatus,
} from "./application-review.ts";
import { validateResume, type Resume } from "./resume.ts";

/**
 * Applications for the roles that do not drive: personal assistant, errand
 * runner, secretary.
 *
 * Its own module rather than more optional fields on `DriverApplication`.
 * That type is dense with vehicle, licence, plate and protective-licence
 * detail, none of which a secretary has, and widening it would mean every
 * one of those fields becomes "required, except when it isn't" — the shape
 * would stop saying what a valid application is, which is the one job it
 * does. A driver applying still goes through `driver-applications.ts`; the
 * `driver` role is deliberately rejected here rather than quietly accepted
 * with no vehicle.
 *
 * The review pipeline is not duplicated. Both this module and the driver one
 * call `application-review.ts`, so "nothing is approved sight-unseen" holds
 * for every role in the company from one implementation.
 */

export interface StaffApplication {
  id: string;
  role: Exclude<StaffRole, "driver">;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  /** Free text, and still the primary signal on purpose: the useful thing
   *  to know for this work is "have you looked after people before", which
   *  does not fit a dropdown, and a *required* résumé would screen out
   *  exactly the people who are good at it. `resume` below is the same
   *  application with an optional attachment, not a replacement for this
   *  field. */
  experience: string;
  /** Optional — see the doc comment on `experience` above for why this can
   *  never become required. Whoever has one can attach it; whoever doesn't
   *  is judged on `experience` the same as always. */
  resume?: Resume;
  /** Rough weekly availability, so the roster can be planned before anyone
   *  is interviewed. */
  hoursPerWeek: number;
  /** Right-to-work and background-check consent are both required, for the
   *  same reason the driver form requires them: this is in-person work with
   *  vulnerable people. */
  backgroundCheckConsent: boolean;
  submittedAt: Iso8601;
  status: ApplicationStatus;
  reviewedAt?: Iso8601;
  reviewerNote?: string;
}

export interface SubmitStaffApplicationInput {
  id: string;
  role: StaffRole;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  experience: string;
  resume?: Resume;
  hoursPerWeek: number;
  backgroundCheckConsent: boolean;
  now: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_HOURS_PER_WEEK = 80;
const MIN_EXPERIENCE_CHARS = 20;

/**
 * Validates and normalizes a staff application. Every failure names its own
 * field so a public form can show it back — the same contract
 * `submitApplication` holds, and for the same reason: whoever is filling this
 * in has no account and nothing else to go on.
 */
export function submitStaffApplication(input: SubmitStaffApplicationInput): StaffApplication {
  if (input.role === "driver") {
    throw new Error("Drivers apply through the driver application, which asks about your vehicle and licence.");
  }
  // Throws on an unknown role rather than accepting an application for a job
  // that does not exist.
  findRole(input.role);

  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw new Error("Enter your full name.");

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");

  const phone = input.phone.replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Enter a valid phone number.");

  if (!input.city.trim()) throw new Error("Enter your city.");
  if (!input.state.trim()) throw new Error("Enter your state.");

  const experience = input.experience.trim();
  if (experience.length < MIN_EXPERIENCE_CHARS) {
    throw new Error("Tell us a little about your relevant experience — a sentence or two is plenty.");
  }

  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0) {
    throw new Error("Enter how many hours a week you are looking for.");
  }
  if (input.hoursPerWeek > MAX_HOURS_PER_WEEK) {
    throw new Error(`Enter ${MAX_HOURS_PER_WEEK} hours a week or fewer.`);
  }

  if (!input.backgroundCheckConsent) {
    throw new Error("You must consent to a background check to apply.");
  }

  if (input.resume) validateResume(input.resume);

  return {
    id: input.id,
    role: input.role,
    fullName,
    email,
    phone,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    experience,
    ...(input.resume ? { resume: input.resume } : {}),
    hoursPerWeek: input.hoursPerWeek,
    backgroundCheckConsent: true,
    submittedAt: input.now.toISOString(),
    status: "submitted",
  };
}

/** Review transitions, on the shared pipeline so every role obeys the same
 *  rule that nothing jumps from submitted straight to approved. */
export function reviewStaffApplication(
  app: StaffApplication,
  status: Exclude<ApplicationStatus, "withdrawn">,
  now: Date,
  reviewerNote?: string,
): StaffApplication {
  return {
    ...app,
    status: nextReviewStatus(app.status, status),
    reviewedAt: now.toISOString(),
    reviewerNote: reviewerNote?.trim() || app.reviewerNote,
  };
}

export function withdrawStaffApplication(app: StaffApplication, now: Date): StaffApplication {
  assertWithdrawable(app.status);
  return { ...app, status: "withdrawn", reviewedAt: now.toISOString() };
}
