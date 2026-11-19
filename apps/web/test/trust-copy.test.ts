import { describe, expect, it } from "vitest";
import { trustCopy } from "../src/app/trust-copy.ts";

describe("the trust block above the plans", () => {
  const en = trustCopy("en");
  const es = trustCopy("es");

  it("says the same things in both languages, item for item", () => {
    expect(es.items).toHaveLength(en.items.length);
    expect(en.items.map((i) => i.title)).toEqual(["Who comes", "Where", "If something goes wrong", "If your assistant is running late", "Your money"]);
    for (const c of [en, es]) for (const i of c.items) { expect(i.title.length).toBeGreaterThan(2); expect(i.body.length).toBeGreaterThan(20); }
  });

  it("answers who comes, where, and what to do first, in the owner's own words", () => {
    const text = (c: typeof en) => c.items.map((i) => `${i.title} ${i.body}`).join(" ").toLowerCase();
    expect(text(en)).toContain("photo");
    expect(text(en)).toContain("all of puerto rico");
    expect(text(en)).toMatch(/call you themselves, tell you why, and give an approximate arrival time/);
    expect(text(es)).toContain("foto");
    expect(text(es)).toContain("todo puerto rico");
    expect(text(es)).toMatch(/te llama directamente.*hora aproximada/);
  });

  it("puts the emergency number before the chat line, in both languages", () => {
    for (const c of [en, es]) {
      const wrong = c.items.find((i) => i.body.includes("911"))!;
      expect(wrong.body.indexOf("911")).toBeLessThan(wrong.body.toLowerCase().indexOf("whatsapp"));
    }
  });

  it("says plainly that there is one assistant today, and promises nothing it cannot keep", () => {
    expect(en.items[0]!.body).toMatch(/one assistant, the founder/i);
    expect(es.items[0]!.body).toMatch(/un solo asistente, el fundador/i);
    for (const c of [en, es]) {
      const t = c.items.map((i) => i.body).join(" ").toLowerCase();
      expect(t).not.toMatch(/24\/7|network|red de|guarante|garantiz|always|siempre|hundreds|cientos|never late|nunca se atras/);
      // The selfie is optional in the app, so the page may only say it can be shared.
      expect(t).not.toMatch(/each get|cada uno recibe|you will receive a selfie/);
      expect(t).toMatch(/can (each )?share|puede compartir/);
    }
  });

  it("labels the chat button in each language", () => {
    expect(en.whatsapp).toMatch(/whatsapp/i);
    expect(es.whatsapp).toMatch(/whatsapp/i);
    expect(en.heading).toBe("Who comes, where, and what happens if something goes wrong");
    expect(es.heading).toBe("Quién llega, dónde, y qué pasa si algo sale mal");
  });
});
