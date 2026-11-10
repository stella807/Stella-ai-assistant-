import { describe, expect, it } from "vitest";
import { blogPageFor, blogSitemapUrls, isBlogPath, type Article } from "../src/blog.ts";
import { ARTICLES } from "../src/blog/index.ts";
import type { SeoFacts } from "../src/seo.ts";

const facts: SeoFacts = {
  origin: "https://safehubby.com",
  plans: [{ name: "Free", monthlyCents: 0, seats: 1 }, { name: "Basic", monthlyCents: 3900, seats: 1 }],
  hourlyCents: 4500, armedHourlyCents: 7500, errandFromCents: 1234, hospitalDayCents: 19500,
  markets: ["Puerto Rico"], roles: [], hiringOpenedOn: "2026-10-28",
};
const LANGS = ["en", "es"] as const;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Every string an article shows, per language. */
function textOf(a: Article, lang: "en" | "es"): string[] {
  const out = [a.title[lang], a.description[lang]];
  for (const b of a.blocks) {
    if ("h2" in b) out.push(b.h2[lang]);
    else if ("p" in b) out.push(b.p[lang]);
    else if ("ul" in b) out.push(...b.ul.map((x) => x[lang]));
    else out.push(...b.table.head.map((x) => x[lang]), ...b.table.rows.flat().map((x) => x[lang]));
  }
  for (const f of a.faq ?? []) out.push(f.q[lang], f.a[lang]);
  return out;
}

describe("every published article follows the rules in docs/blog.md", () => {
  it("has at least one article, and no two share an address", () => {
    expect(ARTICLES.length).toBeGreaterThan(0);
    for (const lang of LANGS) {
      const slugs = ARTICLES.map((a) => a.slug[lang]);
      expect(new Set(slugs).size, lang).toBe(slugs.length);
    }
  });

  for (const a of ARTICLES) {
    describe(a.slug.en, () => {
      it("has a proper address, date, title and description in both languages", () => {
        expect(a.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(a.publishedOn))).toBe(false);
        if (a.updatedOn) expect(a.updatedOn >= a.publishedOn).toBe(true);
        for (const lang of LANGS) {
          expect(a.slug[lang], lang).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
          expect(a.title[lang].length, `${lang} title`).toBeGreaterThan(15);
          expect(a.title[lang].length, `${lang} title`).toBeLessThanOrEqual(62);
          expect(a.description[lang].length, `${lang} description`).toBeGreaterThan(60);
          expect(a.description[lang].length, `${lang} description`).toBeLessThanOrEqual(170);
        }
      });

      it("says everything in both languages, and enough of it to be worth reading", () => {
        for (const lang of LANGS) {
          const text = textOf(a, lang);
          expect(text.every((t) => t.trim().length > 0), `${lang} has an empty string`).toBe(true);
          expect(words(text.join(" ")), `${lang} word count`).toBeGreaterThanOrEqual(200);
        }
        expect(textOf(a, "en").length).toBe(textOf(a, "es").length);
      });

      it("says where each fact about another company came from, and when", () => {
        for (const c of a.companies ?? []) {
          expect(c.source, c.name).toMatch(/^https:\/\//);
          expect(c.checked, c.name).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
          // The company it cites is one it actually talks about.
          expect(textOf(a, "en").join(" "), c.name).toContain(c.name);
        }
        // A page by someone else that is quoted: linked, dated, and named in both languages.
        for (const x of a.sources ?? []) {
          expect(x.url, x.name.en).toMatch(/^https:\/\//);
          expect(x.checked, x.name.en).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
          expect(x.name.en.trim().length > 0 && x.name.es.trim().length > 0, x.url).toBe(true);
        }
      });

      it("renders in both languages with every price filled in and every link going somewhere allowed", () => {
        for (const lang of LANGS) {
          const page = blogPageFor(`${lang === "es" ? "/es/blog" : "/blog"}/${a.slug[lang]}`, facts)!;
          expect(page.status).toBe(200);
          expect(page.html).not.toContain("{{");
          expect(page.html).not.toMatch(/\]\((?!\/|https:)/);
          expect(page.html).toContain(`<html lang="${lang}">`);
          expect(page.html).toContain(`"@type":"BlogPosting"`);
          // A link inside the site points at a page that exists.
          for (const [, href] of page.html.matchAll(/<a href="(\/(?:es\/)?blog\/[^"]+)"/g)) {
            expect(blogPageFor(href!, facts)?.status, href).toBe(200);
          }
        }
      });
    });
  }
});

describe("the blog's pages", () => {
  const sample: Article = {
    slug: { en: "a-test", es: "una-prueba" }, publishedOn: "2026-11-03", updatedOn: "2026-11-05",
    title: { en: "A test <article>", es: "Una prueba" }, description: { en: "English description.", es: "Descripción." },
    blocks: [
      { p: { en: "An hour is {{hourly}}. See [the site](/) and [them](https://example.com/a?b=1&c=2). Not [this](javascript:alert(1)). **Bold** <script>x</script>", es: "Una hora cuesta {{hourly}}." } },
      { table: { head: [{ en: "Name", es: "Nombre" }], rows: [[{ en: "Row", es: "Fila" }]] } },
    ],
    faq: [{ q: { en: "Why?", es: "¿Por qué?" }, a: { en: "Because {{errandFrom}}.", es: "Porque {{errandFrom}}." } }],
    companies: [{ name: "Example Co", source: "https://example.com/pricing", checked: "2026-11" }],
    sources: [{ name: { en: "A review site: Example Co", es: "Un sitio de reseñas: Example Co" }, url: "https://reviews.example.com/example-co", checked: "2026-10" }],
  };

  it("fills in live prices, allows only safe links and escapes everything else", () => {
    const { html } = blogPageFor("/blog/a-test", facts, [sample])!;
    expect(html).toContain("An hour is $45.");
    expect(html).toContain(`<a href="/">the site</a>`);
    expect(html).toContain(`<a href="https://example.com/a?b=1&amp;c=2" rel="nofollow noopener">them</a>`);
    expect(html).not.toContain(`href="javascript:`);
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("<title>A test &lt;article&gt; | Safehubby</title>");
    expect(html).toContain("Because $12.34.");
    expect(html).toContain(`"@type":"FAQPage"`);
    expect(html).toContain("Example Co: its own website, read in November 2026.");
    expect(html).toContain(`<a href="https://reviews.example.com/example-co" rel="nofollow noopener">A review site: Example Co, read in October 2026.</a>`);
    expect(html).toContain("We have not verified them");
    expect(html).toContain("Published November 3, 2026 · Updated November 5, 2026");
  });

  it("pairs each article with its twin in the other language", () => {
    const es = blogPageFor("/es/blog/una-prueba/", facts, [sample])!;
    expect(es.lang).toBe("es");
    expect(es.html).toContain(`<link rel="canonical" href="https://safehubby.com/es/blog/una-prueba" />`);
    expect(es.html).toContain(`<link rel="alternate" hreflang="en" href="https://safehubby.com/blog/a-test" />`);
    expect(es.html).toContain("3 de noviembre de 2026");
    expect(es.html).toContain(`<a href="/blog/a-test">English</a>`);
  });

  it("lists the articles newest first on the index, in each language", () => {
    const older = { ...sample, slug: { en: "older", es: "vieja" }, publishedOn: "2026-10-01", title: { en: "Older one", es: "La vieja" } };
    const { html } = blogPageFor("/blog", facts, [older, sample])!;
    expect(html.indexOf("A test")).toBeLessThan(html.indexOf("Older one"));
    expect(blogPageFor("/es/blog", facts, [sample])!.html).toContain(`<a href="/es/blog/una-prueba">Una prueba</a>`);
  });

  it("answers an article that does not exist with a 404 that is not indexed, and leaves other addresses alone", () => {
    const missing = blogPageFor("/blog/nope", facts, [sample])!;
    expect(missing.status).toBe(404);
    expect(missing.html).toContain(`<meta name="robots" content="noindex" />`);
    // The Spanish address of an article is not its English one.
    expect(blogPageFor("/blog/una-prueba", facts, [sample])!.status).toBe(404);
    expect(blogPageFor("/careers", facts, [sample])).toBeNull();
    expect(isBlogPath("/blog")).toBe(true);
    expect(isBlogPath("/es/blog/x")).toBe(true);
    expect(isBlogPath("/blogger")).toBe(false);
    expect(isBlogPath("/api/blog")).toBe(false);
  });

  it("puts the index and every article in the sitemap, in both languages", () => {
    const urls = blogSitemapUrls("https://safehubby.com", [sample]).map((u) => u.loc);
    expect(urls).toEqual([
      "https://safehubby.com/blog", "https://safehubby.com/es/blog",
      "https://safehubby.com/blog/a-test", "https://safehubby.com/es/blog/una-prueba",
    ]);
  });
});
