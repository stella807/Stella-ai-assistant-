import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES, validateResume } from "../src/resume.ts";

const valid = { base64: "JVBERi0xLjQK".repeat(10), mimeType: "application/pdf", fileName: "jordan-resume.pdf" };

describe("validateResume", () => {
  it("accepts a PDF within the size ceiling", () => {
    expect(() => validateResume(valid)).not.toThrow();
  });

  it("accepts a photo of a printed résumé", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(40).fill(0)]).toString("base64");
    expect(() => validateResume({ ...valid, mimeType: "image/jpeg", base64: jpeg })).not.toThrow();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(40).fill(0)]).toString("base64");
    expect(() => validateResume({ ...valid, mimeType: "image/png", base64: png })).not.toThrow();
  });

  it("refuses an empty file", () => {
    expect(() => validateResume({ ...valid, base64: "" })).toThrow(/no résumé/i);
    expect(() => validateResume({ ...valid, base64: "   " })).toThrow(/no résumé/i);
  });

  it("refuses a type that is neither a PDF nor a photo", () => {
    expect(() => validateResume({ ...valid, mimeType: "application/msword" }))
      .toThrow(/pdf.*photo/i);
    expect(() => validateResume({ ...valid, mimeType: "text/plain" })).toThrow(/pdf.*photo/i);
  });

  it("refuses a missing filename", () => {
    expect(() => validateResume({ ...valid, fileName: "" })).toThrow(/needs a name/i);
  });

  it("refuses a file over the size ceiling", () => {
    // Roughly 4 bytes of base64 decode to 3 bytes, so this comfortably clears it.
    const huge = "A".repeat(Math.ceil((MAX_RESUME_BYTES + 100_000) / 3) * 4);
    expect(() => validateResume({ ...valid, base64: huge })).toThrow(/too large/i);
  });

  it("refuses a file that is not what it says it is", () => {
    // A page of HTML under a PDF label, opened from the review screen by
    // whoever is hiring, is the whole reason the first bytes are checked.
    const html = Buffer.from("<html><script>alert(1)</script></html>").toString("base64");
    expect(() => validateResume({ ...valid, base64: html })).toThrow(/not a real/i);
    // And a PDF filed as a PNG is as wrong as the reverse.
    expect(() => validateResume({ ...valid, mimeType: "image/png" })).toThrow(/not a real/i);
  });
});
