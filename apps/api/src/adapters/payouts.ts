import type { PayoutPort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";
import { postJson } from "./fulfillment.ts";

/**
 * Biweekly payouts to assistants, through Revolut Business — the same
 * account and the same credentials already used to issue task cards in
 * `cards.ts`. A real Revolut Business account can both issue cards and send
 * external payments, so this reuses `REVOLUT_API_BASE`/`REVOLUT_API_KEY`
 * rather than inventing a second provider decision for what is, from
 * Revolut's side, the same account. See `cards.ts`'s doc comment for the
 * caveats that apply to both: OAuth2 client-credentials rather than a bare
 * bearer token, and endpoint shapes that are a best-effort mapping of
 * Revolut's documented Business API, not verified against a live sandbox.
 *
 * Revolut's Business payments API pays a "counterparty" it already knows
 * about, not a raw account number handed over inline — a real integration
 * would first create or look up a counterparty for the assistant's bank
 * details, then pay that counterparty. This adapter folds both steps into
 * one call for simplicity; the counterparty-creation call is the one to
 * split out first if a real sandbox shows a different shape.
 */

const REVOLUT_BASE = process.env.REVOLUT_API_BASE;
const REVOLUT_KEY = process.env.REVOLUT_API_KEY;

export const revolutPayouts: PayoutPort = {
  status: statusFor(
    "revolut-payouts", "Revolut Business", Boolean(REVOLUT_BASE && REVOLUT_KEY),
    "The same Revolut Business account used for card issuing (see cards.ts), then REVOLUT_API_BASE and REVOLUT_API_KEY.",
  ),

  async payOut(input): Promise<{ payoutId: string }> {
    if (!REVOLUT_BASE || !REVOLUT_KEY) throw new Error("Revolut Business is not configured.");

    const data = await postJson(
      `${REVOLUT_BASE.replace(/\/$/, "")}/1.0/pay`,
      { authorization: `Bearer ${REVOLUT_KEY}` },
      {
        request_id: input.reference,
        amount: input.amountCents / 100,
        currency: input.currency,
        counterparty: {
          account_holder_name: input.recipient.accountHolderName,
          account_number: input.recipient.accountNumber,
          routing_number: input.recipient.routingNumber,
          country: "US",
        },
        reference: `Safehubby payout ${input.reference}`,
      },
    );

    return { payoutId: String(data.id ?? "") };
  },
};
