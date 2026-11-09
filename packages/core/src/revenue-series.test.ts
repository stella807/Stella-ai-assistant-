import { describe, expect, it } from "vitest";
import { revenueByDay } from "./revenue-series.ts";
import type { Charge } from "./wallet.ts";

const charge = (over: Partial<Charge>): Charge => ({
  id: "c", travelerId: "t", kind: "plan", rail: "stripe", description: "", amountCents: 1000, currency: "usd",
  status: "settled", createdAt: "2026-11-08T10:00:00.000Z", ...over,
} as Charge);

describe("revenueByDay", () => {
  const now = new Date("2026-11-09T12:00:00Z");

  it("zero-fills every day and ends today", () => {
    const s = revenueByDay([], now, 7);
    expect(s).toHaveLength(7);
    expect(s[6]!.day).toBe("2026-11-09");
    expect(s[0]!.day).toBe("2026-11-03");
    expect(s.every((d) => d.cents === 0)).toBe(true);
  });

  it("sums settled charges by day and ignores the rest", () => {
    const s = revenueByDay([
      charge({ amountCents: 500 }),
      charge({ amountCents: 700, settledAt: "2026-11-08T23:00:00.000Z" }),
      charge({ amountCents: 900, status: "pending" }),
      charge({ amountCents: 300, createdAt: "2026-09-01T00:00:00.000Z" }),
    ], now, 7);
    expect(s.find((d) => d.day === "2026-11-08")!.cents).toBe(1200);
    expect(s.reduce((n, d) => n + d.cents, 0)).toBe(1200);
  });
});
