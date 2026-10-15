import { describe, expect, it } from "vitest";
import {
  LAUNCH_WINDOW_START, PA_HOURLY_RATE_CENTS, SERVICE_LIVE_AT, findPlan, isPlanReleased,
  releasedPlans,
} from "@safehubby/core";
import {
  FEATURED_PLAN_IDS, LANGS, PHONE, featuredPlans, formatPhone, money, phoneHref,
  whatsappHref, whatsappLabel, type Lang,
} from "../src/content.ts";
import { renderPage, renderWorkPage, pathFor, workPathFor } from "../src/render.ts";

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

  it("shows three plans rather than the whole ladder", () => {
    // Seven price cards, topping out at $60,000 a month, is not a price list
    // — it is a decision the reader cannot make. The ladder still exists and
    // is still sold; it is sold in the app, where somebody has already said
    // yes to the idea.
    expect(FEATURED_PLAN_IDS).toHaveLength(3);
    for (const lang of LANGS) {
      const cards = pages[lang].match(/class="plan"/g) ?? [];
      expect(cards, `plan cards in ${lang}`).toHaveLength(featuredPlans().length);
    }
  });

  it("keeps the Elite ladder's prices off the public page", () => {
    // Not a secret, but quoting five and six figures a month beside an $89.99
    // tier reads as a different company to the person this page is for.
    for (const lang of LANGS) {
      for (const id of ["elite", "elite-signature", "elite-private"] as const) {
        const plan = findPlan(id);
        expect(pages[lang], `${id} price leaked into ${lang}`)
          .not.toContain(money(plan.monthlyCents));
      }
    }
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
  it("puts the number in the header, not only at the foot of the page", () => {
    // The reader is often somebody's 78-year-old father, or a daughter who is
    // already worried. Making either scroll the whole page to find a phone
    // number is the single worst thing this site could do.
    for (const lang of LANGS) {
      const header = pages[lang].slice(0, pages[lang].indexOf("</header>"));
      expect(header, `phone in ${lang} header`).toContain(phoneHref(PHONE));
    }
  });

  it("offers a number to call, dialable, on every page", () => {
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).toContain(phoneHref(PHONE));
      expect(body, name).toContain(formatPhone(PHONE));
    }
  });

  it("offers the phone and nothing else to contact", () => {
    // Deliberately one route. Two ways to reach somebody is two decisions for
    // a reader who is already worried about a parent.
    for (const [name, body] of Object.entries(every)) {
      expect(body, name).not.toContain("mailto:");
    }
  });

  it("formats a Puerto Rico number the way somebody would read it aloud", () => {
    expect(formatPhone("19392450171")).toBe("+1 (939) 245-0171");
    expect(phoneHref("+1 (939) 245-0171")).toBe("tel:+19392450171");
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

  it("stays under five hundred words of body copy", () => {
    // 810 words was the measurement that started this. The cap is here so the
    // next good paragraph has to earn its place by displacing another.
    for (const lang of LANGS) {
      const words = pages[lang].replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean);
      expect(words.length, `words in ${lang}`).toBeLessThan(500);
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
