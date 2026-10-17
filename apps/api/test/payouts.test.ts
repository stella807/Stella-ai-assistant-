import { describe, expect, it } from "vitest";
import { assistantPayouts } from "../src/adapters/payouts.ts";

describe("assistant payouts", () => {
  it("says plainly that payouts are paid by hand for now, and never pretends to send one", async () => {
    expect(assistantPayouts.status.mode).toBe("handoff");
    expect(assistantPayouts.status.requires).toMatch(/pay this one yourself/i);
    await expect(assistantPayouts.payOut({
      amountCents: 900, currency: "USD", recipient: { accountHolderName: "J", routingNumber: "021000021", accountNumber: "123456789" }, reference: "p1",
    })).rejects.toThrow(/pay this assistant yourself/i);
  });
});
