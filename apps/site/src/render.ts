import {
  APP_URL, CAREERS_URL, CONTACT_EMAIL, COPY, ORIGIN, WHATSAPP, WORK_COPY, clubDuesRangeCents, clubExperiences, errandTierRows,
  featuredPlans, mailtoHref, money, startingPriceCents, whatsappHref,
  whatsappLabel, type Lang,
} from "./content.ts";

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
 * URL that can be linked, printed and indexed separately. Hiring gets its own
 * page for the same reason, plus a better one: it is a different audience.
 */

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Where a language's home page lives. English is the root. */
export function pathFor(lang: Lang): string {
  return lang === "en" ? "/" : "/es/";
}

/** Where a language's hiring page lives. Translated, because a job seeker
 *  searching in Spanish should land on a Spanish URL. */
export function workPathFor(lang: Lang): string {
  return lang === "en" ? "/work/" : "/es/trabajo/";
}

/** How far a page sits from the root, for relative asset hrefs. `/es/trabajo/`
 *  is two levels down; getting this wrong ships an unstyled page. */
function upTo(path: string): string {
  return "../".repeat(path.split("/").filter(Boolean).length);
}

interface PageMeta {
  lang: Lang;
  path: string;
  /** The same page in the other language, for hreflang. */
  altPath: string;
  htmlLang: string;
  title: string;
  description: string;
}

function head(meta: PageMeta): string {
  const canonical = `${ORIGIN}${meta.path}`;
  const other: Lang = meta.lang === "en" ? "es" : "en";
  const enHref = `${ORIGIN}${meta.lang === "en" ? meta.path : meta.altPath}`;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="${meta.lang}" href="${canonical}">
<link rel="alternate" hreflang="${other}" href="${ORIGIN}${meta.altPath}">
<link rel="alternate" hreflang="x-default" href="${enHref}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${upTo(meta.path)}site.css">`;
}

/**
 * Wordmark, the phone number, the other language. Three things.
 *
 * The number lives here rather than only in a contact section because it is
 * the one action this site exists to produce, and the previous layout put it
 * six thousand pixels down a phone screen.
 */
/**
 * An address written as numeric character references. A browser shows and
 * follows it exactly as it would the plain text; a harvester that matches
 * `@domain.tld` in the raw HTML does not find it. That is all this does — one
 * that decodes entities still will — and it needs no script, which this page
 * does not have. Genuinely hiding an address means not publishing it, which
 * is what a contact form with a server is for.
 */
export function obfuscate(text: string): string {
  return Array.from(text, (ch) => `&#${ch.codePointAt(0)};`).join("");
}

/** The address, behind a control that has to be opened. A native `details`
 *  element, so it works without script, by keyboard and with a screen reader. */
function revealEmail(label: string, cls: string): string {
  const addr = obfuscate(CONTACT_EMAIL);
  return `<details class="reveal ${cls}">
      <summary>${esc(label)}</summary>
      <a class="reveal-link" href="${obfuscate(mailtoHref(CONTACT_EMAIL))}">${addr}</a>
    </details>`;
}

function header(lang: Lang, home: string, otherHref: string, label: string): string {
  return `<header class="site-head">
  <div class="bar">
    <a class="wordmark" href="${home}">Safehubby<span class="dot">.</span></a>
    ${revealEmail(COPY[lang].contactLabel, "head-contact")}
    <a class="lang" href="${otherHref}" hreflang="${lang === "en" ? "es" : "en"}">${esc(label)}</a>
  </div>
</header>`;
}

function footer(lang: Lang, links: string): string {
  const c = COPY[lang];
  return `<footer class="site-foot">
  <p class="foot-links">${links}</p>
  <p class="disclaimer">${esc(c.disclaimer)}</p>
  <p class="privacy">${esc(c.footerNote)}</p>
  <p class="copy">&copy; ${new Date().getUTCFullYear()} Safehubby</p>
</footer>`;
}

function skip(lang: Lang): string {
  return `<a class="skip" href="#main">${lang === "es" ? "Ir al contenido" : "Skip to content"}</a>`;
}

function planCard(lang: Lang, plan: ReturnType<typeof featuredPlans>[number]): string {
  const c = COPY[lang];
  const price = plan.monthlyCents === 0
    ? `<span class="plan-free">${esc(c.freeLabel)}</span>`
    : `<span class="plan-price">${esc(money(plan.monthlyCents))}</span><span class="plan-per">${esc(c.perMonth)}</span>`;
  const seats = plan.seats === 1 ? c.seatsOne : c.seatsMany(plan.seats);
  const blurb = c.planBlurbs[plan.id] ?? "";
  return `<article class="plan">
  <h3>${esc(plan.name)}</h3>
  <p class="plan-cost">${price}</p>
  <p class="plan-seats">${esc(seats)}</p>
  <p class="plan-blurb">${esc(blurb)}</p>
</article>`;
}

export function renderPage(lang: Lang): string {
  const c = COPY[lang];
  const plans = featuredPlans();

  return `<!doctype html>
<html lang="${c.htmlLang}">
<head>
${head({
    lang, path: pathFor(lang), altPath: pathFor(lang === "en" ? "es" : "en"),
    htmlLang: c.htmlLang, title: c.title, description: c.description,
  })}
</head>
<body>
${skip(lang)}
${header(lang, pathFor(lang), c.otherLang.href, c.otherLang.label)}

<main id="main">
  <section class="hero">
    <p class="eyebrow">${esc(c.heroEyebrow)}</p>
    <h1>${esc(c.heroTitle)}</h1>
    <p class="hero-body">${esc(c.heroBody)}</p>
    <p class="hero-cta"><a class="btn" href="${APP_URL}">${esc(c.heroCta)}</a></p>
    <p class="hero-note">${esc(c.heroCtaNote)}</p>
  </section>

  <section class="bleed bleed-quiet">
    <div class="band">
      <h2>${esc(c.whatHeading)}</h2>
      <p class="lede">${esc(c.whatLede)}</p>
      <ul class="services">
        ${c.services.map((s) => {
          /* The price is read from the rate card, not written here. A
             marketing page quoting a stale number to somebody about to pay
             is the whole reason this site is generated. */
          const price = s.category
            ? `${esc(c.fromLabel)} ${esc(money(startingPriceCents(s.category)))}`
            : esc(s.priceNote ?? "");
          return `<li class="service">
          <h3>${esc(s.title)}</h3>
          ${price ? `<p class="service-price">${price}</p>` : ""}
          <p>${esc(s.body)}</p>
        </li>`;
        }).join("\n        ")}
      </ul>
      <h3 class="tiers-heading">${esc(c.tiersHeading)}</h3>
      <ul class="tiers">
        ${errandTierRows(lang).map((t) => `<li><span><strong>${esc(t.label)}</strong>
          <span class="tier-eg">${esc(t.example)} · ~${t.minutes} ${esc(c.minutesLabel)}</span></span>
          <span class="tier-fee">${esc(money(t.feeCents))}</span></li>`).join("\n        ")}
      </ul>
      <p class="note">${esc(c.tiersNote)}</p>
    </div>
  </section>

  <section class="band">
    <h2>${esc(c.pricingHeading)}</h2>
    <p class="lede">${esc(c.pricingLede)}</p>
    <!--
      A rail, not a grid. Seven tiers stacked vertically is a wall somebody
      scrolls past; side by side they are a ladder you can see the shape of.
      Scroll-snap does it natively — this page ships no JavaScript, and a
      hand-rolled swipe handler is how carousels end up fighting the scroll.
      The tabindex is there because a scrollable region has to be reachable
      by keyboard to be scrollable by keyboard.
    -->
    <div class="plan-rail" role="group" aria-label="${esc(c.pricingHeading)}" tabindex="0">
      ${plans.map((p) => planCard(lang, p)).join("\n      ")}
    </div>
    <p class="more-plans">${esc(c.morePlans)}</p>
    <p class="note">${esc(c.pricingNote)}</p>

    <!-- An add-on rather than a rung: it sits on top of whatever plan
         somebody is already on, so it is its own card below the ladder
         instead of an eighth tile in it. -->
    <aside class="club">
      <h3>${esc(c.clubHeading)}</h3>
      <p class="club-dues">${esc(
        c.clubDues
          .replace("{base}", money(clubDuesRangeCents().base))
          .replace("{low}", money(clubDuesRangeCents().low))
          .replace("{high}", money(clubDuesRangeCents().high)),
      )}</p>
      <p>${esc(c.clubBody)}</p>
      <p class="club-rotation"><strong>${esc(c.clubRotation)}</strong> ${esc(clubExperiences().join(" · "))}</p>
      <p class="small club-perk">${esc(c.clubPerk)}</p>
    </aside>
  </section>

  <section class="bleed bleed-accent">
    <div class="band">
      <h2>${esc(c.contactHeading)}</h2>
      <p class="lede">${esc(c.contactBody)}</p>
      ${revealEmail(c.contactShow, "contact-reveal")}
${WHATSAPP
  ? `      <p class="contact-wa"><a href="${whatsappHref(WHATSAPP)}">WhatsApp ${esc(whatsappLabel(WHATSAPP))}</a></p>`
  : ""}
    </div>
  </section>
</main>

${footer(lang, `<a href="${c.workHref}">${esc(c.workLink)}</a>`)}
</body>
</html>
`;
}

/**
 * The hiring page.
 *
 * Split off the home page because the two audiences want opposite things.
 * A daughter deciding whether to trust us with her father has no use for our
 * payroll; somebody looking for work should not have to read a sales pitch to
 * find the rate. It also gives a job ad a URL to point at.
 */
export function renderWorkPage(lang: Lang): string {
  const w = WORK_COPY[lang];
  const home = pathFor(lang);

  return `<!doctype html>
<html lang="${w.htmlLang}">
<head>
${head({
    lang, path: workPathFor(lang), altPath: workPathFor(lang === "en" ? "es" : "en"),
    htmlLang: w.htmlLang, title: w.title, description: w.description,
  })}
</head>
<body>
${skip(lang)}
${header(lang, home, w.otherLang.href, w.otherLang.label)}

<main id="main">
  <section class="band">
    <h1 class="work-title">${esc(w.heading)}</h1>
    <p class="lede">${esc(w.lede)}</p>
    <p class="rate">${esc(w.rate)}</p>
    <p class="wide">${esc(w.errand)}</p>
    <p><a class="btn" href="${CAREERS_URL}">${esc(w.cta)}</a></p>
  </section>
</main>

${footer(lang, `<a href="${home}">&larr; ${esc(w.back)}</a>`)}
</body>
</html>
`;
}

/** One stylesheet, shared by every page. */
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
  padding: 12px 20px;
  display: flex; align-items: center; gap: 12px 18px; flex-wrap: wrap;
}
.wordmark {
  font-family: var(--display); font-size: 24px; letter-spacing: -0.02em;
  color: var(--ink); text-decoration: none;
}
.dot { color: var(--amber); }
/* Pushed to the right of the wordmark and left of the language toggle, and
   never allowed to wrap mid-address. */
.head-contact {
  margin-left: auto; position: relative;
  font-family: var(--display); font-size: clamp(16px, 4.2vw, 20px);
  letter-spacing: -0.02em; white-space: nowrap;
}
.reveal summary { cursor: pointer; list-style: none; color: var(--amber); }
.reveal summary::-webkit-details-marker { display: none; }
.reveal summary:focus-visible { outline: 3px solid var(--amber); outline-offset: 3px; }
.reveal-link { color: var(--ink); text-decoration: none; overflow-wrap: anywhere; }
/* In the header the address opens as a small panel under the control, so
   opening it does not push the page down. */
.head-contact .reveal-link {
  position: absolute; right: 0; top: calc(100% + 10px); z-index: 5;
  background: var(--paper); border: 1px solid var(--rule); border-radius: 10px;
  padding: 12px 16px; font-family: var(--body); font-size: 17px; letter-spacing: 0; font-weight: 600;
  box-shadow: 0 6px 20px rgb(0 0 0 / 12%);
}
/* In the contact section it is the loud line, once asked for. */
.contact-reveal summary {
  display: inline-block; background: var(--ink); color: var(--paper);
  font-family: var(--display); font-size: 19px; letter-spacing: -0.01em;
  padding: 15px 30px; border-radius: 10px;
}
.contact-reveal .reveal-link {
  display: block; margin-top: 18px;
  font-family: var(--display); font-size: clamp(22px, 5.6vw, 44px);
  line-height: 1.1; letter-spacing: -0.03em; color: var(--amber);
}
.lang { font-size: 16px; font-weight: 600; text-decoration: none; }
/* All three have to share one row on a phone, or the number — the whole
   reason the header exists — gets pushed down by a language toggle. */
@media (max-width: 460px) {
  .bar { gap: 10px; padding: 11px 16px; }
  .wordmark { font-size: 20px; }
  .head-contact { font-size: 16px; }
  .lang { font-size: 14px; }
}
@media (max-width: 380px) {
  .bar { gap: 8px; padding: 10px 12px; }
  .wordmark { font-size: 18px; }
  .head-contact { font-size: 15px; }
  .lang { font-size: 13px; }
}

/* ---------- Hero ---------- */
.hero { max-width: 1080px; margin: 0 auto; padding: 44px 20px 40px; }
.eyebrow {
  margin: 0 0 12px; font-size: 13px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--amber);
}
h1 {
  font-family: var(--display);
  font-size: clamp(34px, 6.2vw, 62px);
  line-height: 1.02; letter-spacing: -0.028em;
  margin: 0; max-width: 17ch; text-wrap: balance;
}
.hero-body { font-size: clamp(18px, 2.3vw, 21px); color: var(--ink-soft); max-width: 56ch; margin: 18px 0 0; }
.hero-cta { margin: 26px 0 0; }
.hero-note { margin: 10px 0 0; font-size: 16px; color: var(--ink-soft); }
.btn {
  display: inline-block;
  background: var(--amber); color: #1b1305;
  font-family: var(--display); font-size: 19px; letter-spacing: -0.01em;
  padding: 15px 30px; border-radius: 10px; text-decoration: none;
}

/* ---------- Bands ---------- */
.band { max-width: 1080px; margin: 0 auto; padding: 38px 20px; }
/* A tinted band runs edge to edge; the .band inside keeps the page's gutter,
   so every section's text starts on the same line whatever the background. */
.bleed-quiet { background: var(--paper-2); }
.bleed-accent { background: var(--amber-wash); }
h2 {
  font-family: var(--display);
  font-size: clamp(25px, 3.6vw, 34px); line-height: 1.1; letter-spacing: -0.022em;
  margin: 0 0 18px; text-wrap: balance;
}
.lede { font-size: 19px; color: var(--ink-soft); max-width: 62ch; margin: 0 0 22px; }
.wide { max-width: 64ch; color: var(--ink-soft); margin: 0 0 20px; }
.note { margin: 18px 0 0; font-size: 16px; color: var(--ink-soft); max-width: 64ch; }

/* ---------- Services ---------- */
/* A list, because it is one. Six short rows read faster than six paragraphs,
   and the title carries the meaning on its own if the line below is skipped. */
.services {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px 32px;
}
.service h3 { font-family: var(--display); font-size: 18px; letter-spacing: -0.015em; margin: 0 0 2px; }
.tiers-heading { font-family: var(--display); font-size: 19px; letter-spacing: -0.015em; margin: 26px 0 8px; }
.tiers { list-style: none; margin: 0; padding: 0; max-width: 640px; }
.tiers li {
  display: flex; justify-content: space-between; align-items: baseline; gap: 14px;
  padding: 10px 0; border-bottom: 1px solid var(--rule);
}
.tier-eg { display: block; color: var(--ink-soft); font-size: 15px; }
.tier-fee { font-family: var(--display); font-size: 20px; white-space: nowrap; }
.service-price {
  margin: 0 0 3px !important; font-size: 14px; font-weight: 700;
  letter-spacing: 0.02em; color: var(--amber) !important;
}
.service p { margin: 0; color: var(--ink-soft); font-size: 16.5px; line-height: 1.45; }

/* ---------- Plans ---------- */
/* The rail bleeds to the page edge so a card is visibly cut off — that is
   the only affordance saying "there is more this way", and it has to work
   without script. The gutter is restored as scroll padding so the first
   card still lines up with every other section's text. */
.plan-rail {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 20px;
  margin-inline: -20px;
  padding: 4px 20px 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--rule) transparent;
}
.plan-rail:focus-visible { outline: 3px solid var(--amber); outline-offset: 2px; }
.plan {
  flex: 0 0 min(78%, 290px);
  scroll-snap-align: start;
  background: var(--paper); border: 1px solid var(--rule); border-radius: 12px;
  padding: 20px; display: flex; flex-direction: column; gap: 2px;
}
/* Past about five cards' worth of room there is nothing left to scroll, so
   the rail stops pretending and behaves as a row. */
@media (min-width: 1240px) {
  .plan-rail { flex-wrap: nowrap; }
  .plan { flex-basis: 1fr; }
}
.plan h3 { font-family: var(--display); font-size: 20px; letter-spacing: -0.015em; margin: 0; }
.plan-cost { margin: 6px 0 0; font-variant-numeric: tabular-nums; }
.plan-price { font-family: var(--display); font-size: 32px; letter-spacing: -0.03em; }
.plan-per { font-size: 16px; color: var(--ink-soft); font-weight: 600; }
.plan-free { font-family: var(--display); font-size: 24px; color: var(--amber); letter-spacing: -0.02em; }
.plan-seats {
  margin: 2px 0 8px; font-size: 13px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft);
}
.plan-blurb { margin: 0; font-size: 16px; color: var(--ink-soft); line-height: 1.45; }
.more-plans { margin: 16px 0 0; font-size: 16.5px; color: var(--ink-soft); }

/* ---------- The club ---------- */
.club {
  margin: 26px 0 0; padding: 22px;
  background: var(--paper-2); border: 1px solid var(--rule); border-radius: 12px;
}
.club h3 { font-family: var(--display); font-size: 22px; letter-spacing: -0.02em; margin: 0 0 8px; }
.club p { margin: 0 0 12px; color: var(--ink-soft); font-size: 16.5px; max-width: 64ch; }
.club p:last-child { margin-bottom: 0; }
.club-dues {
  font-family: var(--display); font-size: clamp(18px, 2.8vw, 22px);
  letter-spacing: -0.02em; color: var(--ink) !important;
}
.club-rotation { font-size: 16px !important; }
.club-perk { font-size: 15px !important; }

/* ---------- Work ---------- */
.work-title {
  font-size: clamp(30px, 5vw, 44px); margin: 0 0 16px; max-width: 20ch;
}
.rate {
  font-family: var(--display); font-size: clamp(25px, 4.4vw, 36px);
  letter-spacing: -0.025em; margin: 0 0 12px;
}

/* The address is the loudest thing in the section on purpose. */
.contact-wa {
  font-size: clamp(17px, 2.6vw, 20px); font-weight: 600;
  letter-spacing: -0.01em; margin: 10px 0 0;
}
.contact-wa a { text-decoration: none; word-break: break-all; }

/* ---------- Foot ---------- */
.site-foot {
  border-top: 1px solid var(--rule);
  max-width: 1080px; margin: 0 auto; padding: 26px 20px 48px;
  font-size: 14.5px; color: var(--ink-soft);
}
.site-foot p { max-width: 74ch; margin: 0 0 10px; }
.foot-links { font-size: 16px; font-weight: 600; }
.foot-links a { text-decoration: none; }
.copy { font-weight: 600; }
`;

/**
 * Response headers for Cloudflare's static hosting (`_headers` is read by
 * both Pages and Workers static assets).
 *
 * The page ships no script and no inline style, so the policy can be as
 * tight as it looks: nothing loads from anywhere but this origin, and
 * nothing can be framed, submitted or based elsewhere. A policy this strict
 * is only honest because the tests elsewhere in this package already hold
 * the page to it — see "needs no JavaScript" and "asks no third party for
 * anything". Add a third-party asset and those fail before this one does.
 *
 * Fonts are content-hashed by nobody, so they cache for a year but not as
 * `immutable`; a changed font would otherwise never reach a returning
 * visitor. The HTML revalidates every time, which is what lets a price change
 * reach the page on the next deploy rather than the next cache expiry.
 */
export const HEADERS = `/*
  Content-Security-Policy: default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Cache-Control: public, max-age=0, must-revalidate

/fonts/*
  Cache-Control: public, max-age=31536000

/site.css
  Cache-Control: public, max-age=3600
`;
