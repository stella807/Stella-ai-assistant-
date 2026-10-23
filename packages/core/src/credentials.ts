import { validateResume, type Resume } from "./resume.ts";
import type { StaffRole } from "./staffing.ts";
import type { Iso8601 } from "./types.ts";

/**
 * What a field worker has to hold before they are sent to anybody.
 *
 * **Insurance, their own.** Everyone who goes out to customers — personal
 * assistants, caretakers and errand runners — carries their own liability insurance, at
 * ownership's direction, and proves it on the application: provider, policy
 * number, expiry and a copy of the certificate. A policy that has run out
 * takes them off the roster until a new one is on file.
 *
 * **Armed work, only with both licences.** Regular work is unarmed. An armed
 * job — a safety wait somewhere with no security — goes only to somebody
 * holding a Puerto Rico firearms licence *and* a security-guard licence: in
 * Puerto Rico, being paid to be armed while protecting somebody is guard work
 * (Ley 108), so a personal firearms licence alone is not enough. Armed work is
 * never offered for a hospital stay, since hospitals do not allow firearms.
 *
 * Nothing here checks a licence against a government register — there is no
 * such API. The documents are what a reviewer checks by eye before hiring;
 * this module makes sure they were provided, are not expired, and are
 * re-checked at every dispatch.
 */

export type CredentialKind = "liability-insurance" | "firearms-license" | "guard-license";

export interface Credential {
  kind: CredentialKind;
  /** Policy or licence number, as printed on the document. */
  number: string;
  /** Insurer or issuing agency. */
  issuer: string;
  /** When it stops being valid. */
  expiresAt: Iso8601;
  /** A copy of the certificate or licence — a PDF or a clear photo. */
  document: Resume;
}

export const CREDENTIAL_LABEL: Record<CredentialKind, string> = {
  "liability-insurance": "Liability insurance",
  "firearms-license": "Firearms licence",
  "guard-license": "Security-guard licence",
};

/** Roles that go out to customers, and so must carry their own insurance. */
export const INSURED_ROLES: StaffRole[] = ["personal-assistant", "caretaker", "errand-runner"];
export const requiresInsurance = (role: StaffRole) => INSURED_ROLES.includes(role);

export function validateCredential(c: Credential, now: Date): void {
  const label = CREDENTIAL_LABEL[c.kind];
  if (!label) throw new Error("Unknown kind of credential.");
  if (!c.number.trim()) throw new Error(`Enter the ${label.toLowerCase()} number.`);
  if (!c.issuer.trim()) throw new Error(`Enter who issued the ${label.toLowerCase()}.`);
  const expires = Date.parse(c.expiresAt);
  if (!Number.isFinite(expires)) throw new Error(`Enter when the ${label.toLowerCase()} expires.`);
  if (expires <= now.getTime()) throw new Error(`That ${label.toLowerCase()} has already expired.`);
  try {
    validateResume(c.document);
  } catch {
    throw new Error(`Attach a copy of the ${label.toLowerCase()} — a PDF or a clear photo.`);
  }
}

export const isCurrent = (c: { expiresAt: Iso8601 } | undefined, now: Date) =>
  Boolean(c) && Date.parse(c!.expiresAt) > now.getTime();

/**
 * Until when somebody may be sent armed: the earlier of the two licences'
 * expiry, or undefined when either is missing or already expired.
 */
export function armedUntil(credentials: Credential[] | undefined, now: Date): Iso8601 | undefined {
  const gun = credentials?.find((c) => c.kind === "firearms-license");
  const guard = credentials?.find((c) => c.kind === "guard-license");
  if (!isCurrent(gun, now) || !isCurrent(guard, now)) return undefined;
  return Date.parse(gun!.expiresAt) < Date.parse(guard!.expiresAt) ? gun!.expiresAt : guard!.expiresAt;
}
