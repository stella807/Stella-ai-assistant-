import { describe, expect, it } from "vitest";
import { cardFeeCents, partiallyRefundCharge, planOfCharge, planRefundFor, type Charge } from "../src/index.ts";

const desc = (name: string) => `${name} (monthly) — paid through Stripe`;

describe("what a plan charge gets back", () => {
  it("reads which plan a ledger line was for, longest name first", () => {
    expect(planOfCharge(desc("Premium Plus"))).toBe("premium-plus");
    expect(planOfCharge(desc("Premium"))).toBe("premium-basic");
    expect(planOfCharge(desc("Elite Signature"))).toBe("elite-signature");
    expect(planOfCharge("Wingman Club renewal — paid through Stripe")).toBe("wingman-club");
    expect(planOfCharge("A ride home")).toBeNull();
  });

  it("refunds Elite and the Wingman Club in full", () => {
    expect(planRefundFor({ description: desc("Elite"), amountCents: 155_500 })).toMatchObject({ tier: "full", refundCents: 155_500 });
    expect(planRefundFor({ description: desc("Elite Private"), amountCents: 6_217_500 })).toMatchObject({ tier: "full", refundCents: 6_217_500 });
    expect(planRefundFor({ description: "Wingman Club (monthly) — paid through Stripe", amountCents: 9_900 })).toMatchObject({ tier: "full", refundCents: 9_900 });
  });

  it("refunds only the card fee on Premium, Premium Plus and Family, never the plan charge", () => {
    for (const [name, cents] of [["Premium", 9_399], ["Premium Plus", 18_798], ["Family", 44_900]] as const) {
      const r = planRefundFor({ description: desc(name), amountCents: cents });
      expect(r.tier, name).toBe("fees");
      expect(r.refundCents, name).toBe(cardFeeCents(cents));
      expect(r.refundCents, name).toBeLessThan(cents);
    }
  });

  it("gives nothing back on other plans, and never more than what is left", () => {
    expect(planRefundFor({ description: desc("Basic"), amountCents: 3_900 })).toMatchObject({ tier: "none", refundCents: 0 });
    expect(planRefundFor({ description: desc("Elite"), amountCents: 155_500, refundedCents: 155_000 }).refundCents).toBe(500);
    // The card fee is only refunded once; part of it already back leaves the rest, and all of it back leaves nothing.
    expect(planRefundFor({ description: desc("Premium"), amountCents: 9_399, refundedCents: 100 }).refundCents).toBe(cardFeeCents(9_399) - 100);
    expect(planRefundFor({ description: desc("Premium"), amountCents: 9_399, refundedCents: cardFeeCents(9_399) }).refundCents).toBe(0);
  });
});

describe("recording a partial refund on the ledger", () => {
  const charge: Charge = {
    id: "c1", travelerId: "t1", kind: "subscription", rail: "card", description: "Premium", amountCents: 9_399,
    currency: "usd", status: "settled", createdAt: "2026-11-01T00:00:00Z",
  };
  const now = new Date("2026-11-05T00:00:00Z");

  it("keeps the line settled and records what went back", () => {
    const r = partiallyRefundCharge(charge, 377, now);
    expect(r.status).toBe("settled");
    expect(r.refundedCents).toBe(377);
  });

  it("marks the line refunded once all of it is back, and refuses to go past the charge", () => {
    expect(partiallyRefundCharge(charge, 9_399, now).status).toBe("refunded");
    expect(() => partiallyRefundCharge(charge, 9_400, now)).toThrow();
    expect(() => partiallyRefundCharge(charge, 0, now)).toThrow();
    expect(() => partiallyRefundCharge({ ...charge, status: "pending" }, 100, now)).toThrow();
  });
});
