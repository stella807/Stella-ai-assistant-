import { describe, expect, it } from "vitest";
import { shouldPlayIntro } from "../src/app/intro.ts";

describe("shouldPlayIntro", () => {
  it("plays once a visit, on the home page in either language", () => {
    expect(shouldPlayIntro("/", false, false)).toBe(true);
    expect(shouldPlayIntro("/es", false, false)).toBe(true);
    expect(shouldPlayIntro("/es/", false, false)).toBe(true);
  });
  it("does not play again in the same visit, or for anyone asking for less motion", () => {
    expect(shouldPlayIntro("/", true, false)).toBe(false);
    expect(shouldPlayIntro("/", false, true)).toBe(false);
  });
  it("stays out of the way on every other page", () => {
    for (const path of ["/master", "/employee", "/careers", "/drive", "/es/trabajo", "/blog"]) {
      expect(shouldPlayIntro(path, false, false)).toBe(false);
    }
  });
});
