import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeWithPaypal, capturePaypalHold, chargeWithPaypal, sourceKeyFor, voidPaypalHold } from "../src/adapters/paypal.ts";
import { captureHeld, chargeSaved, chargingReady, holdSaved, releaseHeld } from "../src/adapters/charging.ts";
import { collectSubscriptionCharges, renewDueSubscriptions } from "../src/billing.ts";
import { autoRenewalTermsFor, startSubscription } from "@safehubby/core";
import { SEED } from "../src/seed.ts";
import type { Db, StoreLike } from "../src/store.ts";

const ENV = { ...process.env };
type Call = { url: string; method: string; headers: Record<string, string>; body: any };
const calls: Call[] = [];
function stubPaypal(reply: (call: Call) => { ok?: boolean; status?: number; body: unknown }) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url: String(url), method: String(init?.method), headers: init?.headers as Record<string, string>,
      body: init?.body && String(init.body).startsWith("{") ? JSON.parse(String(init.body)) : String(init?.body ?? ""),
    };
    if (call.url.endsWith("/v1/oauth2/token")) return { ok: true, status: 200, json: async () => ({ access_token: "tok" }) } as Response;
    calls.push(call);
    const r = reply(call);
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body } as Response;
  }));
}
const withPaypal = () => {
  process.env.PAYPAL_CLIENT_ID = "id"; process.env.PAYPAL_CLIENT_SECRET = "secret";
  process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
  delete process.env.STRIPE_SECRET_KEY;
};
const account = { brand: "PayPal", last4: "" };
const authorized = { status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", status: "CREATED" }] } }] };
const captured = { status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] };

describe("charging a saved PayPal account", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });

  it("is ready with PayPal's keys alone, no Stripe needed", () => {
    delete process.env.PAYPAL_CLIENT_ID; delete process.env.STRIPE_SECRET_KEY;
    expect(chargingReady()).toBe(false);
    withPaypal();
    expect(chargingReady()).toBe(true);
  });

  it("knows what kind of source a saved method is", () => {
    expect(sourceKeyFor({ brand: "PayPal", last4: "" })).toBe("paypal");
    expect(sourceKeyFor({ brand: "Venmo", last4: "" })).toBe("venmo");
    expect(sourceKeyFor({ brand: "Visa", last4: "4242" })).toBe("card");
  });

  it("reserves the exact amount without taking it, as a merchant-initiated order keyed by the hold", async () => {
    withPaypal();
    stubPaypal(() => ({ body: authorized }));
    const r = await authorizeWithPaypal({ paymentTokenId: "TOKEN1", method: account, amountCents: 18750, description: "Wait with someone", idempotencyKey: "hold_1" });
    expect(r).toEqual({ id: "paypal:AUTH1" });
    expect(calls[0]!.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(calls[0]!.headers["paypal-request-id"]).toBe("hold_1");
    expect(calls[0]!.body).toMatchObject({
      intent: "AUTHORIZE",
      purchase_units: [{ amount: { currency_code: "USD", value: "187.50" } }],
      payment_source: { paypal: { vault_id: "TOKEN1", stored_credential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT" } } },
    });
  });

  it("refuses a payment PayPal wants the customer to approve, rather than pretending it went through", async () => {
    withPaypal();
    stubPaypal(() => ({ body: { status: "PAYER_ACTION_REQUIRED" } }));
    await expect(authorizeWithPaypal({ paymentTokenId: "T", method: account, amountCents: 100, description: "x", idempotencyKey: "k" }))
      .rejects.toThrow(/approve this payment yourself/);
  });

  it("passes on PayPal's own reason when it declines", async () => {
    withPaypal();
    stubPaypal(() => ({ ok: false, status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED", description: "The instrument presented was declined." }] } }));
    await expect(chargeWithPaypal({ paymentTokenId: "T", method: account, amountCents: 100, description: "x", idempotencyKey: "k" }))
      .rejects.toThrow("The instrument presented was declined.");
  });

  it("takes only what was spent and releases the rest, then voids a hold nothing was spent from", async () => {
    withPaypal();
    stubPaypal(() => ({ body: { status: "COMPLETED" } }));
    await capturePaypalHold("paypal:AUTH1", 9640);
    expect(calls[0]!.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/authorizations/AUTH1/capture");
    expect(calls[0]!.body).toEqual({ amount: { currency_code: "USD", value: "96.40" }, final_capture: true });

    await capturePaypalHold("paypal:AUTH1", 0);
    expect(calls[1]!.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/authorizations/AUTH1/void");
    await voidPaypalHold("paypal:AUTH2");
    expect(calls[2]!.url).toMatch(/AUTH2\/void$/);
  });

  it("charges a plan in one step with a capture order keyed by the charge", async () => {
    withPaypal();
    stubPaypal(() => ({ body: captured }));
    expect(await chargeWithPaypal({ paymentTokenId: "T", method: account, amountCents: 9999, description: "Premium Plus monthly", idempotencyKey: "ch_1" }))
      .toEqual({ id: "CAP1" });
    expect(calls[0]!.body.intent).toBe("CAPTURE");
    expect(calls[0]!.body.purchase_units[0].amount.value).toBe("99.99");
    expect(calls[0]!.headers["paypal-request-id"]).toBe("ch_1");
  });

  it("sends a hold's capture and release to whichever processor made it", async () => {
    withPaypal();
    stubPaypal(() => ({ body: { status: "COMPLETED" } }));
    await captureHeld("paypal:AUTH9", 500);
    await releaseHeld("paypal:AUTH9");
    expect(calls.map((c) => c.url.split("/").slice(-1)[0])).toEqual(["capture", "void"]);
    expect(calls.every((c) => c.url.startsWith("https://api-m.sandbox.paypal.com"))).toBe(true);
  });

  it("routes by processor: PayPal to PayPal", async () => {
    withPaypal();
    stubPaypal(() => ({ body: authorized }));
    expect(await holdSaved({ processor: "paypal", paymentMethodId: "T", method: account, amountCents: 100, description: "x", idempotencyKey: "h" }))
      .toEqual({ id: "paypal:AUTH1" });
    stubPaypal(() => ({ body: captured }));
    expect(await chargeSaved({ processor: "paypal", paymentMethodId: "T", method: account, amountCents: 100, description: "x", idempotencyKey: "c" }))
      .toEqual({ id: "CAP1" });
  });
});

describe("plan billing for a customer who saved PayPal", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });
  const now = new Date("2027-01-01T00:00:00Z");

  it("charges the PayPal account for the renewal, with no Stripe customer involved", async () => {
    withPaypal();
    const db: Db = structuredClone(SEED);
    db.travelers.push({ id: "t1", email: "t1@example.com", passwordHash: "x", displayName: "t1", planId: "premium-plus", homeLabel: "Home", emergencyContacts: [] });
    db.subscriptions.t1 = startSubscription({
      travelerId: "t1", planId: "premium-plus", cadence: "monthly", platform: "web", now,
      renewalConsent: { planId: "premium-plus", cadence: "monthly", priceCents: autoRenewalTermsFor("premium-plus", "monthly", now).priceCents, acceptedAt: now.toISOString() },
    }).subscription;
    db.paymentMethods.t1 = { id: "pm", processor: "paypal", processorToken: "VAULT1", brand: "PayPal", last4: "", accountLabel: "a***@x.co", addedAt: now.toISOString() };
    const store: StoreLike = { data: db, update: (fn) => fn(db), reset: () => {}, save: () => {} };
    let ids: string[] = [];
    store.update((d) => { ids = renewDueSubscriptions(d, new Date(now.getTime() + 20 * 86_400_000), { collect: true }).toCollect; });

    stubPaypal(() => ({ body: captured }));
    expect(await collectSubscriptionCharges(store, new Date(now.getTime() + 20 * 86_400_000), ids, chargeSaved)).toEqual({ paid: 1, failed: 0 });
    expect(db.charges[0]).toMatchObject({ status: "settled", reference: "CAP1" });
    expect(calls[0]!.body.payment_source.paypal.vault_id).toBe("VAULT1");
  });
});
