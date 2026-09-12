import { normalizeReferralCode } from "@safehubby/core";

/**
 * The invite code a visitor arrived with, if any.
 *
 * Read once at module load and remembered, because the code arrives on the
 * URL (`?ref=ABC-DE4`) but is not needed until signup, which can be several
 * interactions later — and anything in between (a manual reload, the
 * carousel, a link to the employee portal) would otherwise drop it. Kept in
 * `sessionStorage` rather than `localStorage` so it expires with the tab
 * instead of silently attributing an account months later.
 *
 * A malformed code resolves to `""` rather than being passed through, so a
 * truncated or hand-mangled link simply behaves like no referral at all.
 */
const STORAGE_KEY = "safehubby-ref";

function read(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("ref");
  const normalized = normalizeReferralCode(fromUrl ?? "");
  if (normalized) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // Private browsing can refuse storage. The code still works for this
      // page view, which is the common case anyway.
    }
    return normalized;
  }
  try {
    return normalizeReferralCode(window.sessionStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

const arrivedWith = read();

export function incomingReferralCode(): string {
  return arrivedWith;
}

/** Forgets the stored code once it has been used, so a second account made
 *  in the same tab is not credited to the same referrer twice. */
export function clearReferralCode(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage was unavailable to begin with.
  }
}
