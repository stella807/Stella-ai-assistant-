import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureOnCard, chargeOnCard, holdOnCard, releaseOnCard } from "../src/adapters/stripe.ts";
import { captureHeld, chargeSaved, releaseHeld } from "../src/adapters/charging.ts";

const ENV = { ...process.env };
type Call = { url: string; body: URLSearchParams; headers: Record<string, string> };
const calls: Call[] = [];
function stubStripe(reply: (call: Call) => { ok?: boolean; body: unknown }) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url: String(url), body: new URLSearchParams(String(init?.body ?? "")), headers: init?.headers as Record<string, string> };
    calls.push(call);
    const r = reply(call);
    return { ok: r.ok ?? true, status: r.ok === false ? 402 : 200, json: async () => r.body } as Response;
  }));
}
const charge = { customerId: "cus_1", paymentMethodId: "pm_1", amountCents: 9399, description: "Premium monthly", idempotencyKey: "chg_1" };

describe("Stripe card charging", () => {
  beforeEach(() => { process.env.STRIPE_SECRET_KEY = "sk_test_x"; });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });

  it("holds the exact amount for a task, off-session and keyed to the hold", async () => {
    stubStripe(() => ({ body: { id: "pi_1", status: "requires_capture" } }));
    expect(await holdOnCard({ ...charge, idempotencyKey: "hold_1" })).toEqual({ id: "pi_1" });
    const b = calls[0]!.body;
    expect([b.get("amount"), b.get("capture_method"), b.get("off_session"), b.get("customer")]).toEqual(["9399", "manual", "true", "cus_1"]);
    expect(calls[0]!.headers["idempotency-key"]).toBe("hold:hold_1");
  });

  it("refuses a hold the bank wants approved, and cancels it", async () => {
    stubStripe(() => ({ body: { id: "pi_2", status: "requires_action" } }));
    await expect(holdOnCard(charge)).rejects.toThrow(/bank/i);
    expect(calls[1]!.url).toMatch(/pi_2\/cancel$/);
  });

  it("passes on the bank's reason for a decline", async () => {
    stubStripe(() => ({ ok: false, body: { error: { message: "Your card was declined." } } }));
    await expect(holdOnCard(charge)).rejects.toThrow("Your card was declined.");
  });

  it("captures what was spent, and releases a hold with nothing spent", async () => {
    stubStripe(() => ({ body: { id: "pi_1", status: "succeeded" } }));
    await captureOnCard("pi_1", 4200);
    expect(calls[0]!.url).toMatch(/pi_1\/capture$/);
    expect(calls[0]!.body.get("amount_to_capture")).toBe("4200");
    await captureOnCard("pi_1", 0);
    expect(calls[1]!.url).toMatch(/pi_1\/cancel$/);
    await releaseOnCard("pi_1");
    expect(calls[2]!.url).toMatch(/pi_1\/cancel$/);
  });

  it("bills a plan as a tax-inclusive invoice paid off the saved card", async () => {
    process.env.STRIPE_TAX = "on";
    stubStripe((c) => ({
      body: c.url.endsWith("/v1/invoices") ? { id: "in_1", status: "draft" }
        : c.url.endsWith("/pay") ? { id: "in_1", status: "paid" } : { id: "x" },
    }));
    expect(await chargeOnCard(charge)).toEqual({ id: "in_1" });
    expect(calls.map((c) => c.url.replace("https://api.stripe.com", ""))).toEqual([
      "/v1/invoices", "/v1/invoiceitems", "/v1/invoices/in_1/finalize", "/v1/invoices/in_1/pay",
    ]);
    expect(calls[0]!.body.get("automatic_tax[enabled]")).toBe("true");
    expect(calls[1]!.body.get("tax_behavior")).toBe("inclusive");
    expect(calls[1]!.body.get("amount")).toBe("9399");
    expect(calls[0]!.headers["idempotency-key"]).toBe("invoice:chg_1");
  });

  it("leaves tax off unless STRIPE_TAX is on, and does not re-bill a paid invoice", async () => {
    stubStripe(() => ({ body: { id: "in_9", status: "paid" } }));
    expect(await chargeOnCard(charge)).toEqual({ id: "in_9" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.get("automatic_tax[enabled]")).toBeNull();
  });

  it("routes by processor and by hold reference", async () => {
    stubStripe((c) => ({ body: c.url.endsWith("/v1/invoices") ? { id: "in_2", status: "paid" } : { id: "pi_3", status: "succeeded" } }));
    await chargeSaved({ processor: "stripe", ...charge });
    expect(calls[0]!.url).toMatch(/\/v1\/invoices$/);
    await captureHeld("pi_3", 100);
    await releaseHeld("pi_3");
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining([expect.stringMatching(/pi_3\/capture$/), expect.stringMatching(/pi_3\/cancel$/)]));
    await expect(chargeSaved({ processor: "stripe", ...charge, customerId: undefined })).rejects.toThrow(/customer/i);
    await expect(captureHeld("ch_unknown", 1)).rejects.toThrow(/no longer connected/);
  });
});
