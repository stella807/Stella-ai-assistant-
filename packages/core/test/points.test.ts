import { describe, expect, it } from "vitest";
import { POINT_RULES, REWARD_CATALOG, award, balance, redeem } from "../src/points.ts";

const T0 = new Date("2026-01-01T20:00:00Z");

describe("points", () => {
  it("rewards getting home safely far more than logging a drink", () => {
    expect(POINT_RULES.bookedRideInsteadOfDriving).toBeGreaterThan(POINT_RULES.logDrink * 10);
    expect(POINT_RULES.homeSafe).toBeGreaterThan(POINT_RULES.logDrink);
  });

  it("sums a balance and subtracts redemptions", () => {
    const entries = [award("1", "homeSafe", T0), award("2", "checkInOnTime", T0)];
    expect(balance(entries)).toBe(POINT_RULES.homeSafe + POINT_RULES.checkInOnTime);
    expect(balance(entries, [{ id: "r1", rewardId: "x", cost: 20, redeemedAt: T0.toISOString() }])).toBe(
      POINT_RULES.homeSafe + POINT_RULES.checkInOnTime - 20,
    );
  });

  it("refuses a redemption you cannot afford", () => {
    expect(() => redeem("rw-ride-5", [award("1", "logDrink", T0)], [], "r1", T0)).toThrow(/not enough/i);
  });

  it("refuses an unknown reward", () => {
    expect(() => redeem("nope", [], [], "r1", T0)).toThrow();
  });

  it("redeems when affordable", () => {
    const entries = Array.from({ length: 10 }, (_, i) => award(`${i}`, "bookedRideInsteadOfDriving", T0));
    const r = redeem("rw-ride-5", entries, [], "r1", T0);
    expect(r.cost).toBe(REWARD_CATALOG.find((x) => x.id === "rw-ride-5")!.cost);
  });
});
