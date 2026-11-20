import { describe, expect, it } from "vitest";
import { alertDecision, alertMessage } from "../src/owner-alerts.ts";

const at = (iso: string) => new Date(iso);

describe("when the owner is told about a request", () => {
  it("tells the owner the first time, not again for the same request within six hours", () => {
    const sent = [{ key: "request:pharmacy near auxilio mutuo", at: "2026-11-20T10:00:00Z" }];
    expect(alertDecision(sent, "request:pharmacy near auxilio mutuo", at("2026-11-20T12:00:00Z"))).toBe(false);
    expect(alertDecision(sent, "request:pharmacy near auxilio mutuo", at("2026-11-20T16:30:00Z"))).toBe(true);
    expect(alertDecision(sent, "request:farmacia en ponce", at("2026-11-20T12:00:00Z"))).toBe(true);
  });

  it("sends at most twenty a day, so nobody can flood the owner's phone", () => {
    const sent = Array.from({ length: 20 }, (_, i) => ({ key: `request:${i}`, at: "2026-11-20T10:00:00Z" }));
    expect(alertDecision(sent, "request:new", at("2026-11-20T11:00:00Z"))).toBe(false);
    expect(alertDecision(sent, "request:new", at("2026-11-21T11:00:00Z"))).toBe(true);
  });

  it("always tells the owner about money, even past the daily cap", () => {
    const sent = Array.from({ length: 25 }, (_, i) => ({ key: `request:${i}`, at: "2026-11-20T10:00:00Z" }));
    expect(alertDecision(sent, "sale:abc", at("2026-11-20T11:00:00Z"))).toBe(true);
  });
});

describe("what the owner is told", () => {
  it("says what was asked and what to do, in a text short enough for a phone", () => {
    const m = alertMessage({ kind: "request", product: "Checked today", words: "farmacia en bayamon insulina", answered: false });
    expect(m.subject).toMatch(/request/i);
    expect(m.body).toContain("farmacia en bayamon insulina");
    expect(m.body).toMatch(/Checked today/);
    expect(m.text.length).toBeLessThanOrEqual(160);
  });
  it("tells about a sale with the product and the amount", () => {
    const m = alertMessage({ kind: "sale", product: "Live answers", amount: "$0.25", words: "SJU delays" });
    expect(m.text).toMatch(/Sale.*Live answers.*\$0\.25/);
  });
});
