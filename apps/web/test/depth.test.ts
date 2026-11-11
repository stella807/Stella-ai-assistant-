import { describe, expect, it } from "vitest";
import { depthProgress } from "../src/app/depth.ts";

describe("depthProgress", () => {
  it("is 0 when the element is centred on the screen", () => {
    expect(depthProgress(400, 200, 1000)).toBe(0);
  });
  it("is 1 when it has just come in from below, -1 when it is gone off the top", () => {
    expect(depthProgress(1000, 200, 1000)).toBe(1);
    expect(depthProgress(-200, 200, 1000)).toBe(-1);
  });
  it("never goes past 1 either way", () => {
    expect(depthProgress(5000, 200, 1000)).toBe(1);
    expect(depthProgress(-5000, 200, 1000)).toBe(-1);
  });
});
