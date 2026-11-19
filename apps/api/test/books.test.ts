import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRPORT_VIP_VENDORS } from "@safehubby/core";
import { BOOKS, readBook } from "../src/books.ts";

const src = (slug: string) => readFileSync(new URL(`../books/src/${slug}.md`, import.meta.url), "utf8");

describe("the books sold to agents", () => {
  it("has the three we promised, each a real PDF of a real length", () => {
    expect(BOOKS.map((b) => b.slug).sort()).toEqual(["hiring-and-working-with-a-concierge", "traveling-with-an-older-parent", "visiting-puerto-rico"]);
    for (const b of BOOKS) {
      const pdf = readBook(b.slug)!;
      expect(pdf.subarray(0, 5).toString(), b.slug).toBe("%PDF-");
      expect(b.pages, b.slug).toBeGreaterThanOrEqual(12);
      expect(b.description.length, b.slug).toBeGreaterThan(80);
      expect(pdf.length, b.slug).toBe(b.bytes);
      expect(createHash("sha256").update(pdf).digest("hex"), b.slug).toBe(b.sha256);
    }
  });

  it("is built from the text in the repo: if a book is edited, the PDF must be rebuilt", () => {
    for (const b of BOOKS) expect(createHash("sha256").update(src(b.slug)).digest("hex"), `${b.slug}: run node apps/api/scripts/build-books.mjs`).toBe(b.sourceSha256);
  });

  it("never names a company, gives a phone number or a link, or promises anything: only our own email and general advice", () => {
    const providers = [...new Set(AIRPORT_VIP_VENDORS.map((v) => v.name.split(/ · | \(/)[0]!.trim()))];
    for (const b of BOOKS) {
      const text = src(b.slug).replace(/contact@safehubby\.com/g, "");
      expect(text, b.slug).not.toMatch(/https?:|www\.|@|\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b/);
      for (const p of providers.filter((n) => n.length >= 4)) expect(text, `${b.slug} names ${p}`).not.toMatch(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
      expect(text, b.slug).not.toMatch(/guarantee|guaranteed|risk-free|best in|number one/i);
      expect(text, b.slug).toMatch(/not (medical|legal)/i);
      expect(text, b.slug).toContain("About Safehubby");
    }
  });

  it("writes in plain, even English: no filler words that give a text away", () => {
    for (const b of BOOKS) expect(src(b.slug), b.slug).not.toMatch(/\b(delve|tapestry|testament to|in today's fast-paced|navigate the complexities)\b/i);
  });

  it("returns nothing for a book that does not exist", () => {
    expect(readBook("nope")).toBeUndefined();
    expect(readBook("../manifest")).toBeUndefined();
  });
});
