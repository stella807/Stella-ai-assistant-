import { describe, expect, it } from "vitest";
import { isAdult, MINIMUM_AGE } from "../src/index.ts";

describe("the age check", () => {
  const now = new Date("2026-11-05T12:00:00Z");

  it("is 18", () => expect(MINIMUM_AGE).toBe(18));

  it("lets someone through on their eighteenth birthday, and not the day before", () => {
    expect(isAdult("2008-11-05", now)).toBe(true);
    expect(isAdult("2008-11-06", now)).toBe(false);
    expect(isAdult("1990-01-01", now)).toBe(true);
  });

  it("refuses dates that are not real, are in the future, or are the wrong shape", () => {
    for (const bad of ["", "tomorrow", "2008-13-01", "2007-02-30", "2999-01-01", "11/05/2008", "2008-1-5"]) {
      expect(isAdult(bad, now), bad).toBe(false);
    }
  });

  it("handles a leap-day birthday", () => {
    expect(isAdult("2008-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(true);
    expect(isAdult("2008-02-29", new Date("2026-02-28T00:00:00Z"))).toBe(false);
  });
});
