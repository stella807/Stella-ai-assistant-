import { describe, expect, it } from "vitest";
import { ERRAND_TIERS, errandPayoutCents } from "@safehubby/core";
import {
  LAUNCH_WINDOW_START, PA_HOURLY_RATE_CENTS, SERVICE_LIVE_AT, findPlan, isPlanReleased,
  releasedPlans,
} from "@safehubby/core";
import {
  CONTACT_EMAIL, ERRAND_RUNNERS_HIRING, INCLUDED_GRABS_ENTRY, LANGS, errandTierRows, featuredPlans,
  formatPhone, mailtoHref, money, startingPriceCents, whatsappHref, whatsappLabel, type Lang,
} from "../src/content.ts";
import { HEADERS, STYLESHEET, THEME, obfuscate, renderPage, renderWorkPage, pathFor, workPathFor } from "../src/render.ts";

const pages: Record<Lang, string> = { en: renderPage("en"), es: renderPage("es") };
const work: Record<Lang, string> = { en: renderWorkPage("en"), es: renderWorkPage("es") };
const every = { ...pages, "en-work": work.en, "es-work": work.es };

describe("the marketing site", () => {
  it("renders both languages, each declaring its own", () => {
    expect(pages.en).toContain('<html lang="en">');
    expect(pages.es).toContain('<html lang="es">');
  });

  it("prints every featured plan's real price, in both languages", () => {
    // The reason this site is generated rather than hand-written. Premium has
    // been repriced three times; a hand-maintained page would still be quoting
    // the first number to somebody about to pay.
    for (const lang of LANGS) {
      for (const plan of featuredPlans()) {
        expect(pages[lang], `${plan.id} in ${lang}`).toContain(plan.name);
        if (plan.monthlyCents > 0) {
          expect(pages[lang], `${plan.id} price in ${lang}`).toContain(money(plan.monthlyCents));
        }
      }
    }
  });

  it("shows every released tier, not a hand-picked few", () => {
    // The span from a $3 errand to $60,000 a month is the product, not an
    // embarrassment to hide. An earlier version showed three of seven, which
    // solved the wrong problem: the wall was vertical, so the fix was to lay
    // it sideways — see `.plan-rail`.
    for (const lang of LANGS) {
      const cards = pages[lang].match(/class="plan"/g) ?? [];
      expect(cards, `plan cards in ${lang}`).toHaveLength(releasedPlans().length);
      expect(featuredPlans().map((p) => p.id)).toEqual(releasedPlans().map((p) => p.id));
    }
  });

  it("prints the Elite ladder's real prices too", () => {
    for (const lang of LANGS) {
      for (const id of ["elite", "elite-signature", "elite-private"] as const) {
        if (!isPlanReleased(id)) continue;
        const plan = findPlan(id);
        expect(pages[lang], `${id} price in ${lang}`).toContain(money(plan.monthlyCents));
      }
    }
  });

  it("lays the tiers out as a rail that scrolls without script", () => {
    // A carousel that needs JavaScript is a carousel this page cannot have.
    for (const lang of LANGS) {
      expect(pages[lang], `rail in ${lang}`).toContain('class="plan-rail"');
      // Reachable by keyboard, or it cannot be scrolled by keyboard.
      expect(pages[lang], `rail focusable in ${lang}`).toMatch(/class="plan-rail"[^>]*tabindex="0"/);
    }
  });

  it("quotes each task's starting price from the rate card", () => {
    // Same reason the plan prices come from core: a page that invents its
    // own numbers is a page that quotes a stale one to somebody about to pay.
    for (const lang of LANGS) {
      for (const cat of ["grab-something", "run-errand", "wait-with-someone", "check-in-person"] as const) {
        expect(pages[lang], `${cat} price in ${lang}`).toContain(money(startingPriceCents(cat)));
      }
    }
  });

  it("prices a grab from $0, because the entry plan includes it", () => {
    // Said only because it is true: the app charges no fee on the first grabs
    // of the month on Premium, the cheapest plan that can order an errand
    // while Free's are paused. If the allowance ever goes, this fails rather
    // than leaving the page promising a price nobody can get.
    expect(startingPriceCents("grab-something")).toBe(0);
    expect(INCLUDED_GRABS_ENTRY).toBeGreaterThan(0);
    for (const lang of LANGS) {
      const fromWord = lang === "en" ? "from" : "desde";
      expect(pages[lang], `grab from $0 in ${lang}`).toContain(`${fromWord} $0`);
      expect(pages[lang], `allowance in ${lang}`).toContain(String(INCLUDED_GRABS_ENTRY));
    }
  });

  it("lists the four errand sizes with the fee the app charges for each", () => {
    for (const lang of LANGS) {
      for (const row of errandTierRows(lang)) {
        expect(pages[lang], `${row.id} in ${lang}`).toContain(money(row.feeCents));
        expect(pages[lang], `${row.label} in ${lang}`).toContain(row.label);
      }
      expect(errandTierRows(lang)).toHaveLength(4);
    }
    // Dearer work costs more, in the order the list reads.
    const fees = errandTierRows("en").map((r) => r.feeCents);
    expect(fees[1]!).toBeGreaterThan(fees[0]!);
    expect(fees[2]!).toBeGreaterThan(fees[1]!);
  });

  it("does not offer the Free plan while it is held back", () => {
    // The page sells what the app offers. With `free-tier` off the app refuses
    // a Free sign-up, so no card, no "Start free" button, no "always free".
    for (const lang of LANGS) {
      expect(pages[lang], lang).not.toMatch(/<h3>Free<\/h3>/);
      expect(pages[lang], lang).not.toMatch(/Start free|Empieza gratis|Always free|Siempre gratis/);
      const cards = pages[lang].match(/class="plan"/g) ?? [];
      expect(cards, lang).toHaveLength(releasedPlans().length);
    }
    expect(releasedPlans().map((p) => p.id)).not.toContain("free");
  });

  it("says how many plans there are from what is actually on offer", () => {
    expect(pages.en).toContain(["Six"][0]! + " plans");
    expect(pages.es).toContain("Seis planes");
    expect(releasedPlans()).toHaveLength(6);
  });

  it("never claims an errand is free", () => {
    // Only the one-thing grab is included. The hero once said "a $3 errand is
    // on the free plan", which hid a $5 fee behind the price of the juice.
    for (const lang of LANGS) {
      expect(pages[lang], lang).not.toMatch(/\$3 errand|three-dollar errand|diligencia de (\$3|tres d[oó]lares)/i);
      expect(startingPriceCents("run-errand")).toBeGreaterThan(0);
    }
  });

  it("never mentions the Wingman Club: it is by invitation, not advertised", () => {
    for (const lang of LANGS) {
      expect(pages[lang], lang).not.toMatch(/wingman/i);
    }
  });

  it("says who it is really for before it lists what it sells", () => {
    // The person in a hospital bed at nine at night is the brief. If the page
    // ever stops naming them, it has drifted into selling a lifestyle app.
    expect(pages.en.toLowerCase()).toContain("hospital");
    expect(pages.es.toLowerCase()).toContain("hospital");
  });

  it("never advertises a plan the app has not released", () => {
    // Elite sits behind a revenue threshold. Selling it on a website while the
    // app refuses to sell it is the exact failure this guards.
    for (const [name, body] of Object.entries(every)) {
      for (const plan of ["free", "premium-basic", "premium-plus", "family", "elite",
        "elite-signature", "elite-private"] as const) {
        if (!isPlanReleased(plan)) {
          expect(body, `${plan} leaked into ${name}`).not.toContain(findPlan(plan).name);
        }
      }
    }
  });

  it("features only plans the app has actually released", () => {
    const released = new Set(releasedPlans().map((p) => p.id));
    for (const plan of featuredPlans()) expect(released.has(plan.id), plan.id).toBe(true);
  });

  it("states the service-live date from the code, not from memory", () => {
    // October 1 is when sign-ups open; the service is live on SERVICE_LIVE_AT,
    // two months later. Conflating them is a promise the business cannot keep.
    const live = new Date(SERVICE_LIVE_AT);
    const open = new Date(LAUNCH_WINDOW_START);
    expect(live.getTime()).toBeGreaterThan(open.getTime());

    const liveYear = String(live.getUTCFullYear());
    expect(pages.en).toContain(`December 1, ${liveYear}`);
    expect(pages.es).toContain(`1 de diciembre de ${liveYear}`);
  });

  it("carries the two lines that are not optional, on every page", () => {
    for (const [name, body] of Object.entries(every)) {
      const notEmergency = name.startsWith("es") ? "no es un servicio de emergencia" : "not an emergency service";
      const forming = name.startsWith("es") ? "está en proceso de formación" : "is in formation";
      expect(body.toLowerCase(), `emergency disclaimer in ${name}`).toContain(notEmergency);
      expect(body, `entity disclosure in ${name}`).toContain(forming);
    }
  });

  it("points each language at the other, and at itself as canonical", () => {
    expect(pages.en).toContain('hreflang="es"');
    expect(pages.es).toContain('hreflang="en"');
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).toContain('rel="canonical"');
    }
  });

  it("needs no JavaScript to be read", () => {
    // The point of building this separately from apps/web. If a <script> ever
    // appears here, the page has stopped being readable before a bundle loads
    // — and stopped being indexable.
    for (const [name, body] of Object.entries(every)) expect(body, name).not.toContain("<script");
  });
});

describe("reaching a person", () => {
  /** The page as a browser reads it: character references decoded. */
  const decoded = (html: string) =>
    html.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

  it("keeps the address off the page until somebody asks for it", () => {
    // Behind a Contact control, and not written out where a harvester
    // matching `name@domain.tld` in the raw HTML would find it.
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).not.toContain(CONTACT_EMAIL);
      expect(body, name).not.toContain("mailto:");
      expect(body, name).not.toContain("@");
    }
  });

  it("still gives a working address once it is opened", () => {
    for (const [name, body] of Object.entries(every)) {
      const page = decoded(body);
      expect(page, name).toContain(`href="${mailtoHref(CONTACT_EMAIL)}"`);
      expect(page, name).toContain(`>${CONTACT_EMAIL}<`);
    }
  });

  it("puts the control in the header, so it is one tap from anywhere", () => {
    for (const lang of LANGS) {
      const header = pages[lang].slice(0, pages[lang].indexOf("</header>"));
      expect(header, lang).toContain("<details");
      expect(header, lang).toContain(lang === "en" ? "Contact" : "Contacto");
    }
  });

  it("reveals it with a native control, so it needs no script and works by keyboard", () => {
    // `details` and `summary` are focusable and operable without JavaScript.
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).toMatch(/<details[^>]*>\s*<summary>/);
      expect(body, name).not.toContain("<script");
    }
  });

  it("offers the email and nothing else to contact", () => {
    // Deliberately one route. The phone number was removed at the owner's
    // direction; it must not creep back in as a tel: link or printed digits.
    for (const [name, body] of Object.entries(every)) {
      expect(decoded(body), name).not.toContain("tel:");
      expect(body, name).not.toMatch(/\(939\)|939-245|9392450171/);
    }
  });

  it("builds a mailto link from an address", () => {
    expect(mailtoHref(" a@b.co ")).toBe("mailto:a@b.co");
    // Encoded as character references, which decode back to exactly the text.
    expect(obfuscate("a@b.co")).toBe("&#97;&#64;&#98;&#46;&#99;&#111;");
    expect(CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("formats a NANP number the way somebody would read it aloud, for WhatsApp", () => {
    expect(formatPhone("17875550147")).toBe("+1 (787) 555-0147");
    // Anything that is not a NANP number keeps its digits rather than being
    // forced into a shape it does not have.
    expect(formatPhone("34911223344")).toBe("+34911223344");
  });

  it("omits WhatsApp entirely until there is a real number", () => {
    // A dead wa.me link is worse than no link: the reader cannot tell it
    // failed, they just get a WhatsApp error and assume nobody is there.
    for (const [name, body] of Object.entries(every)) expect(body, name).not.toContain("wa.me");
  });

  it("builds a click-to-chat link WhatsApp will actually open", () => {
    expect(whatsappHref("1 (787) 555-0147")).toBe("https://wa.me/17875550147");
    expect(whatsappLabel("17875550147")).toBe("+1 (787) 555-0147");
    // A non-NANP number keeps its digits rather than being mangled into one.
    expect(whatsappLabel("34911223344")).toBe("+34911223344");
  });
});

describe("hiring lives on its own page", () => {
  it("keeps the pay rate off the page written for customers", () => {
    // Two audiences on one page makes both read past things meant for them.
    // Somebody deciding whether to trust us with their father does not need
    // to read what we pay.
    for (const lang of LANGS) {
      expect(pages[lang], lang).not.toContain(money(PA_HOURLY_RATE_CENTS));
    }
  });

  it("quotes the rate the payout schedule actually pays", () => {
    for (const lang of LANGS) {
      expect(work[lang], lang).toContain(money(PA_HOURLY_RATE_CENTS));
    }
  });

  it("gives each language's hiring page its own real URL", () => {
    expect(pathFor("en")).toBe("/");
    expect(pathFor("es")).toBe("/es/");
    expect(workPathFor("en")).toBe("/work/");
    expect(workPathFor("es")).toBe("/es/trabajo/");
  });

  it("is reachable from the page people actually land on", () => {
    for (const lang of LANGS) {
      expect(pages[lang], lang).toContain(`href="${workPathFor(lang)}"`);
    }
  });

  it("links each hiring page to the other language's hiring page", () => {
    expect(work.en).toContain(`href="${workPathFor("es")}"`);
    expect(work.es).toContain(`href="${workPathFor("en")}"`);
  });

  it("loads its stylesheet from the right depth", () => {
    // /work/ is one level down and /es/trabajo/ is two. A relative href that
    // is right on one page and wrong on another ships an unstyled page.
    expect(pages.en).toContain('href="site.css"');
    expect(pages.es).toContain('href="../site.css"');
    expect(work.en).toContain('href="../site.css"');
    expect(work.es).toContain('href="../../site.css"');
  });
});

describe("the page stays simple", () => {
  it("drops in-page jump links", () => {
    // A page short enough to scroll does not need a table of contents, and a
    // nav of four anchors was the first thing a phone reader met.
    for (const lang of LANGS) {
      const anchors = pages[lang].match(/href="#(?!main)/g) ?? [];
      expect(anchors, `jump links in ${lang}`).toHaveLength(0);
    }
  });

  it("stays under eight hundred and fifty words of body copy", () => {
    // 810 words was the measurement that started this, for a page that then
    // sold three tiers and no prices. It now sells seven, the Club, a
    // price per task and a priced list of errand sizes. The cap moves when
    // real content arrives and never to make room for prose.
    for (const lang of LANGS) {
      const words = pages[lang].replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean);
      expect(words.length, `words in ${lang}`).toBeLessThan(850);
    }
  });
});

describe("privacy of the page itself", () => {
  it("asks no third party for anything before the page renders", () => {
    // Fonts are self-hosted. Beyond the privacy argument (a visitor's IP
    // reaching a font CDN they never chose), this page's whole purpose is
    // being readable fast on a slow connection — and a webfont from another
    // origin is two round-trips before any text appears.
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).not.toContain("fonts.googleapis.com");
      expect(body, name).not.toContain("fonts.gstatic.com");
      // Nor anything else the browser would fetch. `rel="canonical"` and
      // `hreflang` are absolute on purpose — they are metadata, not loads —
      // so this looks only at links that pull a resource.
      expect(body, name).not.toMatch(/<link[^>]*rel="stylesheet"[^>]*href="https?:\/\//);
      expect(body, name).not.toMatch(/<link[^>]*rel="preconnect"/);
      expect(body, name).not.toMatch(/<(?:script|img)[^>]+src="https?:\/\//);
    }
  });

  it("escapes plan copy rather than interpolating it raw", () => {
    for (const [name, body] of Object.entries(every)) {
      // Plan blurbs contain em-dashes and apostrophes; none of them should
      // have produced a stray unescaped angle bracket in an attribute.
      expect(body, name).not.toMatch(/content="[^"]*<[^"]*"/);
    }
  });
});

describe("serving it from Cloudflare", () => {
  it("locks the page to its own origin, which it can afford because it loads nothing else", () => {
    const csp = /Content-Security-Policy: (.+)/.exec(HEADERS)![1]!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("holds the pages to the policy it sends", () => {
    // A policy with 'unsafe-inline' left out blocks inline style attributes.
    // Fail here, not in a visitor's browser.
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).not.toMatch(/\sstyle="/);
      expect(body, name).not.toMatch(/<style[\s>]/);
    }
  });

  it("revalidates the HTML so a price change shows on the next deploy", () => {
    expect(HEADERS).toMatch(/\/\*\n[\s\S]*?Cache-Control: public, max-age=0, must-revalidate/);
  });

  it("points the sign-up buttons at wherever the app runs, not a fixed address", async () => {
    // Set at build time, because the address changes when the domain arrives.
    const prior = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.test";
    try {
      const { vi } = await import("vitest");
      vi.resetModules();
      const { renderPage: fresh } = await import("../src/render.ts");
      expect(fresh("en")).toContain('href="https://app.example.test"');
    } finally {
      if (prior === undefined) delete process.env.APP_URL; else process.env.APP_URL = prior;
    }
  });
});

describe("what the hiring pages promise", () => {
  it("does not promise insurance nobody has bought", () => {
    // 'Liability insurance from day one' tells somebody deciding whether to
    // take a job that they are covered while working. Until a policy is bound
    // (`insurance-in-place`) that is a promise with nothing behind it.
    for (const lang of LANGS) {
      expect(work[lang], `${lang} work page`).not.toMatch(/insurance|seguro de responsabilidad/i);
    }
  });

  it("still reads as whole sentences without it", () => {
    // The two sentences the insurance promise used to sit in must still end
    // properly with it gone, whichever roles are open.
    expect(work.en).toContain("Texas and Los Angeles.");
    expect(work.es).toContain("Texas y Los Ángeles.");
    for (const lang of LANGS) expect(work[lang], lang).not.toMatch(/,\s*\.|\s\.\s\./);
  });
});

describe("applying for a job", () => {
  it("advertises the jobs that are open and leaves out the ones on hold", () => {
    // Personal assistants are the hire; errand runners are on hold. A page that
    // still quoted a runner's pay would pull in applicants for a job nobody is
    // hiring. If runners reopen, the pay must come from the tiers, not a typed
    // number — checked here too.
    for (const lang of LANGS) {
      expect(work[lang], lang).toContain(money(PA_HOURLY_RATE_CENTS));
      const rates = ERRAND_TIERS.map((t) => errandPayoutCents(t.id));
      if (ERRAND_RUNNERS_HIRING) {
        expect(work[lang], lang).toContain(money(Math.min(...rates)));
        expect(work[lang], lang).toContain(money(Math.max(...rates)));
      } else {
        expect(work[lang], lang).not.toMatch(/per errand|por diligencia/i);
      }
      expect(work[lang], lang).not.toMatch(/per quick task|por tarea rápida/);
    }
  });

  it("sends the hiring page's button to the application, not the customer landing page", async () => {
    // The place that advertises the job has to put a person on the form.
    for (const lang of LANGS) {
      expect(work[lang], lang).toMatch(/href="[^"]*\/#careers"/);
    }
    // And the home page's sign-up button stays a customer's way in.
    expect(pages.en).not.toMatch(/class="btn" href="[^"]*#careers"/);
  });

  it("builds the careers link from wherever the app runs", async () => {
    const prior = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.test/";
    try {
      const { vi } = await import("vitest");
      vi.resetModules();
      const { CAREERS_URL } = await import("../src/content.ts");
      expect(CAREERS_URL).toBe("https://app.example.test/#careers");
    } finally {
      if (prior === undefined) delete process.env.APP_URL; else process.env.APP_URL = prior;
    }
  });
});

describe("the look", () => {
  // WCAG 2.x relative luminance and contrast ratio.
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it("keeps body text at AAA contrast, because many readers are over seventy", () => {
    // 7:1 is WCAG's enhanced level. A futuristic page that a 78-year-old cannot
    // read is a worse page; this fails the build before it fails him.
    for (const bg of [THEME.paper, THEME.paper2]) {
      expect(contrast(THEME.ink, bg), `ink on ${bg}`).toBeGreaterThanOrEqual(7);
      expect(contrast(THEME.inkSoft, bg), `soft ink on ${bg}`).toBeGreaterThanOrEqual(7);
    }
  });

  it("keeps the accent colours legible as text", () => {
    for (const accent of [THEME.amber, THEME.cyan]) {
      expect(contrast(accent, THEME.paper), accent).toBeGreaterThanOrEqual(7);
      expect(contrast(accent, THEME.paper2), accent).toBeGreaterThanOrEqual(7);
    }
    // Violet is used for small uppercase labels only.
    expect(contrast(THEME.violet, THEME.paper2)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the button's text readable across its whole gradient", () => {
    for (const end of [THEME.amber, THEME.coral]) {
      expect(contrast(THEME.onAccent, end), end).toBeGreaterThanOrEqual(7);
    }
  });

  it("builds its colours from the tokens, so the test is about what ships", () => {
    for (const hex of Object.values(THEME)) expect(STYLESHEET.toLowerCase()).toContain(hex.toLowerCase());
  });

  it("stops moving for anyone who has asked for less motion", () => {
    expect(STYLESHEET).toContain("prefers-reduced-motion: reduce");
    // Any animation has to be switched off by that rule.
    expect(STYLESHEET).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*animation: none/);
  });

  it("loads nothing from anywhere else, however it looks", () => {
    // Gradients only. No image, no remote font, no url() to another origin.
    expect(STYLESHEET).not.toMatch(/url\(\s*["']?https?:/);
    expect(STYLESHEET).not.toContain("@import");
  });
});
