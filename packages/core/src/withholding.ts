import type { LaunchMarketId } from "./service-area.ts";

/**
 * Tax held back from what a worker is paid, for Hacienda.
 *
 * Puerto Rico requires withholding 10% when paying a resident individual for
 * services, unless the worker gives a Hacienda exemption certificate. The rate
 * is the owner's instruction after being told to confirm it with a Puerto Rico
 * CPA; there is deliberately no annual-threshold rule here because that figure
 * has not been confirmed — add one only once it is.
 *
 * Applied to what is payable after clawbacks, since that is what is actually
 * paid for the work.
 */
export const PR_WITHHOLDING_RATE = 0.1;

export function withholdingFor(input: {
  market: LaunchMarketId | undefined;
  payableCents: number;
  exempt?: boolean;
}): { withheldCents: number; netCents: number } {
  const { market, payableCents, exempt } = input;
  if (market !== "puerto-rico" || exempt || payableCents <= 0) return { withheldCents: 0, netCents: Math.max(0, payableCents) };
  const withheldCents = Math.round(payableCents * PR_WITHHOLDING_RATE);
  return { withheldCents, netCents: payableCents - withheldCents };
}
