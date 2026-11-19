import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isGatedPath } from "../src/site-pass.ts";

describe("Bing's site-ownership file", () => {
  const file = new URL("../../web/public/BingSiteAuth.xml", import.meta.url);

  it("holds exactly the code Bing gave the owner, in the shape Bing reads", () => {
    const xml = readFileSync(file, "utf8");
    expect(xml).toMatch(/^<\?xml version="1\.0"\?>\s*<users>\s*<user>91063068F060C72122F94875BDEB89D3<\/user>\s*<\/users>\s*$/);
  });

  it("is a public file anyone, including Bing's crawler, can fetch without paying the site pass", () => {
    expect(isGatedPath("/BingSiteAuth.xml")).toBe(false);
  });
});
