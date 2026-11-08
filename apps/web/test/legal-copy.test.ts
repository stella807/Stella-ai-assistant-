import { describe, expect, it } from "vitest";
import { privacyCopy, refundCopy, termsCopy } from "../src/app/legal-copy.ts";

describe("the Terms of Service and Privacy Policy drafts", () => {
  const docs = [["terms", termsCopy("en", "$45.00"), termsCopy("es", "$45.00")], ["privacy", privacyCopy("en"), privacyCopy("es")], ["refunds", refundCopy("en"), refundCopy("es")]] as const;

  it("say the same things in both languages, section for section", () => {
    for (const [, en, es] of docs) {
      expect(es.sections.map((s) => s.paragraphs.length)).toEqual(en.sections.map((s) => s.paragraphs.length));
    }
  });

  it("are marked as drafts under legal review in both languages", () => {
    for (const [, en, es] of docs) {
      expect(en.draftNotice).toMatch(/draft/i);
      expect(es.draftNotice).toMatch(/borrador/i);
    }
  });

  it("state the facts the app is built on, not invented ones", () => {
    const terms = termsCopy("en", "$45.00");
    const text = terms.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(text).toContain("$45.00 an hour");
    expect(text).toMatch(/one tap/i);
    expect(text).toMatch(/not an emergency service/i);
    expect(text).toMatch(/armed/i);
    const policy = privacyCopy("en");
    const privacy = [policy.intro, ...policy.sections.flatMap((s) => s.paragraphs)].join(" ");
    expect(privacy).toContain("7 days");
    expect(privacy).toMatch(/never sold/i);
    // The parts a lawyer has to settle say so rather than guessing.
    expect(text).toMatch(/once confirmed/i);
  });

  it("describes the refund rules the app actually follows, with no free trial", () => {
    const text = refundCopy("en").sections.flatMap((s) => s.paragraphs).join(" ");
    expect(text).toMatch(/no free trial/i);
    expect(text).toMatch(/one tap/i);
    expect(text).toMatch(/released/i);
    expect(text).toMatch(/dispute/i);
    expect(text).toMatch(/Stripe/);
    expect(text).not.toMatch(/14[- ]day/i);
    // Payments are through Stripe; no other payment method is mentioned.
    for (const lang of ["en", "es"] as const) {
      const all = refundCopy(lang).sections.flatMap((s) => s.paragraphs).join(" ");
      expect(all, lang).not.toMatch(/ATH|crypto|cripto/i);
    }
    // The refund rules: Elite and the club in full; Premium, Premium Plus and Family their card fee only.
    expect(text).toMatch(/Elite \(any rung\) and the Wingman Club, the whole charge is refunded/);
    expect(text).toMatch(/Premium, Premium Plus and Family, the card processing fee/);
    expect(text).toMatch(/monthly dues are refunded in full/);
  });

  it("names the map, place-search and flight providers, in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const text = privacyCopy(lang).sections.flatMap((x) => x.paragraphs).join("\n");
      for (const name of ["OpenStreetMap", "Google Places", "FlightAware"]) expect(text, `${lang} ${name}`).toContain(name);
    }
  });
});
