import { describe, expect, it } from "vitest";
import { MAX_PROFILE_PHOTO_CHARS, validateProfilePhotoUrl } from "../src/profile-photo.ts";

const jpeg = (n = 100) => `data:image/jpeg;base64,${"A".repeat(n)}`;

describe("validateProfilePhotoUrl", () => {
  it("accepts a small embedded JPEG, PNG or WebP", () => {
    for (const mime of ["jpeg", "png", "webp"]) {
      expect(validateProfilePhotoUrl(`data:image/${mime};base64,AAAA`)).toBe(`data:image/${mime};base64,AAAA`);
    }
  });
  it("accepts a plain https address", () => {
    expect(validateProfilePhotoUrl("https://example.com/rosa.jpg")).toBe("https://example.com/rosa.jpg");
  });
  it("treats nothing as nothing", () => {
    expect(validateProfilePhotoUrl(undefined)).toBeUndefined();
    expect(validateProfilePhotoUrl("")).toBeUndefined();
  });
  it("refuses a photo that is too large", () => {
    expect(() => validateProfilePhotoUrl(jpeg(MAX_PROFILE_PHOTO_CHARS))).toThrow(/too large/i);
  });
  it("refuses anything that could run or leak: scripts, svg, http, other schemes", () => {
    for (const bad of [
      "javascript:alert(1)", "data:text/html;base64,AAAA", "data:image/svg+xml;base64,AAAA",
      "http://example.com/a.jpg", "file:///etc/passwd", "data:image/jpeg,not-base64", "data:image/jpeg;base64,@@@@",
    ]) {
      expect(() => validateProfilePhotoUrl(bad), bad).toThrow();
    }
  });
});
