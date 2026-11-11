import { describe, expect, it } from "vitest";
import { makeParticles, particleCount } from "../src/app/particles.ts";

describe("makeParticles", () => {
  it("makes four numbers per particle, all inside 0..1", () => {
    let n = 0;
    const out = makeParticles(50, () => ((n += 0.137) % 1));
    expect(out.length).toBe(200);
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe("particleCount", () => {
  it("uses fewer on a small screen and never zero", () => {
    expect(particleCount(390, 844)).toBeLessThan(particleCount(1440, 900));
    expect(particleCount(1, 1)).toBeGreaterThan(0);
  });
});
