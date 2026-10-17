import { afterEach, describe, expect, it, vi } from "vitest";
import { taskCards } from "../src/adapters/cards.ts";

const ENV = { ...process.env };
const calls: { url: string; body: URLSearchParams }[] = [];
const stub = () => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
    return { ok: true, status: 200, json: async () => ({ id: "ic_1", last4: "4242", brand: "Visa", exp_month: 12, exp_year: 2029 }) } as Response;
  }));
};

describe("task cards through Stripe Issuing", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });

  it("issues a virtual card capped at exactly the task's limit, under the company cardholder", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_ISSUING_CARDHOLDER = "ich_1";
    stub();
    expect(taskCards.status.mode).toBe("automatic");
    const card = await taskCards.issueCard({ capCents: 2500, currency: "USD", label: "Grab something", expiresAt: "2026-12-05T18:00:00Z" });
    expect(card).toMatchObject({ id: "ic_1", last4: "4242", expMonth: 12, expYear: 2029, revealUrl: null });
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/issuing/cards");
    const b = calls[0]!.body;
    expect(b.get("cardholder")).toBe("ich_1");
    expect(b.get("type")).toBe("virtual");
    expect(b.get("spending_controls[spending_limits][0][amount]")).toBe("2500");
    expect(b.get("spending_controls[spending_limits][0][interval]")).toBe("all_time");
  });

  it("cancels the card when the task ends", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_ISSUING_CARDHOLDER = "ich_1";
    stub();
    await taskCards.cancelCard("ic_1");
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/issuing/cards/ic_1");
    expect(calls[0]!.body.get("status")).toBe("canceled");
  });

  it("says what is needed, and calls nobody, without a cardholder set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; delete process.env.STRIPE_ISSUING_CARDHOLDER;
    stub();
    expect(taskCards.status.mode).toBe("handoff");
    await expect(taskCards.issueCard({ capCents: 1, currency: "USD", label: "x", expiresAt: "x" })).rejects.toThrow(/not configured/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
