import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
async function fresh(key: string | undefined) {
  vi.resetModules();
  if (key === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = key;
  return import("../src/adapters/stripe.ts");
}
const calls: { url: string; body: URLSearchParams; headers: Record<string, string> }[] = [];
function stubStripe(reply: Record<string, unknown>, ok = true) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")), headers: init?.headers as Record<string, string> });
    return { ok, status: ok ? 200 : 402, json: async () => reply } as Response;
  }));
}

describe("charging a saved card through Stripe", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ORIGINAL_ENV }; vi.resetModules(); });

  it("reserves the exact amount on the card without taking it yet", async () => {
    const s = await fresh("sk_test_x");
    stubStripe({ id: "pi_1", status: "requires_capture" });
    const r = await s.holdOnCard({ customerId: "cus_1", paymentMethodId: "pm_1", amountCents: 18750, description: "Wait with someone", idempotencyKey: "hold_1" });
    expect(r).toEqual({ id: "pi_1" });
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/payment_intents");
    const b = calls[0]!.body;
    expect(b.get("amount")).toBe("18750");
    expect(b.get("currency")).toBe("usd");
    expect(b.get("capture_method")).toBe("manual");
    expect(b.get("off_session")).toBe("true");
    expect(b.get("confirm")).toBe("true");
    expect(b.get("customer")).toBe("cus_1");
    expect(b.get("payment_method")).toBe("pm_1");
    expect(calls[0]!.headers["idempotency-key"]).toBe("hold_1");
  });

  it("refuses a hold the bank wants the customer to approve, rather than pretending it went through", async () => {
    const s = await fresh("sk_test_x");
    stubStripe({ id: "pi_2", status: "requires_action" });
    await expect(s.holdOnCard({ customerId: "c", paymentMethodId: "p", amountCents: 100, description: "x", idempotencyKey: "k" }))
      .rejects.toThrow(/bank/i);
  });

  it("passes on the bank's own reason when a card is declined", async () => {
    const s = await fresh("sk_test_x");
    stubStripe({ error: { message: "Your card was declined." } }, false);
    await expect(s.holdOnCard({ customerId: "c", paymentMethodId: "p", amountCents: 100, description: "x", idempotencyKey: "k" }))
      .rejects.toThrow("Your card was declined.");
  });

  it("takes only what was actually spent, and lets go of the rest", async () => {
    const s = await fresh("sk_test_x");
    stubStripe({ id: "pi_1", status: "succeeded" });
    await s.captureOnCard("pi_1", 9640);
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/payment_intents/pi_1/capture");
    expect(calls[0]!.body.get("amount_to_capture")).toBe("9640");
  });

  it("releases the whole hold when nothing is charged", async () => {
    const s = await fresh("sk_test_x");
    stubStripe({ id: "pi_1", status: "canceled" });
    await s.releaseOnCard("pi_1");
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/payment_intents/pi_1/cancel");
  });

  it("does nothing at all without a Stripe key", async () => {
    const s = await fresh(undefined);
    stubStripe({});
    expect(s.cardChargingReady()).toBe(false);
    await expect(s.holdOnCard({ customerId: "c", paymentMethodId: "p", amountCents: 1, description: "x", idempotencyKey: "k" })).rejects.toThrow(/not configured/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
