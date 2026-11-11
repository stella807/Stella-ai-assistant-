import { describe, expect, it } from "vitest";
import { scrambleFrame } from "../src/app/scramble.ts";

describe("scrambleFrame", () => {
  const rand = () => 0.5;
  it("is all noise at the start and the real text at the end", () => {
    expect(scrambleFrame("SAFE HOME", 0, rand)).not.toContain("S");
    expect(scrambleFrame("SAFE HOME", 1, rand)).toBe("SAFE HOME");
  });
  it("keeps spaces and the length the same, so nothing jumps", () => {
    const f = scrambleFrame("A B C", 0.3, rand);
    expect(f.length).toBe(5);
    expect(f[1]).toBe(" ");
    expect(f[3]).toBe(" ");
  });
  it("settles from the left: the early letters are right before the late ones", () => {
    const f = scrambleFrame("ABCDEFGH", 0.5, rand);
    expect(f.slice(0, 3)).toBe("ABC");
    expect(f.slice(5)).not.toBe("FGH");
  });
});
