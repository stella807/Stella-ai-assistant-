import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function freshPayouts(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../src/adapters/payouts.ts");
}

const recipient = { accountHolderName: "Jordan Rivera", routingNumber: "021000021", accountNumber: "123456789" };

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok, status, json: async () => body, text: async () => JSON.stringify(body),
});

describe("revolutPayouts", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ORIGINAL_ENV }; vi.resetModules(); });

  it("reports handoff and never calls out when Revolut is not configured", async () => {
    const mod = await freshPayouts({ REVOLUT_API_BASE: undefined, REVOLUT_API_KEY: undefined });
    expect(mod.revolutPayouts.status.mode).toBe("handoff");
    await expect(mod.revolutPayouts.payOut({
      amountCents: 900, currency: "USD", recipient, reference: "payout_1",
    })).rejects.toThrow(/not configured/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports automatic once both env vars are set", async () => {
    const mod = await freshPayouts({ REVOLUT_API_BASE: "https://b2b.revolut.com/api", REVOLUT_API_KEY: "rk" });
    expect(mod.revolutPayouts.status.mode).toBe("automatic");
  });

  it("sends the amount in dollars, the recipient's real bank details, and the reference as an idempotency key", async () => {
    const mod = await freshPayouts({ REVOLUT_API_BASE: "https://b2b.revolut.com/api", REVOLUT_API_KEY: "rk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ id: "rev_pay_1" }));
    await mod.revolutPayouts.payOut({ amountCents: 90000, currency: "USD", recipient, reference: "payout_42" });

    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://b2b.revolut.com/api/1.0/pay");
    expect(opts.headers.authorization).toBe("Bearer rk");
    const body = JSON.parse(opts.body);
    expect(body.amount).toBe(900);
    expect(body.currency).toBe("USD");
    expect(body.request_id).toBe("payout_42");
    expect(body.counterparty).toMatchObject({
      account_holder_name: "Jordan Rivera", account_number: "123456789", routing_number: "021000021", country: "US",
    });
  });

  it("returns the provider's own payout id", async () => {
    const mod = await freshPayouts({ REVOLUT_API_BASE: "https://b2b.revolut.com/api", REVOLUT_API_KEY: "rk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ id: "rev_pay_2" }));
    const result = await mod.revolutPayouts.payOut({ amountCents: 900, currency: "USD", recipient, reference: "payout_1" });
    expect(result.payoutId).toBe("rev_pay_2");
  });

  it("throws rather than silently succeeding on a non-ok response", async () => {
    const mod = await freshPayouts({ REVOLUT_API_BASE: "https://b2b.revolut.com/api", REVOLUT_API_KEY: "rk" });
    (fetch as any).mockResolvedValueOnce(jsonResponse({ error: "insufficient funds" }, false, 402));
    await expect(mod.revolutPayouts.payOut({
      amountCents: 900, currency: "USD", recipient, reference: "payout_1",
    })).rejects.toThrow();
  });

  it("throws rather than silently succeeding when the request itself fails", async () => {
    const mod = await freshPayouts({ REVOLUT_API_BASE: "https://b2b.revolut.com/api", REVOLUT_API_KEY: "rk" });
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    await expect(mod.revolutPayouts.payOut({
      amountCents: 900, currency: "USD", recipient, reference: "payout_1",
    })).rejects.toThrow(/network down/);
  });
});
