import type { Iso8601 } from "./types.ts";

/**
 * Driver applications — a place for real people to sign up to drive.
 *
 * This is separate from the Uber Guest Trips / Instacart integrations, which
 * bring their own drivers and shoppers. It exists for whatever Safehubby
 * vets and books directly: today that is nothing (the app resells other
 * platforms' fleets), but the secure-transport tier is exactly the kind of
 * service that has to be staffed by name, licence, and background check
 * rather than by API key — so the intake has to exist before that tier can
 * ever be real rather than a page describing it.
 *
 * The tier a driver applies for changes what the form requires. "Standard"
 * needs a driving licence and a roadworthy vehicle. "Secure transport" needs
 * a verifiable protective-services or law-enforcement licence, because that
 * is the entire premise of the tier — Safehubby is not the one who checks
 * whether a given state's armed-guard licence is real, a background-check
 * vendor and legal counsel are, but the application cannot omit the field
 * that makes the check possible.
 */

export type DriverTier = "standard" | "secure-transport";

export type ApplicationStatus = "submitted" | "under-review" | "approved" | "rejected" | "withdrawn";

export interface VehicleInfo {
  make: string;
  model: string;
  year: number;
  licensePlate: string;
}

export interface DriverApplication {
  id: string;
  tier: DriverTier;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  licenseNumber: string;
  licenseExpiry: Iso8601;
  yearsDriving: number;
  vehicle: VehicleInfo;
  /** Required only for the secure-transport tier. */
  protectiveLicenseNumber?: string;
  protectiveLicenseState?: string;
  yearsProtectiveExperience?: number;
  backgroundCheckConsent: boolean;
  submittedAt: Iso8601;
  status: ApplicationStatus;
  reviewedAt?: Iso8601;
  reviewerNote?: string;
}

export interface SubmitApplicationInput {
  id: string;
  tier: DriverTier;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  licenseNumber: string;
  licenseExpiry: string;
  yearsDriving: number;
  vehicle: VehicleInfo;
  protectiveLicenseNumber?: string;
  protectiveLicenseState?: string;
  yearsProtectiveExperience?: number;
  backgroundCheckConsent: boolean;
  now: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_VEHICLE_YEAR = 1990;

/**
 * Validates and normalizes an application. Every failure names the field, so a
 * public form can show it back rather than a generic "invalid" — this is the
 * one form in the app filled out by someone who is not yet a user and has no
 * account context to fall back on.
 */
export function submitApplication(input: SubmitApplicationInput): DriverApplication {
  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw new Error("Enter your full name.");

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");

  const phone = input.phone.replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Enter a valid phone number.");

  if (!input.city.trim()) throw new Error("Enter your city.");
  if (!input.state.trim()) throw new Error("Enter your state.");
  if (!input.licenseNumber.trim()) throw new Error("Enter your driver's licence number.");

  const expiry = new Date(input.licenseExpiry);
  if (Number.isNaN(expiry.getTime())) throw new Error("Enter a valid licence expiry date.");
  if (expiry.getTime() <= input.now.getTime()) throw new Error("That driver's licence has expired.");

  if (!Number.isFinite(input.yearsDriving) || input.yearsDriving < 0) {
    throw new Error("Enter your years of driving experience.");
  }

  const vehicle = validateVehicle(input.vehicle, input.now);

  if (!input.backgroundCheckConsent) {
    throw new Error("You must consent to a background check to apply.");
  }

  const base: DriverApplication = {
    id: input.id,
    tier: input.tier,
    fullName,
    email,
    phone,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    licenseNumber: input.licenseNumber.trim(),
    licenseExpiry: expiry.toISOString(),
    yearsDriving: input.yearsDriving,
    vehicle,
    backgroundCheckConsent: true,
    submittedAt: input.now.toISOString(),
    status: "submitted",
  };

  if (input.tier === "secure-transport") {
    if (!input.protectiveLicenseNumber?.trim()) {
      throw new Error("Secure-transport drivers must give a protective-services or law-enforcement licence number.");
    }
    if (!input.protectiveLicenseState?.trim()) {
      throw new Error("Enter the state that issued your protective-services licence.");
    }
    if (!Number.isFinite(input.yearsProtectiveExperience) || (input.yearsProtectiveExperience ?? -1) < 0) {
      throw new Error("Enter your years of protective, military, or law-enforcement experience.");
    }
    return {
      ...base,
      protectiveLicenseNumber: input.protectiveLicenseNumber.trim(),
      protectiveLicenseState: input.protectiveLicenseState.trim().toUpperCase(),
      yearsProtectiveExperience: input.yearsProtectiveExperience,
    };
  }

  return base;
}

function validateVehicle(vehicle: VehicleInfo, now: Date): VehicleInfo {
  if (!vehicle.make.trim() || !vehicle.model.trim()) throw new Error("Enter your vehicle's make and model.");
  const currentYear = now.getFullYear();
  if (!Number.isInteger(vehicle.year) || vehicle.year < MIN_VEHICLE_YEAR || vehicle.year > currentYear + 1) {
    throw new Error(`Enter a vehicle year between ${MIN_VEHICLE_YEAR} and ${currentYear + 1}.`);
  }
  if (!vehicle.licensePlate.trim()) throw new Error("Enter your licence plate.");
  return {
    make: vehicle.make.trim(),
    model: vehicle.model.trim(),
    year: vehicle.year,
    licensePlate: vehicle.licensePlate.trim().toUpperCase(),
  };
}

/**
 * Review transitions. `submitted` and `under-review` are open; `approved`,
 * `rejected` and `withdrawn` are terminal from the applicant's side, but an
 * admin can deliberately reopen a decided application to `under-review` —
 * people appeal, and paperwork gets fixed. What no one can do is jump straight
 * from `submitted` to `approved` with nothing looked at in between.
 */
const REVIEWABLE_FROM: ApplicationStatus[] = ["submitted", "under-review", "approved", "rejected"];

export function reviewApplication(
  app: DriverApplication,
  status: Exclude<ApplicationStatus, "withdrawn">,
  now: Date,
  reviewerNote?: string,
): DriverApplication {
  if (app.status === "withdrawn") throw new Error("This application was withdrawn by the applicant.");
  if (!REVIEWABLE_FROM.includes(app.status)) throw new Error(`Cannot review from status ${app.status}.`);
  if (status === "approved" && app.status === "submitted") {
    throw new Error("Move to under-review before approving — nothing should be approved sight-unseen.");
  }
  return { ...app, status, reviewedAt: now.toISOString(), reviewerNote: reviewerNote?.trim() || app.reviewerNote };
}

/** Withdrawal is the applicant's own call, and works from any non-terminal state. */
export function withdrawApplication(app: DriverApplication, now: Date): DriverApplication {
  if (app.status === "approved" || app.status === "rejected" || app.status === "withdrawn") {
    throw new Error(`Cannot withdraw an application that is already ${app.status}.`);
  }
  return { ...app, status: "withdrawn", reviewedAt: now.toISOString() };
}
