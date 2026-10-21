import { afterEach, describe, expect, it, vi } from "vitest";
import { cardIssuer, cardViewFor, taskCards } from "../src/adapters/cards.ts";

const ENV = { ...process.env };
const calls: { url: string; method: string; headers: Record<string, string>; body: any }[] = [];
const stub = (reply: Record<string, unknown>) => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: String(init?.method), headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return { ok: true, status: 200, json: async () => reply } as Response;
  }));
};
const useLithic = () => { process.env.CARD_ISSUER = "lithic"; process.env.LITHIC_API_KEY = "lithic_key"; };

describe("task cards through Lithic", () => {
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ENV }; });

  it("is Stripe unless CARD_ISSUER says lithic", () => {
    delete process.env.CARD_ISSUER;
    expect(cardIssuer()).toBe("stripe");
    process.env.CARD_ISSUER = "lithic";
    expect(cardIssuer()).toBe("lithic");
  });

  it("is off until there is a key", () => {
    process.env.CARD_ISSUER = "lithic"; delete process.env.LITHIC_API_KEY;
    expect(taskCards.status.mode).not.toBe("automatic");
  });

  it("issues a virtual card capped at exactly the task's limit, in the sandbox unless told otherwise", async () => {
    useLithic();
    stub({ token: "card_1", last_four: "1234", exp_month: "09", exp_year: "2030" });
    expect(taskCards.status.mode).toBe("automatic");
    const card = await taskCards.issueCard({ capCents: 2500, currency: "USD", label: "Grab something", expiresAt: "2026-12-05T18:00:00Z" });
    expect(card).toMatchObject({ id: "card_1", last4: "1234", expMonth: 9, expYear: 2030 });
    expect(calls[0]!.url).toBe("https://sandbox.lithic.com/v1/cards");
    expect(calls[0]!.headers.authorization).toBe("lithic_key");
    expect(calls[0]!.body).toMatchObject({ type: "VIRTUAL", state: "OPEN", spend_limit: 2500, spend_limit_duration: "FOREVER" });
  });

  it("uses the live API only when LITHIC_ENV is production", async () => {
    useLithic(); process.env.LITHIC_ENV = "production";
    stub({ token: "card_1" });
    await taskCards.issueCard({ capCents: 100, currency: "USD", label: "x", expiresAt: "2026-12-05T18:00:00Z" });
    expect(calls[0]!.url).toBe("https://api.lithic.com/v1/cards");
  });

  it("closes the card for good when the task ends", async () => {
    useLithic();
    stub({});
    await taskCards.cancelCard("card_1");
    expect(calls[0]).toMatchObject({ url: "https://sandbox.lithic.com/v1/cards/card_1", method: "PATCH", body: { state: "CLOSED" } });
  });

  it("opens the card for the app's own https address only", async () => {
    useLithic();
    stub({ session: "sess_1" });
    delete process.env.SAFEHUBBY_PUBLIC_URL;
    await expect(cardViewFor("card_1", "")).rejects.toThrow(/SAFEHUBBY_PUBLIC_URL/);

    process.env.SAFEHUBBY_PUBLIC_URL = "https://safehubby.com/app";
    expect(await cardViewFor("card_1", "")).toEqual({ provider: "lithic", embedSession: "sess_1", environment: "sandbox" });
    expect(calls[0]).toMatchObject({ url: "https://sandbox.lithic.com/v1/cards/card_1/embed", body: { type: "CARD_EMBED", target_origin: "https://safehubby.com" } });
  });

  it("still asks Stripe for its nonce first when Stripe is the issuer", async () => {
    delete process.env.CARD_ISSUER;
    expect(await cardViewFor("ic_1", "")).toBeNull();
  });
});
