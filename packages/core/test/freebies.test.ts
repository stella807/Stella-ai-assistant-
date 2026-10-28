import { afterEach, describe, expect, it } from "vitest";
import {
  currentMonthlyFreebies, defaultMonthlyFreebies, errandCreditFor, includedGrabAllowanceFor, sanitizeMonthlyFreebies,
  setMonthlyFreebies, MAX_ERRAND_CREDIT_CENTS, MAX_FREE_PICKUPS_PER_MONTH,
} from "../src/index.ts";

afterEach(() => setMonthlyFreebies(null));

describe("the owner's monthly freebies", () => {
  it("is the built-in numbers until the owner sets something", () => {
    expect(currentMonthlyFreebies()).toEqual(defaultMonthlyFreebies());
    expect(includedGrabAllowanceFor("premium-plus")).toBe(4);
    expect(errandCreditFor("basic")).toBe(3_500);
  });

  it("switches every freebie off at once and back on again", () => {
    setMonthlyFreebies({ ...defaultMonthlyFreebies(), enabled: false });
    expect(includedGrabAllowanceFor("family")).toBe(0);
    expect(includedGrabAllowanceFor("elite")).toBe(0);
    expect(errandCreditFor("basic")).toBe(0);
    setMonthlyFreebies({ ...defaultMonthlyFreebies(), enabled: true });
    expect(includedGrabAllowanceFor("family")).toBe(15);
    expect(errandCreditFor("basic")).toBe(3_500);
  });

  it("adjusts how many pickups a plan gets and the size of Basic's credit", () => {
    setMonthlyFreebies({ enabled: true, pickupsPerMonth: { family: 6, "premium-plus": 0 }, basicCreditCents: 2_000 });
    expect(includedGrabAllowanceFor("family")).toBe(6);
    expect(includedGrabAllowanceFor("premium-plus")).toBe(0);
    expect(includedGrabAllowanceFor("premium-basic")).toBe(2);
    expect(errandCreditFor("basic")).toBe(2_000);
  });

  it("keeps Elite unlimited whatever is set, and never lets a typo through", () => {
    setMonthlyFreebies({ enabled: true, pickupsPerMonth: { family: 9999, free: -4 }, basicCreditCents: 999_999 });
    expect(includedGrabAllowanceFor("elite")).toBeNull();
    expect(includedGrabAllowanceFor("family")).toBe(MAX_FREE_PICKUPS_PER_MONTH);
    expect(includedGrabAllowanceFor("free")).toBe(0);
    expect(errandCreditFor("basic")).toBe(MAX_ERRAND_CREDIT_CENTS);
    expect(sanitizeMonthlyFreebies("junk").pickupsPerMonth.family).toBe(15);
    expect(sanitizeMonthlyFreebies({ pickupsPerMonth: { family: "x" } }).pickupsPerMonth.family).toBe(15);
  });

  it("does not turn a missing 'enabled' into off, but only a literal true into on", () => {
    expect(sanitizeMonthlyFreebies({}).enabled).toBe(true);
    expect(sanitizeMonthlyFreebies({ enabled: "no" }).enabled).toBe(false);
  });
});
