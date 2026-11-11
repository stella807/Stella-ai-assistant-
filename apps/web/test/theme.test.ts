import { describe, expect, it } from "vitest";
import { parseTheme } from "../src/app/theme.ts";

describe("parseTheme", () => {
  it("is dark unless light was chosen", () => {
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("")).toBe("dark");
    expect(parseTheme("blue")).toBe("dark");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });
});
