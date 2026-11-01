/**
 * Turns what someone typed into the pricing panel into whole cents.
 *
 * The panel's field used to want raw cents, but every rate on that screen is
 * shown in dollars, so people typed "12.50" and the API received 12.5 — half
 * a cent it either stored as-is or refused with no explanation. Parsing the
 * text as decimal dollars (never via float multiplication, where 1.15 * 100
 * is 114.99999999999999) keeps the unit the person is looking at and the unit
 * the API stores from drifting apart again.
 *
 * Returns null for anything that is not a positive amount with at most two
 * decimal places, so the caller can say so instead of sending a guess.
 */
export function dollarsToCents(text: string): number | null {
  const cleaned = text.replace(/[\s$,]/g, "");
  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  if (!whole && !fraction) return null;
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
