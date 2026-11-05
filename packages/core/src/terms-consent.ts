/**
 * The version of the consent a client agrees to at sign-up: the Terms of
 * Service, the Privacy Policy, the Client Disclosures, and that armed
 * personnel may be with them when they book armed protection. (Distinct from
 * `consent.ts`, which is about sharing location with a guardian.)
 *
 * Recorded with the date on the account. Change it when the wording changes in
 * a way a client should agree to again; everyone is then asked once more
 * before their next armed booking.
 */
export const CONSENT_VERSION = "2026-11";

/** The youngest a person may be to create an account. */
export const MINIMUM_AGE = 18;

/**
 * Whether a date of birth (YYYY-MM-DD) makes someone at least `MINIMUM_AGE` on
 * the given day. A date that is not a real calendar date, or is in the future,
 * is not adult. Worked out from the calendar date alone, in UTC, so a client's
 * time zone cannot move their birthday.
 */
export function isAdult(birthDate: string, now: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const born = new Date(Date.UTC(y, mo - 1, d));
  if (born.getUTCFullYear() !== y || born.getUTCMonth() !== mo - 1 || born.getUTCDate() !== d) return false;
  if (born.getTime() > now.getTime()) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - MINIMUM_AGE, now.getUTCMonth(), now.getUTCDate()));
  return born.getTime() <= cutoff.getTime();
}
