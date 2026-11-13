import { describe, expect, it } from "vitest";
import { isLightMotion } from "../src/app/motion.ts";

describe("light motion on phones", () => {
  it("is on for a phone-sized screen, whatever the pointer", () => {
    expect(isLightMotion(390, true)).toBe(true);
    expect(isLightMotion(700, false)).toBe(true);
  });

  it("is on for a touch tablet, off for a desktop", () => {
    expect(isLightMotion(900, true)).toBe(true);
    expect(isLightMotion(1440, false)).toBe(false);
    expect(isLightMotion(1440, true)).toBe(false);
  });
});
