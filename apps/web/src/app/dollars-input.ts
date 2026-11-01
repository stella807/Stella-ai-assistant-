/** The most a rate can be set to, in cents: $100,000 (an owner's monthly figure is the largest thing set here). */
export const MAX_RATE_CENTS = 10_000_000;

/**
 * Turns what someone types into a rate ("35", "12.5", "12,50", "$12.50") into whole cents,
 * or null when it is not a usable amount. The rate form asks for dollars because every
 * label on it is in dollars; the server stores and checks cents.
 */
export function dollarsToCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 && cents <= MAX_RATE_CENTS ? cents : null;
}
