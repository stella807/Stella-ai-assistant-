import { describe, expect, it } from "vitest";
import { spotlightOffset, tiltFor } from "../src/app/spotlight.ts";

describe("spotlightOffset", () => {
  it("places the light relative to the card's own corner", () => {
    expect(spotlightOffset({ left: 40, top: 100 }, 140, 160)).toEqual({ x: 100, y: 60 });
  });
  it("keeps working when the card has scrolled above the screen", () => {
    expect(spotlightOffset({ left: 0, top: -50 }, 10, 20)).toEqual({ x: 10, y: 70 });
  });
});

describe("tiltFor", () => {
  it("is level in the middle and leans toward the pointer at the edges", () => {
    expect(tiltFor(0.5, 0.5, 4)).toEqual({ rx: 0, ry: 0 });
    expect(tiltFor(1, 0.5, 4).ry).toBe(4);
    expect(tiltFor(0, 0.5, 4).ry).toBe(-4);
    expect(tiltFor(0.5, 0, 4).rx).toBe(4);
  });
  it("never leans further than the limit", () => {
    expect(tiltFor(9, -9, 4)).toEqual({ rx: 4, ry: 4 });
  });
});
