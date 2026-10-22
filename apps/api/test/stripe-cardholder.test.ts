import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureStripeCardholder, stripeIssuingReady } from "../src/adapters/stripe-cards.ts";

const ENV = { ...process.env };
const posted: { url: string; body: URLSearchParams }[] = [];
function stub(routes: { cardholders: unknown[]; account: unknown }) {
  posted.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "POST") {
      posted.push({ url: u, body: new URLSearchParams(String(init.body ?? "")) });
      return { ok: true, status: 200, json: async () => ({ id: "ich_new" }) } as Response;
    }
    const body = u.includes("/v1/issuing/cardholders") ? { data: routes.cardholders } : routes.account;
    return { ok: true, status: 200, json: async () => body } as Response;
  }));
}
const address = { line1: "1 Calle Sol", city: "San Juan", postal_code: "00901", state: "PR", country: "US" };

// One module instance per file, and the found id is cached, so the order here matters.
describe("setting up the Stripe Issuing cardholder without the Dashboard", () => {
  beforeEach(() => { process.env.STRIPE_SECRET_KEY = "sk_test_x"; delete process.env.STRIPE_ISSUING_CARDHOLDER; });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });

  it("says why when the account has no business address, and stays off", async () => {
    stub({ cardholders: [], account: { business_profile: { name: "Safehubby" } } });
    expect(await ensureStripeCardholder()).toMatchObject({ error: expect.stringMatching(/business address/i) });
    expect(posted).toHaveLength(0);
    expect(stripeIssuingReady()).toBe(false);
  });

  it("creates the company cardholder from the account's own name and address", async () => {
    stub({ cardholders: [], account: { business_profile: { name: "Safehubby.com", support_email: "contact@safehubby.com" }, company: { address } } });
    expect(await ensureStripeCardholder()).toEqual({ id: "ich_new", created: true });
    const b = posted[0]!.body;
    expect([b.get("type"), b.get("name"), b.get("billing[address][city]"), b.get("billing[address][state]"), b.get("metadata[safehubby]")])
      .toEqual(["company", "Safehubby.com", "San Juan", "PR", "company"]);
    expect(stripeIssuingReady()).toBe(true);
  });

  it("finds the one it made before instead of making another", async () => {
    stub({ cardholders: [{ id: "ich_old", metadata: { safehubby: "company" } }], account: {} });
    expect(await ensureStripeCardholder()).toEqual({ id: "ich_old", created: false });
    expect(posted).toHaveLength(0);
  });

  it("uses STRIPE_ISSUING_CARDHOLDER as is when it is set", async () => {
    process.env.STRIPE_ISSUING_CARDHOLDER = "ich_manual";
    stub({ cardholders: [], account: {} });
    expect(await ensureStripeCardholder()).toEqual({ id: "ich_manual", created: false });
  });
});
