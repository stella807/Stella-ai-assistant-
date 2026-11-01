import { describe, expect, it } from "vitest";
import { dollarsToCents } from "../src/app/price-input.ts";

describe("dollarsToCents", () => {
  it("reads what a person types as dollars, since that is what the rate card shows", () => {
    expect(dollarsToCents("12")).toBe(1200);
    expect(dollarsToCents("12.50")).toBe(1250);
    expect(dollarsToCents("12.5")).toBe(1250);
    expect(dollarsToCents("0.10")).toBe(10);
    expect(dollarsToCents(".99")).toBe(99);
  });
  it("accepts a dollar sign, commas and stray spaces", () => {
    expect(dollarsToCents(" $1,200 ")).toBe(120000);
    expect(dollarsToCents("$35.00")).toBe(3500);
  });
  it("never produces a fractional cent from float math", () => {
    // 1.15 * 100 is 114.99999999999999 in floating point.
    expect(dollarsToCents("1.15")).toBe(115);
    expect(dollarsToCents("19.99")).toBe(1999);
  });
  it("rejects anything that is not a positive amount of at most two decimals", () => {
    for (const bad of ["", " ", "abc", "0", "0.00", "-5", "12.505", "1e3", "12.5.1", "$", "1,2,3x"]) {
      expect(dollarsToCents(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
