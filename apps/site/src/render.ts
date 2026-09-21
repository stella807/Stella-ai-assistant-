import { APP_URL, CONTACT_EMAIL, COPY, ORIGIN, money, plansFor, type Lang } from "./content.ts";

/**
 * The marketing site, rendered to plain HTML at build time.
 *
 * Deliberately no client-side framework and no JavaScript required to read
 * anything. The app at `apps/web` ships ~450KB of JS because it is an
 * application; this is a page somebody's mother opens on a phone on a slow
 * connection in Bayamón, and it has to be legible before a bundle downloads.
 * That is also what makes it indexable, which the app is not.
 *
 * One page per language rather than a language toggle, so each has a real
 * URL that can be linked, printed and indexed separately.
 */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Where a language's page lives. English is the root. */
export function pathFor(lang: Lang): string {
  return lang === "en" ? "/" : "/es/";
}

function head(lang: Lang): string {
  const c = COPY[lang];
  const canonical = `${ORIGIN}${pathFor(lang)}`;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${ORIGIN}/">
<link rel="alternate" hreflang="es" href="${ORIGIN}/es/">
<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Source+Sans+3:wght@400;600;700&display=swap">
<link rel="stylesheet" href="${lang === "en" ? "" : "../"}site.css">`;
}

function planCard(lang: Lang, plan: ReturnType<typeof plansFor>[number]): string {
  const c = COPY[lang];
  const price = plan.monthlyCents === 0
    ? `<span class="plan-free">${esc(c.freeLabel)}</span>`
    : `<span class="plan-price">${esc(money(plan.monthlyCents))}</span><span class="plan-per">${esc(c.perMonth)}</span>`;
  const seats = plan.seats === 1 ? c.seatsOne : c.seatsMany(plan.seats);
  return `<article class="plan">
  <h3>${esc(plan.name)}</h3>
  <p class="plan-cost">${price}</p>
  <p class="plan-seats">${esc(seats)}</p>
  <p class="plan-blurb">${esc(plan.blurb)}</p>
</article>`;
}

export function renderPage(lang: Lang): string {
  const c = COPY[lang];
  const plans = plansFor();

  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
${head(lang)}
</head>
<body>
<a class="skip" href="#main">${lang === "es" ? "Ir al contenido" : "Skip to content"}</a>

<header class="site-head">
  <div class="bar">
    <a class="wordmark" href="${pathFor(lang)}">Safehubby<span class="dot">.</span></a>
    <nav aria-label="${lang === "es" ? "Principal" : "Main"}">
      <a href="#what">${esc(c.nav.what)}</a>
      <a href="#pricing">${esc(c.nav.pricing)}</a>
      <a href="#work">${esc(c.nav.work)}</a>
      <a href="#contact">${esc(c.nav.contact)}</a>
      <a class="lang" href="${c.otherLang.href}" hreflang="${lang === "en" ? "es" : "en"}">${esc(c.otherLang.label)}</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="hero">
    <p class="eyebrow">${esc(c.heroEyebrow)}</p>
    <h1>${esc(c.heroTitle)}</h1>
    <p class="hero-body">${esc(c.heroBody)}</p>
    <p class="hero-cta">
      <a class="btn" href="${APP_URL}">${esc(c.heroCta)}</a>
    </p>
    <p class="hero-note">${esc(c.heroCtaNote)}</p>
  </section>

  <section id="what" class="band">
    <h2>${esc(c.whatHeading)}</h2>
    <p class="lede">${esc(c.whatLede)}</p>
    <div class="services">
      ${c.services.map((s) => `<article class="service">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
      </article>`).join("\n      ")}
    </div>
  </section>

  <section id="who" class="bleed bleed-quiet">
    <div class="band">
      <h2>${esc(c.whoHeading)}</h2>
      ${c.whoBody.map((p) => `<p class="wide">${esc(p)}</p>`).join("\n      ")}
    </div>
  </section>

  <section id="pricing" class="band">
    <h2>${esc(c.pricingHeading)}</h2>
    <p class="lede">${esc(c.pricingLede)}</p>
    <div class="plans">
      ${plans.map((p) => planCard(lang, p)).join("\n      ")}
    </div>
    <p class="note">${esc(c.discountNote)}</p>
  </section>

  <section id="work" class="bleed bleed-accent">
    <div class="band">
      <h2>${esc(c.workHeading)}</h2>
      <p class="lede">${esc(c.workLede)}</p>
      <p class="rate">${esc(c.workRate)}</p>
      <p class="wide">${esc(c.workErrand)}</p>
      <p><a class="btn btn-quiet" href="${APP_URL}">${esc(c.workCta)}</a></p>
    </div>
  </section>

  <section id="when" class="bleed bleed-quiet">
    <div class="band">
      <h2>${esc(c.whenHeading)}</h2>
      <p class="wide">${esc(c.whenBody)}</p>
    </div>
  </section>

  <section id="contact" class="band">
    <h2>${esc(c.contactHeading)}</h2>
    <p class="lede">${esc(c.contactBody)}</p>
    <p class="contact-mail"><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  </section>
</main>

<footer class="site-foot">
  <p class="disclaimer">${esc(c.disclaimer)}</p>
  <p class="privacy">${esc(c.footerNote)}</p>
  <p class="copy">&copy; ${new Date().getUTCFullYear()} Safehubby</p>
</footer>
</body>
</html>
`;
}

/** One stylesheet, shared by both languages. */
export const STYLESHEET = `:root {
  --paper: #fbf8f3;
  --paper-2: #f2eee5;
  --ink: #14203a;
  --ink-soft: #4a5570;
  --amber: #b9791a;
  --amber-wash: #f7eeda;
  --rule: #ddd6c8;
  --display: "Archivo Black", "Arial Black", Impact, system-ui, sans-serif;
  --body: "Source Sans 3", "Segoe UI", system-ui, -apple-system, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0f1828;
    --paper-2: #162034;
    --ink: #f3efe7;
    --ink-soft: #a7b1c7;
    --amber: #e2a641;
    --amber-wash: #241c0d;
    --rule: #2a3450;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--body);
  /* Larger than a typical site on purpose: a lot of these readers are over 70. */
  font-size: 18px;
  line-height: 1.55;
  -webkit-text-size-adjust: 100%;
}
.skip {
  position: absolute; left: -9999px;
  background: var(--ink); color: var(--paper); padding: 10px 16px; z-index: 10;
}
.skip:focus { left: 8px; top: 8px; }
a { color: var(--amber); }
:where(a, .btn):focus-visible { outline: 3px solid var(--amber); outline-offset: 3px; }

/* ---------- Head ---------- */
.site-head { border-bottom: 1px solid var(--rule); background: var(--paper); }
.bar {
  max-width: 1080px; margin: 0 auto;
  padding: 14px 20px;
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
}
.wordmark {
  font-family: var(--display); font-size: 25px; letter-spacing: -0.02em;
  color: var(--ink); text-decoration: none;
}
.dot { color: var(--amber); }
.site-head nav { display: flex; gap: 18px; flex-wrap: wrap; font-size: 16px; font-weight: 600; }
.site-head nav a { color: var(--ink-soft); text-decoration: none; }
.site-head nav a:hover { color: var(--ink); }
.site-head nav a.lang { color: var(--amber); }

/* ---------- Hero ---------- */
.hero { max-width: 1080px; margin: 0 auto; padding: 56px 20px 48px; }
.eyebrow {
  margin: 0 0 14px; font-size: 13px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--amber);
}
h1 {
  font-family: var(--display);
  font-size: clamp(34px, 6.2vw, 62px);
  line-height: 1.02; letter-spacing: -0.028em;
  margin: 0; max-width: 17ch; text-wrap: balance;
}
.hero-body { font-size: clamp(18px, 2.3vw, 21px); color: var(--ink-soft); max-width: 58ch; margin: 20px 0 0; }
.hero-cta { margin: 28px 0 0; }
.hero-note { margin: 12px 0 0; font-size: 16px; color: var(--ink-soft); max-width: 52ch; }
.btn {
  display: inline-block;
  background: var(--amber); color: #1b1305;
  font-family: var(--display); font-size: 19px; letter-spacing: -0.01em;
  padding: 15px 30px; border-radius: 10px; text-decoration: none;
}
.btn-quiet { background: var(--ink); color: var(--paper); }

/* ---------- Bands ---------- */
.band { max-width: 1080px; margin: 0 auto; padding: 46px 20px; border-top: 1px solid var(--rule); }
/* A tinted band runs edge to edge; the .band inside keeps the page's gutter,
   so every section's text starts on the same line whatever the background. */
.bleed > .band { border-top: none; }
.bleed-quiet { background: var(--paper-2); }
.bleed-accent { background: var(--amber-wash); }
h2 {
  font-family: var(--display);
  font-size: clamp(25px, 3.6vw, 34px); line-height: 1.1; letter-spacing: -0.022em;
  margin: 0 0 10px; text-wrap: balance;
}
.lede { font-size: 19px; color: var(--ink-soft); max-width: 62ch; margin: 0 0 26px; }
.wide { max-width: 64ch; color: var(--ink-soft); margin: 0 0 14px; }
.note { margin: 24px 0 0; font-size: 16.5px; color: var(--ink-soft); max-width: 64ch; }

/* ---------- Services ---------- */
.services { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 22px 30px; }
.service h3 { font-family: var(--display); font-size: 19px; letter-spacing: -0.015em; margin: 0 0 6px; }
.service p { margin: 0; color: var(--ink-soft); font-size: 17px; }

/* ---------- Plans ---------- */
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
.plan {
  background: var(--paper); border: 1px solid var(--rule); border-radius: 12px;
  padding: 22px 22px 24px; display: flex; flex-direction: column; gap: 4px;
}
.plan h3 { font-family: var(--display); font-size: 21px; letter-spacing: -0.015em; margin: 0; }
.plan-cost { margin: 6px 0 0; font-variant-numeric: tabular-nums; }
.plan-price { font-family: var(--display); font-size: 34px; letter-spacing: -0.03em; }
.plan-per { font-size: 16px; color: var(--ink-soft); font-weight: 600; }
.plan-free { font-family: var(--display); font-size: 25px; color: var(--amber); letter-spacing: -0.02em; }
.plan-seats {
  margin: 2px 0 10px; font-size: 13px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft);
}
.plan-blurb { margin: 0; font-size: 16px; color: var(--ink-soft); }

/* ---------- Work ---------- */
.rate {
  font-family: var(--display); font-size: clamp(25px, 4.4vw, 36px);
  letter-spacing: -0.025em; margin: 0 0 12px;
}

.contact-mail { font-family: var(--display); font-size: clamp(20px, 3.4vw, 28px); letter-spacing: -0.02em; margin: 0; }
.contact-mail a { text-decoration: none; word-break: break-all; }

/* ---------- Foot ---------- */
.site-foot {
  border-top: 1px solid var(--rule);
  max-width: 1080px; margin: 0 auto; padding: 32px 20px 56px;
  font-size: 15px; color: var(--ink-soft);
}
.site-foot p { max-width: 74ch; margin: 0 0 10px; }
.copy { font-weight: 600; }
`;
