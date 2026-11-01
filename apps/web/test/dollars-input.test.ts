import { describe, expect, it } from "vitest";
import { MAX_RATE_CENTS, dollarsToCents } from "../src/app/dollars-input.ts";

describe("typing a rate in dollars", () => {
  it("turns dollars into whole cents, however they are written", () => {
    expect(dollarsToCents("35")).toBe(3500);
    expect(dollarsToCents("12.5")).toBe(1250);
    expect(dollarsToCents("12.50")).toBe(1250);
    expect(dollarsToCents("12,50")).toBe(1250);
    expect(dollarsToCents("$12.50")).toBe(1250);
    expect(dollarsToCents("  0.10 ")).toBe(10);
  });

  it("rejects what is not an amount rather than guessing", () => {
    for (const bad of ["", "abc", "-5", "0", "0.00", "12.505", "1e3", "12.5.1", "$", "1 000"]) expect(dollarsToCents(bad), bad).toBeNull();
  });

  it("stops at the largest rate the server takes", () => {
    expect(dollarsToCents("100000")).toBe(MAX_RATE_CENTS);
    expect(dollarsToCents("100000.01")).toBeNull();
  });
});
