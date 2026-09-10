import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDMARK_RATIO, MAX_WEIGHT_KG, MIN_WEIGHT_KG,
  validateBody, validateDrinkLimit,
} from "../src/body.ts";
import { estimateBac } from "../src/bac.ts";
import { logDrink } from "../src/drinks.ts";

describe("validateBody", () => {
  it("accepts an ordinary adult and defaults the ratio", () => {
    expect(validateBody({ weightKg: 82 })).toEqual({ weightKg: 82, widmarkRatio: DEFAULT_WIDMARK_RATIO });
  });

  it("refuses a weight that would make the estimate meaningless", () => {
    // 0.1kg produces a number that would frighten someone; 5000kg one that
    // would reassure them. Both are worse than refusing.
    expect(() => validateBody({ weightKg: 0.1 })).toThrow(/weight/i);
    expect(() => validateBody({ weightKg: 5000 })).toThrow(/weight/i);
    expect(() => validateBody({ weightKg: MIN_WEIGHT_KG - 1 })).toThrow();
    expect(() => validateBody({ weightKg: MAX_WEIGHT_KG + 1 })).toThrow();
  });

  it("refuses a non-number, including the ones that sneak past a null check", () => {
    for (const bad of ["banana", NaN, Infinity, null, undefined, {}]) {
      expect(() => validateBody({ weightKg: bad }), String(bad)).toThrow();
    }
  });

  it("refuses a body-water ratio outside anything human", () => {
    expect(() => validateBody({ weightKg: 82, widmarkRatio: 0.0001 })).toThrow(/ratio/i);
    expect(() => validateBody({ weightKg: 82, widmarkRatio: -1 })).toThrow(/ratio/i);
    expect(() => validateBody({ weightKg: 82, widmarkRatio: 50 })).toThrow(/ratio/i);
  });

  it("keeps a night readable — the bug this exists to prevent", () => {
    // A ratio of -1 was previously stored happily, and then estimateBac threw
    // on EVERY subsequent read of that night: a permanently 500-ing record
    // with no way to fix it through the API.
    expect(() => validateBody({ weightKg: 82, widmarkRatio: -1 })).toThrow();

    const body = validateBody({ weightKg: 82, widmarkRatio: 0.55 });
    const drinks = [logDrink({ id: "d1", drinkId: "beer-ipa", loggedAt: "2026-01-01T20:00:00Z" })];
    expect(() => estimateBac({ body, drinks, now: new Date("2026-01-01T21:00:00Z") })).not.toThrow();
  });
});

describe("validateDrinkLimit", () => {
  it("defaults when not given", () => {
    expect(validateDrinkLimit(undefined)).toBe(4);
    expect(validateDrinkLimit(null, 6)).toBe(6);
  });

  it("refuses a limit that makes the alert fire on every drink forever", () => {
    expect(() => validateDrinkLimit(0)).toThrow();
    expect(() => validateDrinkLimit(-3)).toThrow();
  });

  it("refuses a fractional or absurd limit", () => {
    expect(() => validateDrinkLimit(2.5)).toThrow();
    expect(() => validateDrinkLimit(9999)).toThrow();
  });
});
