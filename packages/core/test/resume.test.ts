import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES, validateResume } from "../src/resume.ts";

const valid = { base64: "JVBERi0xLjQK".repeat(10), mimeType: "application/pdf", fileName: "jordan-resume.pdf" };

describe("validateResume", () => {
  it("accepts a PDF within the size ceiling", () => {
    expect(() => validateResume(valid)).not.toThrow();
  });

  it("accepts a photo of a printed résumé", () => {
    expect(() => validateResume({ ...valid, mimeType: "image/jpeg" })).not.toThrow();
    expect(() => validateResume({ ...valid, mimeType: "image/png" })).not.toThrow();
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
});
