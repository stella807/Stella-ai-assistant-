import { describe, expect, it } from "vitest";
import { spotlightOffset } from "../src/app/spotlight.ts";

describe("spotlightOffset", () => {
  it("places the light relative to the card's own corner", () => {
    expect(spotlightOffset({ left: 40, top: 100 }, 140, 160)).toEqual({ x: 100, y: 60 });
  });
  it("keeps working when the card has scrolled above the screen", () => {
    expect(spotlightOffset({ left: 0, top: -50 }, 10, 20)).toEqual({ x: 10, y: 70 });
  });
});
