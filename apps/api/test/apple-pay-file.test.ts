import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = join(import.meta.dirname, "../../web/public/.well-known/apple-developer-merchantid-domain-association");

describe("Apple Pay domain verification file", () => {
  it("is in the web app's public folder, so it is served at /.well-known/ on the site", () => {
    expect(existsSync(file)).toBe(true);
  });

  it("is Stripe's hex-encoded record, not anything else", () => {
    const text = readFileSync(file, "utf8").trim();
    expect(text).toMatch(/^[0-9A-Fa-f]+$/);
    expect(Buffer.from(text, "hex").toString("utf8")).toContain('"pspId"');
  });
});
