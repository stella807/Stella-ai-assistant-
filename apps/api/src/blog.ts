import type { SiteLang } from "@safehubby/core";
import { escapeHtml, jsonForScript, money, type SeoFacts, type SeoPage } from "./seo.ts";
import { ARTICLES } from "./blog/index.ts";

/**
 * The blog: plain pages the server writes itself, in English and Spanish.
 *
 * They are not part of the app. A reader arriving from a search wants the
 * article at once, and a crawler wants it in the HTML, so each page is a whole
 * document with no JavaScript, and the app's download does not grow by an
 * article a week.
 *
 * An article is data (./blog/), not markup, so every word is escaped on the
 * way out and one test can hold every article to the same rules. The rules
 * that matter are about other companies: an article that names one must say
 * where each fact came from and when it was read (see docs/blog.md).
 */
export type Words = { en: string; es: string };

export type Block =
  | { h2: Words }
  | { p: Words }
  | { ul: Words[] }
  | { table: { head: Words[]; rows: Words[][] } };

export interface Article {
  /** The address after /blog/ and /es/blog/. Lower case and hyphens. */
  slug: Words;
  /** YYYY-MM-DD. */
  publishedOn: string;
  updatedOn?: string;
  title: Words;
  /** One or two sentences, shown under the title and in search results. */
  description: Words;
  blocks: Block[];
  faq?: { q: Words; a: Words }[];
  /** Every other company the article names: its own page the facts were read from, and the month they were read (YYYY-MM). */
  companies?: { name: string; source: string; checked: string }[];
}

const BLOG: Record<SiteLang, string> = { en: "/blog", es: "/es/blog" };
const HOME: Record<SiteLang, string> = { en: "/", es: "/es" };
const LANGS: SiteLang[] = ["en", "es"];
const other = (lang: SiteLang): SiteLang => (lang === "en" ? "es" : "en");

const UI = {
  en: {
    blogTitle: "The Safehubby blog",
    blogDescription: "Straight talk about concierge services, personal assistants and getting help you can trust, in Puerto Rico and beyond. A new article every week.",
    otherLanguage: "Español", published: "Published", updated: "Updated", questions: "Questions people ask", sources: "Where the facts come from",
    read: (name: string, when: string) => `${name}: its own website, read in ${when}.`,
    fairness: "What we say about other companies comes from their own websites on the dates shown. Prices and services change, so check with them. The opinions are ours.",
    ctaTitle: "Someone you trust, wherever they're needed.",
    ctaText: "Safehubby sends a personal assistant, an errand runner or a ride. Check-ins, location sharing and SOS are free.",
    ctaButton: "See what it costs", allArticles: "All articles", home: "Safehubby home", jobs: "Jobs",
    notFound: "That article does not exist.",
  },
  es: {
    blogTitle: "El blog de Safehubby",
    blogDescription: "Hablamos claro sobre servicios de concierge, asistentes personales y cómo conseguir ayuda de confianza, en Puerto Rico y más allá. Un artículo nuevo cada semana.",
    otherLanguage: "English", published: "Publicado", updated: "Actualizado", questions: "Preguntas frecuentes", sources: "De dónde salen los datos",
    read: (name: string, when: string) => `${name}: su propia página web, leída en ${when}.`,
    fairness: "Lo que decimos de otras compañías sale de sus propias páginas web en las fechas indicadas. Los precios y servicios cambian, así que confírmalos con ellas. Las opiniones son nuestras.",
    ctaTitle: "Alguien de confianza, donde más lo necesitas.",
    ctaText: "Safehubby te envía un asistente personal, un mensajero o un viaje. Los chequeos, la ubicación y el SOS son gratis.",
    ctaButton: "Ver cuánto cuesta", allArticles: "Todos los artículos", home: "Inicio de Safehubby", jobs: "Empleos",
    notFound: "Ese artículo no existe.",
  },
} as const;

/** Safehubby's own prices, written into an article as {{hourly}} so a price the owner changes is never left stale in print. */
const TOKENS: Record<string, (f: SeoFacts) => string> = {
  hourly: (f) => money(f.hourlyCents),
  armedHourly: (f) => money(f.armedHourlyCents),
  errandFrom: (f) => money(f.errandFromCents),
  hospitalDay: (f) => money(f.hospitalDayCents),
  cheapestPlan: (f) => money(Math.min(...f.plans.filter((p) => p.monthlyCents > 0).map((p) => p.monthlyCents), f.hourlyCents)),
};

const fill = (text: string, f: SeoFacts): string =>
  text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => TOKENS[key]?.(f) ?? whole);

/** Escaped text with the two things an article may ask for: **bold**, and a link to an https page or to this site. */
function inline(text: string, f: SeoFacts): string {
  return escapeHtml(fill(text, f))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
      if (href.startsWith("https://")) return `<a href="${href}" rel="nofollow noopener">${label}</a>`;
      if (/^\/[a-z0-9\-/]*$/.test(href)) return `<a href="${href}">${label}</a>`;
      return whole;
    });
}

const longDate = (day: string, lang: SiteLang): string =>
  new Intl.DateTimeFormat(lang === "es" ? "es-PR" : "en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const monthName = (month: string, lang: SiteLang): string =>
  new Intl.DateTimeFormat(lang === "es" ? "es-PR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

function renderBlock(block: Block, lang: SiteLang, f: SeoFacts): string {
  if ("h2" in block) return `<h2>${inline(block.h2[lang], f)}</h2>`;
  if ("p" in block) return `<p>${inline(block.p[lang], f)}</p>`;
  if ("ul" in block) return `<ul>${block.ul.map((item) => `<li>${inline(item[lang], f)}</li>`).join("")}</ul>`;
  const head = block.table.head.map((cell) => `<th>${inline(cell[lang], f)}</th>`).join("");
  const rows = block.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell[lang], f)}</td>`).join("")}</tr>`).join("");
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

const CSS = `
body{margin:0;background:#0a0e1a;color:#e7ecf7;font:400 18px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:18px 18px 56px}
a{color:#f3e2b3}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid rgba(201,154,76,.28)}
.brand{font-family:Georgia,serif;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#fff;text-decoration:none}
.eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:#c99a4c;margin:26px 0 0}
h1{font:700 34px/1.14 Georgia,"Times New Roman",serif;color:#fff;margin:8px 0 12px}
h2{font:700 24px/1.2 Georgia,"Times New Roman",serif;color:#f3e2b3;margin:34px 0 8px}
h3{font:700 19px/1.3 Georgia,"Times New Roman",serif;color:#fff;margin:22px 0 4px}
p{margin:0 0 16px}.lead{font-size:20px;color:#c9d2e6}
li{margin-bottom:8px}.small{font-size:14px;color:#9aa7c2}
.scroll{overflow-x:auto;margin:0 0 18px}
table{border-collapse:collapse;width:100%;font-size:16px}
th,td{text-align:left;vertical-align:top;padding:10px 12px 10px 0;border-bottom:1px solid rgba(255,255,255,.1)}
th{color:#9aa7c2;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.cta{margin:40px 0 0;padding:22px;border-radius:18px;border:1px solid rgba(201,154,76,.4);background:linear-gradient(180deg,rgba(26,36,56,.92),rgba(18,26,44,.96))}
.cta h2{margin-top:0}.btn{display:inline-block;padding:13px 20px;border-radius:12px;background:linear-gradient(135deg,#f3e2b3,#c99a4c);color:#17130a;font-weight:700;text-decoration:none}
.list a{font:700 22px/1.25 Georgia,serif;color:#fff;text-decoration:none}.list li{list-style:none;margin:0 0 26px}.list{padding:0;margin:24px 0 0}
footer{margin-top:44px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1);font-size:15px}
`.replace(/\n/g, "");

interface Head { lang: SiteLang; title: string; description: string; canonical?: string; alternates: SeoPage["alternates"]; jsonLd: unknown[]; article?: boolean }

function document(f: SeoFacts, head: Head, main: string, otherHref: string | undefined): string {
  const w = UI[head.lang];
  const image = `${f.origin}/img/hero-luxury.jpg`;
  return [
    `<!doctype html>`,
    `<html lang="${head.lang}">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`,
    `<meta name="theme-color" content="#0b1020" />`,
    `<link rel="icon" type="image/png" href="/favicon.png" />`,
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.description)}" />`,
    `<meta name="robots" content="${head.canonical ? "index, follow" : "noindex"}" />`,
    ...(head.canonical ? [`<link rel="canonical" href="${escapeHtml(head.canonical)}" />`] : []),
    ...head.alternates.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${escapeHtml(a.href)}" />`),
    `<meta property="og:type" content="${head.article ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="Safehubby" />`,
    `<meta property="og:title" content="${escapeHtml(head.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(head.description)}" />`,
    ...(head.canonical ? [`<meta property="og:url" content="${escapeHtml(head.canonical)}" />`] : []),
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...head.jsonLd.map((data) => `<script type="application/ld+json">${jsonForScript(data)}</script>`),
    `<style>${CSS}</style>`,
    `</head>`,
    `<body><div class="wrap">`,
    `<header class="top"><a class="brand" href="${HOME[head.lang]}">Safehubby</a><nav><a href="${BLOG[head.lang]}">Blog</a>${otherHref ? ` · <a href="${escapeHtml(otherHref)}">${w.otherLanguage}</a>` : ""}</nav></header>`,
    `<main>${main}</main>`,
    `<footer><a href="${HOME[head.lang]}">${w.home}</a> · <a href="${BLOG[head.lang]}">${w.allArticles}</a> · <a href="${head.lang === "es" ? "/es/trabajo" : "/careers"}">${w.jobs}</a><p class="small">© ${new Date().getUTCFullYear()} Safehubby</p></footer>`,
    `</div></body></html>`,
  ].join("\n");
}

const alternates = (origin: string, en: string, es: string): SeoPage["alternates"] =>
  [{ hreflang: "en", href: `${origin}${en}` }, { hreflang: "es", href: `${origin}${es}` }, { hreflang: "x-default", href: `${origin}${en}` }];

const articlePath = (a: Article, lang: SiteLang) => `${BLOG[lang]}/${a.slug[lang]}`;
const newestFirst = (articles: readonly Article[]) => [...articles].sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));

function cta(lang: SiteLang): string {
  const w = UI[lang];
  return `<aside class="cta"><h2>${w.ctaTitle}</h2><p>${w.ctaText}</p><a class="btn" href="${HOME[lang]}">${w.ctaButton}</a></aside>`;
}

function indexPage(f: SeoFacts, lang: SiteLang, articles: readonly Article[]): string {
  const w = UI[lang];
  const list = newestFirst(articles).map((a) =>
    `<li><a href="${articlePath(a, lang)}">${escapeHtml(a.title[lang])}</a><p class="small">${longDate(a.publishedOn, lang)}</p><p>${escapeHtml(fill(a.description[lang], f))}</p></li>`).join("");
  const main = `<p class="eyebrow">Blog</p><h1>${w.blogTitle}</h1><p class="lead">${w.blogDescription}</p><ul class="list">${list}</ul>${cta(lang)}`;
  return document(f, {
    lang, title: `${w.blogTitle} | Safehubby`, description: w.blogDescription, canonical: `${f.origin}${BLOG[lang]}`,
    alternates: alternates(f.origin, BLOG.en, BLOG.es), jsonLd: [],
  }, main, BLOG[other(lang)]);
}

function articlePage(f: SeoFacts, lang: SiteLang, a: Article): string {
  const w = UI[lang];
  const url = `${f.origin}${articlePath(a, lang)}`;
  const description = fill(a.description[lang], f);
  const faq = a.faq?.length
    ? `<h2>${w.questions}</h2>${a.faq.map((x) => `<h3>${inline(x.q[lang], f)}</h3><p>${inline(x.a[lang], f)}</p>`).join("")}` : "";
  const sources = a.companies?.length
    ? `<h2>${w.sources}</h2><ul>${a.companies.map((c) => `<li><a href="${escapeHtml(c.source)}" rel="nofollow noopener">${escapeHtml(w.read(c.name, monthName(c.checked, lang)))}</a></li>`).join("")}</ul><p class="small">${w.fairness}</p>` : "";
  const dates = `${w.published} ${longDate(a.publishedOn, lang)}${a.updatedOn ? ` · ${w.updated} ${longDate(a.updatedOn, lang)}` : ""}`;
  const main = [
    `<article><p class="eyebrow">Blog · ${dates}</p>`,
    `<h1>${escapeHtml(a.title[lang])}</h1>`,
    `<p class="lead">${escapeHtml(description)}</p>`,
    ...a.blocks.map((b) => renderBlock(b, lang, f)),
    faq, sources, cta(lang), `</article>`,
  ].join("");
  const organization = { "@type": "Organization", name: "Safehubby", url: `${f.origin}/`, logo: `${f.origin}/apple-touch-icon.png` };
  const jsonLd: unknown[] = [{
    "@context": "https://schema.org", "@type": "BlogPosting", headline: a.title[lang], description,
    datePublished: a.publishedOn, dateModified: a.updatedOn ?? a.publishedOn, inLanguage: lang,
    mainEntityOfPage: url, image: `${f.origin}/img/hero-luxury.jpg`, author: organization, publisher: organization,
  }];
  if (a.faq?.length) {
    jsonLd.push({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: a.faq.map((x) => ({ "@type": "Question", name: fill(x.q[lang], f), acceptedAnswer: { "@type": "Answer", text: fill(x.a[lang], f) } })),
    });
  }
  return document(f, {
    lang, title: `${a.title[lang]} | Safehubby`, description, canonical: url, article: true,
    alternates: alternates(f.origin, articlePath(a, "en"), articlePath(a, "es")), jsonLd,
  }, main, articlePath(a, other(lang)));
}

export interface BlogResponse { status: 200 | 404; lang: SiteLang; html: string }

/** Whether an address belongs to the blog at all (so the server can skip the work for every other request). */
export const isBlogPath = (pathname: string): boolean => /^\/(es\/)?blog(\/|$)/.test(pathname.toLowerCase());

/** The blog page at an address, a 404 page for an article that does not exist, or null for an address that is not the blog's. */
export function blogPageFor(pathname: string, f: SeoFacts, articles: readonly Article[] = ARTICLES): BlogResponse | null {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  for (const lang of LANGS) {
    if (path === BLOG[lang]) return { status: 200, lang, html: indexPage(f, lang, articles) };
    if (!path.startsWith(`${BLOG[lang]}/`)) continue;
    const slug = path.slice(BLOG[lang].length + 1);
    const found = articles.find((a) => a.slug[lang] === slug);
    if (found) return { status: 200, lang, html: articlePage(f, lang, found) };
    const w = UI[lang];
    const main = `<h1>${w.notFound}</h1><p><a href="${BLOG[lang]}">${w.allArticles}</a></p>`;
    return { status: 404, lang, html: document(f, { lang, title: `${w.notFound} | Safehubby`, description: "", alternates: [], jsonLd: [] }, main, undefined) };
  }
  return null;
}

/** The blog's pages for the sitemap: the two indexes and each article in both languages. */
export function blogSitemapUrls(origin: string, articles: readonly Article[] = ARTICLES): { loc: string; alternates: SeoPage["alternates"] }[] {
  const pages = [{ en: BLOG.en, es: BLOG.es }, ...newestFirst(articles).map((a) => ({ en: articlePath(a, "en"), es: articlePath(a, "es") }))];
  return pages.flatMap((p) => LANGS.map((lang) => ({ loc: `${origin}${p[lang]}`, alternates: alternates(origin, p.en, p.es) })));
}
