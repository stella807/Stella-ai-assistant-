import { describe, expect, it } from "vitest";
import {
  canStepDown, canStepUp, clampAmount, presetAmounts, stepAmount, type AmountScale,
} from "../src/amount-steps.ts";
import { CONCIERGE_MAX_CAP_CENTS, CONCIERGE_MIN_CAP_CENTS, QUICK_TASK_MAX_CAP_CENTS } from "../src/concierge.ts";

const errand: AmountScale = {
  minCents: CONCIERGE_MIN_CAP_CENTS, maxCents: CONCIERGE_MAX_CAP_CENTS, stepCents: 500,
};
const quick: AmountScale = {
  minCents: CONCIERGE_MIN_CAP_CENTS, maxCents: QUICK_TASK_MAX_CAP_CENTS, stepCents: 500,
};

describe("clamping to a valid amount", () => {
  it("keeps an amount already on the grid", () => {
    expect(clampAmount(2500, errand)).toBe(2500);
  });

  it("snaps an off-grid amount to the nearest step", () => {
    expect(clampAmount(2600, errand)).toBe(2500);
    expect(clampAmount(2800, errand)).toBe(3000);
  });

  it("holds at the ends instead of leaving the scale", () => {
    expect(clampAmount(0, errand)).toBe(CONCIERGE_MIN_CAP_CENTS);
    expect(clampAmount(-5000, errand)).toBe(CONCIERGE_MIN_CAP_CENTS);
    expect(clampAmount(999_999, errand)).toBe(CONCIERGE_MAX_CAP_CENTS);
  });

  it("survives a value that is not a number at all", () => {
    expect(clampAmount(Number.NaN, errand)).toBe(CONCIERGE_MIN_CAP_CENTS);
  });

  it("never snaps past the ceiling, even on a scale whose max is off-grid", () => {
    const odd: AmountScale = { minCents: 1000, maxCents: 4400, stepCents: 500 };
    // 4300 would round up to 4500, which the server would reject.
    expect(clampAmount(4300, odd)).toBe(4400);
  });
});

describe("stepping", () => {
  it("moves one step at a time", () => {
    expect(stepAmount(2500, 1, errand)).toBe(3000);
    expect(stepAmount(2500, -1, errand)).toBe(2000);
  });

  it("stops at the ends rather than running past them", () => {
    expect(stepAmount(CONCIERGE_MIN_CAP_CENTS, -1, errand)).toBe(CONCIERGE_MIN_CAP_CENTS);
    expect(stepAmount(CONCIERGE_MAX_CAP_CENTS, 1, errand)).toBe(CONCIERGE_MAX_CAP_CENTS);
  });

  it("lands exactly on the ceiling from just below it", () => {
    const odd: AmountScale = { minCents: 1000, maxCents: 4400, stepCents: 500 };
    expect(stepAmount(4000, 1, odd)).toBe(4400);
  });

  it("pulls an out-of-range starting value back onto the scale", () => {
    // Switching into quick-task mode leaves the old $600 cap in state; the
    // first press must not act on an amount that is no longer bookable.
    expect(stepAmount(CONCIERGE_MAX_CAP_CENTS, -1, quick)).toBe(QUICK_TASK_MAX_CAP_CENTS - 500);
  });

  it("reports which buttons are still live", () => {
    expect(canStepDown(CONCIERGE_MIN_CAP_CENTS, errand)).toBe(false);
    expect(canStepUp(CONCIERGE_MIN_CAP_CENTS, errand)).toBe(true);
    expect(canStepUp(CONCIERGE_MAX_CAP_CENTS, errand)).toBe(false);
    expect(canStepDown(CONCIERGE_MAX_CAP_CENTS, errand)).toBe(true);
  });
});

describe("presets", () => {
  const candidates = [2000, 5000, 10000, 25000, 60000];

  it("offers them in order", () => {
    expect(presetAmounts(candidates, errand)).toEqual([2000, 5000, 10000, 25000, 60000]);
  });

  it("collapses the ones a narrower scale cannot reach onto its ceiling", () => {
    // Quick tasks cap at $50, so $100/$250/$600 all become $50 — one button,
    // not three identical ones and not a silently shorter row.
    expect(presetAmounts(candidates, quick)).toEqual([2000, 5000]);
  });

  it("only ever offers amounts the booking rules accept", () => {
    for (const scale of [errand, quick]) {
      for (const preset of presetAmounts(candidates, scale)) {
        expect(preset).toBeGreaterThanOrEqual(scale.minCents);
        expect(preset).toBeLessThanOrEqual(scale.maxCents);
      }
    }
  });
});
