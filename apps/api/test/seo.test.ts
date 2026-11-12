import { describe, expect, it } from "vitest";
import { applySeo, renderSeoHead, seoPageFor, sitemapXml, type SeoFacts } from "../src/seo.ts";

const facts: SeoFacts = {
  origin: "https://safehubby.com",
  plans: [
    { name: "Free", monthlyCents: 0, seats: 1 },
    { name: "Premium", monthlyCents: 9399, seats: 1 },
    { name: "Family", monthlyCents: 44900, seats: 6 },
  ],
  hourlyCents: 4500,
  armedHourlyCents: 7500,
  errandFromCents: 1167,
  loungeFeeCents: 2000,
  hospitalDayCents: 19500,
  markets: ["Puerto Rico", "Texas", "Los Angeles"],
  roles: [
    { id: "driver", label: "Driver", description: "Drive people home.", pay: "Paid per trip — see the driver application for the rates", payEs: "Pago por viaje: las tarifas están en la solicitud para manejar", openings: 3 },
    { id: "personal-assistant", label: "Personal assistant", description: "Go to people in person.", pay: "$35.00 an hour; $150.00 for a hospital day (up to 12 hours)", payEs: "$35.00 la hora; $150.00 por un día de hospital (hasta 12 horas)", openings: 5 },
    { id: "caretaker", label: "Hospital caretaker", description: "Stay with a patient through a hospital day.", pay: "$150.00 per hospital day (up to 12 hours)", payEs: "$150.00 por un día de hospital (hasta 12 horas)", openings: 0 },
  ],
  hiringOpenedOn: "2026-10-28",
};

const template = [
  `<!doctype html>`, `<html lang="en" style="background:#000">`, `<head>`,
  `<!--seo:head--><title>old</title><!--/seo:head-->`,
  `<script type="module" src="/assets/app.js"></script>`, `</head>`,
  `<body><div id="root"><!--seo:body--><!--/seo:body--></div></body>`, `</html>`,
].join("\n");

describe("what each address tells a search engine", () => {
  it("describes the home page in its own language, with its twin in the other", () => {
    const en = seoPageFor("/", facts);
    expect(en).toMatchObject({ status: 200, lang: "en", canonical: "https://safehubby.com/", robots: "index, follow" });
    expect(en.title).toContain("Puerto Rico");
    expect(en.alternates).toEqual([
      { hreflang: "en", href: "https://safehubby.com/" },
      { hreflang: "es", href: "https://safehubby.com/es" },
      { hreflang: "x-default", href: "https://safehubby.com/" },
    ]);
    const es = seoPageFor("/es/", facts);
    expect(es).toMatchObject({ lang: "es", canonical: "https://safehubby.com/es" });
    expect(es.title).toContain("asistentes personales");
    expect(es.body).toContain("Alguien de confianza");
    expect(es.body).toContain(`<a href="/">English</a>`);
  });

  it("keeps titles and descriptions to a length a results page shows whole", () => {
    for (const path of ["/", "/es", "/careers", "/es/trabajo", "/drive", "/es/chofer", "/careers/personal-assistant", "/es/trabajo/personal-assistant"]) {
      const page = seoPageFor(path, facts);
      expect(page.title.length, `${path} title`).toBeLessThanOrEqual(65);
      expect(page.description.length, `${path} description`).toBeLessThanOrEqual(165);
      expect(page.description.length, `${path} description`).toBeGreaterThan(50);
    }
  });

  it("puts the page's real content and today's prices in the static HTML", () => {
    const { body } = seoPageFor("/", facts);
    expect(body).toContain("<h1>Someone you trust, wherever they&#39;re needed.</h1>");
    expect(body).toContain("Premium: $93.99 a month");
    expect(body).toContain("Family: $449 a month, covers 6 people");
    expect(body).toContain("Free: free");
    expect(body).toContain("$45 an hour");
    expect(body).toContain("from $11.67");
    expect(body).toContain("Puerto Rico, Texas and Los Angeles");
    expect(body).toContain(`<a href="/careers">`);
    expect(body.match(/<h1>/g)).toHaveLength(1);
  });

  it("offers the plans as structured data, priced as the page prices them", () => {
    const graph = (seoPageFor("/", facts).jsonLd[0] as { "@graph": { "@type": string; offers?: { name: string; price: string }[] }[] })["@graph"];
    expect(graph.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "Service"]);
    expect(graph[2]!.offers!.map((o) => `${o.name} ${o.price}`)).toEqual(["Free 0.00", "Premium 93.99", "Family 449.00"]);
  });

  it("resolves a printed alias to the address to index", () => {
    expect(seoPageFor("/work", facts).canonical).toBe("https://safehubby.com/careers");
    expect(seoPageFor("/trabajo", facts)).toMatchObject({ lang: "es", canonical: "https://safehubby.com/es/trabajo" });
  });

  it("serves the signed-in areas without offering them to search engines", () => {
    for (const path of ["/master", "/employee"]) {
      const page = seoPageFor(path, facts);
      expect(page, path).toMatchObject({ status: 200, robots: "noindex, nofollow", body: "", jsonLd: [] });
      expect(page.canonical).toBeUndefined();
    }
  });

  it("answers an address the site does not have with a 404 that is not indexed", () => {
    for (const path of ["/wp-login.php", "/es/nada", "/careers/ceo", "/assets/gone-abc12345.js"]) {
      expect(seoPageFor(path, facts), path).toMatchObject({ status: 404, robots: "noindex" });
    }
  });
});

describe("job listings", () => {
  const posting = (path: string) => seoPageFor(path, facts).jsonLd[0] as Record<string, unknown> | undefined;

  it("lists a job that has a seat open, with what the page itself says", () => {
    const job = posting("/careers/personal-assistant")!;
    expect(job).toMatchObject({
      "@type": "JobPosting", title: "Personal assistant", datePosted: "2026-10-28", directApply: true,
      url: "https://safehubby.com/careers/personal-assistant",
      baseSalary: { currency: "USD", value: { value: 35, unitText: "HOUR" } },
    });
    expect(job.description).toContain("Go to people in person.");
    expect(job.description).toContain("firearms licence");
    expect(job.jobLocation).toHaveLength(3);
  });

  it("lists it in Spanish on the Spanish page", () => {
    const page = seoPageFor("/es/trabajo/personal-assistant", facts);
    expect(page.title).toBe("Empleo de Asistente personal en Puerto Rico | Safehubby");
    expect((page.jsonLd[0] as { title: string; inLanguage: string })).toMatchObject({ title: "Asistente personal", inLanguage: "es" });
    expect(page.body).toContain("$35.00 la hora");
  });

  it("does not list a job with no seats left, though its page still exists", () => {
    const page = seoPageFor("/careers/caretaker", facts);
    expect(page.status).toBe(200);
    expect(page.jsonLd).toEqual([]);
  });

  it("does not turn per-task pay into an hourly wage", () => {
    expect(posting("/drive")).not.toHaveProperty("baseSalary");
    expect(String(posting("/drive")!.description)).toContain("driver&#39;s licence");
    expect(String(posting("/drive")!.description)).not.toContain("firearms");
  });

  it("treats a job the server does not list as no page at all", () => {
    expect(seoPageFor("/careers/nurse", facts).status).toBe(404);
  });

  it("shows every job on the careers page, the open ones first, and marks up none of them there", () => {
    const page = seoPageFor("/careers", facts);
    expect(page.jsonLd).toEqual([]);
    expect(page.body.indexOf("Personal assistant")).toBeLessThan(page.body.indexOf("Hospital caretaker"));
    expect(page.body).toContain(`<a href="/careers/personal-assistant">Personal assistant</a> <small>(5 openings)</small>`);
    expect(page.body).not.toContain(`href="/careers/driver"`);
  });
});

describe("putting it into the app's HTML", () => {
  it("replaces the tags, the language and the content, and leaves the app's own script alone", () => {
    const html = applySeo(template, seoPageFor("/es", facts), facts.origin);
    expect(html).toContain(`<html lang="es" style="background:#000">`);
    expect(html).toContain("<title>Concierge y asistentes personales en Puerto Rico | Safehubby</title>");
    expect(html).not.toContain("<title>old</title>");
    expect(html).toContain(`<link rel="alternate" hreflang="en" href="https://safehubby.com/" />`);
    expect(html).toContain(`<script type="module" src="/assets/app.js"></script>`);
    expect(html).toContain(`<div id="root"><!--seo:body--><div class="seo-shell">`);
  });

  it("leaves an older build without the markers untouched", () => {
    const old = `<html lang="en"><head><title>x</title></head><body><div id="root"></div></body></html>`;
    expect(applySeo(old, seoPageFor("/es", facts), facts.origin)).toBe(old);
  });

  it("cannot be broken out of by text that looks like markup", () => {
    const hostile: SeoFacts = {
      ...facts,
      plans: [{ name: `</script><script>alert(1)</script>`, monthlyCents: 100, seats: 1 }],
      roles: [{ ...facts.roles[1]!, description: `"><img src=x onerror=alert(1)>` }],
    };
    const home = applySeo(template, seoPageFor("/", hostile), hostile.origin);
    expect(home).not.toContain("<script>alert(1)");
    expect(home).toContain("\\u003c/script>");
    const job = applySeo(template, seoPageFor("/careers/personal-assistant", hostile), hostile.origin);
    expect(job).not.toContain("<img src=x");
  });

  it("gives a page that is not indexed no canonical, no social card and no robots-visible content", () => {
    const head = renderSeoHead(seoPageFor("/master", facts), facts.origin);
    expect(head).toContain(`<meta name="robots" content="noindex, nofollow" />`);
    expect(head).not.toContain("canonical");
    expect(head).not.toContain("og:title");
  });
});

describe("the sitemap", () => {
  it("lists both languages of each page and a page only for jobs that are open", () => {
    const xml = sitemapXml(facts);
    for (const path of ["/", "/es", "/careers", "/es/trabajo", "/drive", "/es/chofer", "/careers/personal-assistant", "/es/trabajo/personal-assistant"]) {
      expect(xml, path).toContain(`<loc>https://safehubby.com${path}</loc>`);
    }
    expect(xml).not.toContain("caretaker");
    expect(xml).not.toContain("/master");
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="es" href="https://safehubby.com/es"/>`);
  });
});

describe("the service pages", () => {
  it("describe private jets in each language, with the live map's honest limits, and carry their own picture", () => {
    const en = seoPageFor("/private-jets-puerto-rico", facts);
    expect(en).toMatchObject({ status: 200, lang: "en", canonical: "https://safehubby.com/private-jets-puerto-rico", robots: "index, follow" });
    expect(en.title).toContain("Private jets");
    expect(en.body.match(/<h1>/g)).toHaveLength(1);
    expect(en.body).toContain("Jettly");
    expect(en.body).toContain("$45 an hour");
    expect(en.body).toMatch(/lag by up to a minute/);
    expect(en.image?.path).toBe("/img/showcase-jet.jpg");
    expect(en.alternates).toContainEqual({ hreflang: "es", href: "https://safehubby.com/es/jets-privados-puerto-rico" });
    expect(renderSeoHead(en, facts.origin)).toContain('og:image" content="https://safehubby.com/img/showcase-jet.jpg"');
    const es = seoPageFor("/es/jets-privados-puerto-rico", facts);
    expect(es).toMatchObject({ lang: "es", canonical: "https://safehubby.com/es/jets-privados-puerto-rico" });
    expect(es.body).toContain("Jets privados");
  });

  it("state the lounge pass price from the same fee the app charges, never typed in the page", () => {
    const en = seoPageFor("/airport-lounge-passes", facts);
    expect(en.description).toContain("$20");
    expect(en.body).toContain("at least $20");
    expect(en.body).toContain("not included in any plan");
    const dearer = seoPageFor("/airport-lounge-passes", { ...facts, loungeFeeCents: 2500 });
    expect(dearer.body).toContain("at least $25");
    expect(seoPageFor("/es/pases-salas-vip", facts).body).toContain("al menos $20");
  });

  it("describe errands, assistants and safe rides from the live prices, each with a twin and a picture", () => {
    const errands = seoPageFor("/errand-service-puerto-rico", facts);
    expect(errands.body).toContain("never used");
    expect(errands.image?.path).toBe("/img/showcase-venue.jpg");
    const assistant = seoPageFor("/personal-assistant-puerto-rico", facts);
    expect(assistant.body).toContain("$45 an hour");
    expect(assistant.body).toContain("call 911");
    expect(seoPageFor("/safe-ride-home-puerto-rico", facts).body.match(/<h1>/g)).toHaveLength(1);
    const es = seoPageFor("/es/transporte-seguro-puerto-rico", facts);
    expect(es).toMatchObject({ lang: "es", status: 200 });
    expect(es.alternates).toContainEqual({ hreflang: "en", href: "https://safehubby.com/safe-ride-home-puerto-rico" });
    expect(seoPageFor("/", facts).body).toContain('href="/errand-service-puerto-rico"');
  });

  it("describe the service as structured data with a breadcrumb", () => {
    const [graph] = seoPageFor("/airport-lounge-passes", facts).jsonLd as { "@graph": { "@type": string }[] }[];
    expect(graph!["@graph"].map((n) => n["@type"])).toEqual(["Organization", "Service", "BreadcrumbList"]);
  });

  it("are in the sitemap, each with its twin", () => {
    const xml = sitemapXml(facts);
    for (const loc of ["/private-jets-puerto-rico", "/es/jets-privados-puerto-rico", "/airport-lounge-passes", "/es/pases-salas-vip"]) {
      expect(xml).toContain(`<loc>https://safehubby.com${loc}</loc>`);
    }
  });

  it("are linked from the home page's plain text, which names them", () => {
    expect(seoPageFor("/", facts).body).toContain('href="/private-jets-puerto-rico"');
    expect(seoPageFor("/es", facts).body).toContain('href="/es/pases-salas-vip"');
    expect(seoPageFor("/es", facts).body).toContain("Jets privados");
  });
});
