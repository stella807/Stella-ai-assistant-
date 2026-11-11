import { describe, expect, it } from "vitest";
import { stepFor, swipeIntent } from "../src/app/deck.ts";

describe("swipeIntent", () => {
  it("reads a clear sideways swipe: left is forward, right is back", () => {
    expect(swipeIntent(-80, 10)).toBe(1);
    expect(swipeIntent(90, -12)).toBe(-1);
  });
  it("ignores short drags and mostly-vertical ones, which are scrolling", () => {
    expect(swipeIntent(-30, 0)).toBe(0);
    expect(swipeIntent(-80, 120)).toBe(0);
  });
});

describe("stepFor", () => {
  it("moves within the slides and stops at the ends", () => {
    expect(stepFor(0, 1, 4)).toBe(1);
    expect(stepFor(3, 1, 4)).toBe(3);
    expect(stepFor(0, -1, 4)).toBe(0);
  });
  it("says which way the camera travels: forward for a later slide, back for an earlier one", () => {
    expect(stepFor(0, 3, 4)).toBe(3);
  });
});

import { warpCurve } from "../src/app/warp.ts";
describe("warpCurve", () => {
  it("starts and ends still, peaks early", () => {
    expect(warpCurve(0)).toBe(0);
    expect(warpCurve(1)).toBe(0);
    expect(warpCurve(0.25)).toBe(1);
    expect(warpCurve(0.1)).toBeGreaterThan(warpCurve(0.8));
  });
});
