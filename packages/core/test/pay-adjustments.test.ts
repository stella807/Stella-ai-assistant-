import { afterEach, describe, expect, it } from "vitest";
import {
  assistantPayoutFor, serviceFeeFor, errandPayoutCents, payDeltasFrom, setPayDeltas, PA_HOURLY_RATE_CENTS, type PriceOverride,
} from "../src/index.ts";

const raise = (role: string, priceCents: number): PriceOverride =>
  ({ id: "o", roleOrService: `job-${role}`, priceCents, changedBy: "a", changedAt: "2026-01-01T00:00:00Z" }) as PriceOverride;

describe("owner-set job pay reaches the money", () => {
  afterEach(() => setPayDeltas(null));

  it("pays an assistant the new hourly rate and moves the customer price with it", () => {
    const margin = () => serviceFeeFor("wait-with-someone", false, 1, 2) - assistantPayoutFor("wait-with-someone", false, 1, 2);
    const before = margin();
    setPayDeltas(payDeltasFrom([raise("personal-assistant", PA_HOURLY_RATE_CENTS + 500)]));
    expect(assistantPayoutFor("wait-with-someone", false, 1, 2)).toBe((PA_HOURLY_RATE_CENTS + 500) * 2);
    expect(margin()).toBe(before);
  });

  it("raises every errand by the same amount, and never below a dollar", () => {
    const base = errandPayoutCents("nearby-store");
    setPayDeltas(payDeltasFrom([raise("errand-runner", 100)]));
    expect(errandPayoutCents("nearby-store")).toBeGreaterThanOrEqual(100);
    setPayDeltas({ errand: 200 });
    expect(errandPayoutCents("nearby-store")).toBe(base + 200);
  });
});

describe("the bodyguard's armed pay", () => {
  afterEach(() => setPayDeltas(null));
  it("follows the owner's setting, with the customer price moving by the same amount", () => {
    const margin = () => serviceFeeFor("wait-with-someone", false, 1, 2, false, true) - assistantPayoutFor("wait-with-someone", false, 1, 2, false, true);
    const before = margin();
    setPayDeltas(payDeltasFrom([raise("bodyguard", 6500)]));
    expect(assistantPayoutFor("wait-with-someone", false, 1, 2, false, true)).toBe(6500 * 2);
    expect(margin()).toBe(before);
  });
});
