import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRPORT_VIP_VENDORS } from "@safehubby/core";
import { BOOKS, readBook } from "../src/books.ts";

const src = (slug: string) => readFileSync(new URL(`../books/src/${slug}.md`, import.meta.url), "utf8");

describe("the books sold to agents", () => {
  it("has the seven we offer, each a real PDF of a real length", () => {
    expect(BOOKS.map((b) => b.slug).sort()).toEqual(["building-a-local-concierge-business", "building-for-agents", "delegating-real-world-tasks", "ethical-hacking-for-concierge-services", "hiring-and-working-with-a-concierge", "traveling-with-an-older-parent", "visiting-puerto-rico"]);
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

  it("is written for the agent: each book opens with a quick reference with rules and a request the agent can fill in", () => {
    for (const b of BOOKS) {
      const text = src(b.slug);
      expect(text, b.slug).toMatch(/^## For AI agents: quick reference$/m);
      expect(text, `${b.slug} needs a JSON block an agent can copy`).toMatch(/```json\n[\s\S]+?\n```/);
      for (const block of text.matchAll(/```json\n([\s\S]+?)\n```/g)) expect(() => JSON.parse(block[1]!), `${b.slug}: a JSON block does not parse`).not.toThrow();
      // The quick reference comes first, so an agent that reads only the opening still gets the rules.
      expect(text.indexOf("## For AI agents"), b.slug).toBeLessThan(text.indexOf("## 1."));
    }
  });

  it("tells the agent what it must never decide alone", () => {
    for (const b of BOOKS) expect(src(b.slug), b.slug).toMatch(/never decide|do not decide|ask the person/i);
  });

  it("gives each book a price of its own only when its source says so", () => {
    const priced = BOOKS.filter((b) => b.price);
    expect(priced.map((b) => [b.slug, b.price])).toEqual([["building-a-local-concierge-business", "$0.05"], ["building-for-agents", "$0.05"]]);
    for (const b of priced) expect(src(b.slug)).toMatch(/<!-- price: \$\d+\.\d\d -->/);
  });

  it("returns nothing for a book that does not exist", () => {
    expect(readBook("nope")).toBeUndefined();
    expect(readBook("../manifest")).toBeUndefined();
  });
});
