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
