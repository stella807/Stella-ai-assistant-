import { describe, expect, it } from "vitest";
import { safeHttpUrl, safeImageSrc } from "../src/app/safe-url.ts";

describe("safe addresses from server data", () => {
  it("passes web addresses and drops anything that could run code", () => {
    expect(safeHttpUrl("https://www.infinitoproductions.com/")).toBe("https://www.infinitoproductions.com/");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
    for (const bad of ["javascript:alert(1)", " javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", ""]) {
      expect(safeHttpUrl(bad), bad).toBeUndefined();
    }
  });
  it("allows an embedded photo only as an image", () => {
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(safeImageSrc("data:text/html;base64,AAAA")).toBeUndefined();
    expect(safeImageSrc("javascript:alert(1)")).toBeUndefined();
    expect(safeImageSrc("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });
});
