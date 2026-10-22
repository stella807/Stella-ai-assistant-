import { afterEach, describe, expect, it, vi } from "vitest";
import { cardIssuer, cardViewFor, taskCards } from "../src/adapters/cards.ts";
import { stripeTaskCards } from "../src/adapters/stripe-cards.ts";

const ENV = { ...process.env };
const calls: { url: string; body: URLSearchParams; headers: Record<string, string> }[] = [];
function stub(reply: (url: string) => unknown) {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")), headers: init?.headers as Record<string, string> });
    return { ok: true, status: 200, json: async () => reply(String(url)) } as Response;
  }));
}
const stripeOn = () => { process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_ISSUING_CARDHOLDER = "ich_1"; };

describe("task cards through Stripe Issuing", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });

  it("uses Stripe once Issuing is set up, Lithic otherwise, and honours CARD_ISSUER", () => {
    delete process.env.STRIPE_ISSUING_CARDHOLDER; delete process.env.CARD_ISSUER;
    expect(cardIssuer()).toBe("lithic");
    stripeOn();
    expect(cardIssuer()).toBe("stripe");
    process.env.CARD_ISSUER = "lithic";
    expect(cardIssuer()).toBe("lithic");
  });

  it("issues a virtual card capped at exactly the task's limit, once", async () => {
    stripeOn();
    stub(() => ({ id: "ic_1", last4: "4242", brand: "Visa", exp_month: 12, exp_year: 2029 }));
    const card = await taskCards.issueCard({ capCents: 5000, currency: "USD", label: "Grab something", expiresAt: "2026-10-23T00:00:00Z" } as never);
    expect(card).toMatchObject({ id: "ic_1", last4: "4242" });
    const b = calls[0]!.body;
    expect(calls[0]!.url).toMatch(/\/v1\/issuing\/cards$/);
    expect([b.get("type"), b.get("cardholder"), b.get("spending_controls[spending_limits][0][amount]"), b.get("spending_controls[spending_limits][0][interval]")])
      .toEqual(["virtual", "ich_1", "5000", "all_time"]);
  });

  it("cancels and shows a card through the issuer that made it, whichever is in use now", async () => {
    stripeOn();
    process.env.CARD_ISSUER = "lithic";
    stub(() => ({ secret: "ek_1" }));
    await taskCards.cancelCard("ic_9");
    expect(calls[0]!.url).toMatch(/\/v1\/issuing\/cards\/ic_9$/);
    expect(calls[0]!.body.get("status")).toBe("canceled");
    expect(await cardViewFor("ic_9")).toBeNull(); // first call: the browser needs a nonce
    expect(await cardViewFor("ic_9", "nonce_1")).toEqual({ provider: "stripe", ephemeralKeySecret: "ek_1" });
  });

  it("reports itself not set up without the cardholder", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; delete process.env.STRIPE_ISSUING_CARDHOLDER;
    expect(stripeTaskCards.status.mode).toBe("handoff");
  });
});
