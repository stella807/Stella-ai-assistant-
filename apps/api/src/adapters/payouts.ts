import type { PayoutPort, ProviderStatus } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Paying assistants. There is no automatic payout provider wired in: payroll
 * still works out every 14 days what each assistant is owed (and holds back
 * the 10% for Hacienda in Puerto Rico), and records the payout with the
 * reason below, so the owner can send it from the business bank account or
 * ATH Business. A payout provider plugs in here later.
 */
let statusOverride: ProviderStatus | undefined;

export const assistantPayouts: PayoutPort = {
  get status() {
    return statusOverride ?? statusFor(
      "assistant-payouts", "Assistant payouts", false,
      "Pay this one yourself from the business bank account or ATH Business — no automatic payout provider is connected.",
    );
  },
  set status(value) { statusOverride = value; },

  async payOut() {
    throw new Error("No automatic payout provider is connected — pay this assistant yourself.");
  },
};
