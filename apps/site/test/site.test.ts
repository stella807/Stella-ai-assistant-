import { describe, expect, it } from "vitest";
import {
  LAUNCH_WINDOW_START, PA_HOURLY_RATE_CENTS, SERVICE_LIVE_AT, findPlan, isPlanReleased,
  releasedPlans,
} from "@safehubby/core";
import { LANGS, money, type Lang } from "../src/content.ts";
import { renderPage } from "../src/render.ts";

const pages: Record<Lang, string> = { en: renderPage("en"), es: renderPage("es") };

describe("the marketing site", () => {
  it("renders both languages, each declaring its own", () => {
    expect(pages.en).toContain('<html lang="en">');
    expect(pages.es).toContain('<html lang="es">');
  });

  it("prints every released plan's real price, in both languages", () => {
    // The reason this site is generated rather than hand-written. Premium has
    // been repriced three times; a hand-maintained page would still be quoting
    // the first number to somebody about to pay.
    for (const lang of LANGS) {
      for (const plan of releasedPlans()) {
        expect(pages[lang], `${plan.id} in ${lang}`).toContain(plan.name);
        if (plan.monthlyCents > 0) {
          expect(pages[lang], `${plan.id} price in ${lang}`).toContain(money(plan.monthlyCents));
        }
      }
    }
  });

  it("never advertises a plan the app has not released", () => {
    // Elite sits behind a revenue threshold. Selling it on a website while the
    // app refuses to sell it is the exact failure this guards.
    for (const lang of LANGS) {
      if (!isPlanReleased("elite")) {
        expect(pages[lang], `elite leaked into ${lang}`).not.toContain(findPlan("elite").name);
      }
    }
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

  it("quotes the assistant rate the payout schedule actually pays", () => {
    for (const lang of LANGS) {
      expect(pages[lang], lang).toContain(money(PA_HOURLY_RATE_CENTS));
    }
  });

  it("carries the two lines that are not optional", () => {
    for (const lang of LANGS) {
      const notEmergency = lang === "en" ? "not an emergency service" : "no es un servicio de emergencia";
      const forming = lang === "en" ? "is in formation" : "está en proceso de formación";
      expect(pages[lang].toLowerCase(), `emergency disclaimer in ${lang}`).toContain(notEmergency);
      expect(pages[lang], `entity disclosure in ${lang}`).toContain(forming);
    }
  });

  it("points each language at the other, and at itself as canonical", () => {
    expect(pages.en).toContain('hreflang="es"');
    expect(pages.es).toContain('hreflang="en"');
    for (const lang of LANGS) expect(pages[lang], lang).toContain('rel="canonical"');
  });

  it("needs no JavaScript to be read", () => {
    // The point of building this separately from apps/web. If a <script> ever
    // appears here, the page has stopped being readable before a bundle loads
    // — and stopped being indexable.
    for (const lang of LANGS) expect(pages[lang], lang).not.toContain("<script");
  });

  it("escapes plan copy rather than interpolating it raw", () => {
    for (const lang of LANGS) {
      const body = pages[lang];
      // Plan blurbs contain em-dashes and apostrophes; none of them should
      // have produced a stray unescaped angle bracket in an attribute.
      expect(body, lang).not.toMatch(/content="[^"]*<[^"]*"/);
    }
  });
});
