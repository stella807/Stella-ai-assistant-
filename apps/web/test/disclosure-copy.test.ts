import { describe, expect, it } from "vitest";
import { disclosureCopy } from "../src/app/disclosure-copy.ts";

describe("the client disclosure policy", () => {
  const en = disclosureCopy("en", "$45.00");
  const es = disclosureCopy("es", "$45.00");

  it("says the same things in both languages, section for section", () => {
    expect(es.sections.map((s) => s.points.length)).toEqual(en.sections.map((s) => s.points.length));
  });

  it("states the extra-hour price and the planned-hours lead time it is given", () => {
    const text = (c: typeof en) => c.sections.flatMap((s) => s.points).join(" ");
    expect(text(en)).toContain("$45.00 an hour");
    expect(text(es)).toContain("$45.00 la hora");
    expect(text(en)).toContain("24 hours ahead");
  });

  it("covers the things a client agrees to understand before booking", () => {
    const headings = en.sections.map((s) => s.heading).join(" | ").toLowerCase();
    for (const topic of ["assistants", "cost", "hours", "card", "safety"]) expect(headings + " " + en.intro.toLowerCase()).toContain(topic);
    expect(en.sections.flatMap((s) => s.points).join(" ")).toMatch(/not an emergency service/i);
  });
});
