import { describe, expect, it } from "vitest";
import { CHECKLISTS, checklistIndex, findChecklist, checklistText } from "../src/checklists.ts";

describe("the checklists an agent can hand to the person it works for", () => {
  it("has the three we promised, each in English and Spanish with the same shape", () => {
    expect(CHECKLISTS.map((c) => c.slug.en)).toEqual(["hospital-day-with-a-parent", "airport-with-an-older-relative", "questions-before-hiring-a-concierge"]);
    for (const c of CHECKLISTS) {
      expect(c.groups.length).toBeGreaterThanOrEqual(2);
      for (const g of c.groups) {
        expect(g.heading.en.length).toBeGreaterThan(2);
        expect(g.heading.es.length).toBeGreaterThan(2);
        expect(g.items.length).toBeGreaterThanOrEqual(2);
        for (const i of g.items) { expect(i.en.length).toBeGreaterThan(10); expect(i.es.length).toBeGreaterThan(10); }
      }
      expect(c.slug.es).not.toBe(c.slug.en);
    }
  });

  it("says how many questions the third one has, and it is true", () => {
    const c = findChecklist("questions-before-hiring-a-concierge", "en")!;
    expect(c.groups.flatMap((g) => g.items)).toHaveLength(11);
    expect(c.description.en).toContain("Eleven");
  });

  it("gives no phone numbers, links or emails other than ours, and no medical or legal advice", () => {
    const all = JSON.stringify(CHECKLISTS).replace(/contact@safehubby\.com/g, "");
    expect(all).not.toMatch(/https?:|www\.|@|\d{4,}/);
    for (const lang of ["en", "es"] as const) {
      const hospital = checklistText(findChecklist("hospital-day-with-a-parent", "en")!, lang);
      expect(hospital).toMatch(lang === "en" ? /not medical advice/i : /no es consejo m[eé]dico/i);
    }
  });

  it("finds a checklist by its address in the right language, and lists them without the text", () => {
    expect(findChecklist("dia-en-el-hospital-con-un-familiar", "es")?.slug.en).toBe("hospital-day-with-a-parent");
    expect(findChecklist("dia-en-el-hospital-con-un-familiar", "en")).toBeUndefined();
    expect(findChecklist("nope", "en")).toBeUndefined();
    const idx = checklistIndex("en");
    expect(idx).toHaveLength(3);
    expect(idx[0]).toMatchObject({ slug: "hospital-day-with-a-parent", title: expect.any(String), description: expect.any(String) });
    expect(JSON.stringify(idx)).not.toContain("Photo ID");
  });

  it("writes a plain-text page a person can read or print, with a way to reach us at the bottom", () => {
    const t = checklistText(findChecklist("questions-before-hiring-a-concierge", "en")!, "en");
    expect(t.startsWith("Questions to ask")).toBe(true);
    expect(t).toMatch(/- \[ \]/);
    expect(t).toContain("contact@safehubby.com");
  });
});
