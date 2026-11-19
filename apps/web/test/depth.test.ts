import { describe, expect, it } from "vitest";
import { DEPTH_OFF_QUERY, depthAllowed, depthProgress } from "../src/app/depth.ts";

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

describe("where the card tilt is used", () => {
  const media = (matching: string[]) => (q: string) => ({ matches: matching.some((m) => q.includes(m)) });
  it("is on for a computer with a mouse and a wide screen", () => {
    expect(depthAllowed(media([]))).toBe(true);
  });
  it("is off on phones and touch screens, where tilted cards blur their text, and when motion is reduced", () => {
    expect(DEPTH_OFF_QUERY).toMatch(/max-width: 720px/);
    expect(DEPTH_OFF_QUERY).toMatch(/hover: none/);
    expect(DEPTH_OFF_QUERY).toMatch(/prefers-reduced-motion: reduce/);
    expect(depthAllowed(media(["max-width: 720px"]))).toBe(false);
    expect(depthAllowed(media(["hover: none"]))).toBe(false);
    expect(depthAllowed(media(["prefers-reduced-motion"]))).toBe(false);
  });
  it("is on when the browser cannot say", () => {
    expect(depthAllowed(undefined)).toBe(true);
  });
});

describe("the stylesheet agrees with the script", () => {
  it("flattens the cards and unblurs their headings under the same conditions", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../src/styles/atmosphere.css", import.meta.url), "utf8");
    const block = css.slice(css.indexOf(`@media ${DEPTH_OFF_QUERY.split(", ").filter((q) => !q.includes("reduced")).join(", ")}`));
    expect(block.length).toBeLessThan(css.length);
    expect(block).toMatch(/\.landing \.card, \.landing \.banner \{[^}]*transform: none/);
    expect(block).toMatch(/filter: none/);
  });

  it("lines up the scrambling copy with the text under it", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../src/styles/atmosphere.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.scramble-overlay \{[^}]*right: 0[^}]*text-align: inherit/);
  });
});
