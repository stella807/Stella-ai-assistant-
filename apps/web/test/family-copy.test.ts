import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { familyCopy } from "../src/app/family-copy.ts";

describe("the family section, first under the hero", () => {
  it("speaks to someone with a parent in Puerto Rico, in both languages, with the same parts", () => {
    const en = familyCopy("en"), es = familyCopy("es");
    expect(en.heading).toMatch(/family/i);
    expect(es.heading).toMatch(/familia/i);
    expect(en.items).toHaveLength(4);
    expect(es.items).toHaveLength(en.items.length);
    expect(en.items[0]!.title).toMatch(/hospital/i);
    expect(es.items[0]!.title).toMatch(/hospital/i);
  });

  it("claims only what is true today: no prices, phone numbers, 24/7 cover, guarantees or photos sent", () => {
    for (const lang of ["en", "es"] as const) {
      const text = JSON.stringify(familyCopy(lang));
      expect(text, lang).not.toMatch(/\$\d|\d{3}[-. )]\d{3}[-. ]\d{4}|24\/7|guarantee|garantiz|photos? (sent|of the visit)|fotos de la visita/i);
      expect(text, lang).toMatch(/911/);
    }
  });
});

describe("the order of the landing page", () => {
  const read = (f: string) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");

  it("puts the family section right after the hero, before anything about jets", () => {
    const page = read("LandingIntro.tsx");
    const hero = page.indexOf("<LuxuryHero"), family = page.indexOf("<FamilySection"), show = page.indexOf("<LandingShowcase");
    expect(hero).toBeGreaterThan(0);
    expect(family).toBeGreaterThan(hero);
    expect(show).toBeGreaterThan(family);
  });

  it("shows trust before what we arrange, and jets and yachts last among the photos", () => {
    const show = read("LandingShowcase.tsx");
    expect(show.indexOf('aria-labelledby="show-trust"')).toBeLessThan(show.indexOf('aria-labelledby="show-title"'));
    const order = [...show.matchAll(/\{ photo: "(\w+)"/g)].map((m) => m[1]);
    expect(order.slice(-2)).toEqual(["jet", "yacht"]);
    expect(order[0]).toBe("ride");
  });
});
