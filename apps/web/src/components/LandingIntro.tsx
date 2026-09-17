import { useRef, useState } from "react";
import { Carousel, type CarouselHandle } from "./Carousel.tsx";
import { LeadershipSection, MissionSection, WhatWeDoSection } from "./AboutScreen.tsx";
import { AuthScreen } from "./AuthScreen.tsx";
import { NewsletterSignup } from "./NewsletterSignup.tsx";
import { PublicPricing, PublicWorkerPay } from "./PublicPricing.tsx";
import { Footer } from "./Footer.tsx";
import { useLanguage, type TranslationKey } from "../i18n.tsx";
import { incomingReferralCode } from "../referral.ts";
import { launchNote } from "../launch.ts";
import type { Account, LaunchStatus } from "../api.ts";

const HOW_IT_WORKS: TranslationKey[] = ["how.step1", "how.step2", "how.step3", "how.step4"];

/** How long each slide holds before the carousel advances itself. Long
 *  enough to actually read a slide, not a slideshow on a timer. */
const AUTO_ADVANCE_MS = 7000;

/**
 * Everything a visitor sees before they have an account, as three slides they
 * can swipe through: who we are, sign up and how it works, and work with us.
 *
 * Swiping is the browser's own scroll-snap (see styles/carousel.css) rather
 * than a JS gesture handler — reimplementing touch scrolling is how carousels
 * end up fighting the phone. The dots and arrows scroll the same container.
 *
 * **It stops revolving the moment anyone touches it, permanently.** Slide two
 * holds the signup form, and a carousel that slides away from a half-typed
 * password is worse than no carousel at all. So the auto-advance is a
 * showcase for someone who has not engaged yet, and the first interaction of
 * any kind — a tap, a key, a focus, a manual swipe — hands control over for
 * good. It also never starts at all under `prefers-reduced-motion`, which is
 * exactly what that setting is asking for.
 */
export function LandingIntro({ onSignedIn, onDrive, onWorkWithUs, launch }: {
  onSignedIn: (account: Account) => void;
  /** Switches the app to the public driver application — App state, not a
   *  route, so it comes in as a callback rather than a link. */
  onDrive: () => void;
  /** Same, for the non-driving roles. */
  onWorkWithUs: () => void;
  /** Null until the catalog request lands, and while the API is unreachable.
   *  The banner simply does not render then, rather than claiming a promotion
   *  we have not confirmed is open. */
  launch: LaunchStatus | null;
}) {
  const { t, language } = useLanguage();
  const [startInSignup, setStartInSignup] = useState(false);
  const carousel = useRef<CarouselHandle>(null);

  // Leadership gets its own slide rather than sharing slide one. Three cards
  // deep (mission, leadership, what we do) the last of them ran past the fold
  // and the founder's bio was the part being cut.
  // The presentation, in the order a stranger needs it: what this is, who
  // runs it, what it costs, sign up, work with us. Pricing sits *before* the
  // form on purpose — asking someone to make an account to find out the
  // price is the one thing the rest of this app never does.
  const labels: TranslationKey[] = [
    "slide.about", "slide.leadership", "slide.pricing", "slide.signup", "slide.work",
  ];
  const SIGNUP_SLIDE = 3;
  const invitedBy = incomingReferralCode();

  return (
    <div className="stack">
      <div className="card stack" style={{ textAlign: "center" }}>
        <h1 style={{ margin: 0 }}>{t("landing.heading")}</h1>
        <p className="small muted" style={{ margin: 0 }}>{t("landing.subtitle")}</p>
      </div>

      {/* The launch party, and only while it is actually on: the API owns
          whether the window is open (see launchStatus in routes.ts) so the
          page cannot advertise a closed promotion. */}
      {launch && launch.phase !== "closed" && (
        <div className="banner banner-launch">
          <strong>{launch.phase === "open" ? t("launch.heading") : t("launch.soon")}</strong>
          <span className="tiny">{launchNote(launch, t, language)}</span>
        </div>
      )}

      {/* Somebody arriving on a friend's link should be told the code came
          with them, before they wonder where to type it. */}
      {invitedBy && (
        <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>
          {t("launch.invitedBy").replace("{code}", invitedBy)}
        </p>
      )}

      <Carousel
        ref={carousel}
        labels={labels.map((l) => t(l))}
        ariaLabel={t("slide.about")}
        autoAdvanceMs={AUTO_ADVANCE_MS}
        prevLabel={t("slide.prev")}
        nextLabel={t("slide.next")}
        showCaption
        onEngage={() => {}}
      >
        {/* Track which slide is on screen only to drive `startInSignup`'s
            reset target — Carousel owns the scroll position itself. */}
        {/* 1 — why the app exists, and what it actually does. */}
        <section className="slide" aria-label={t("slide.about")}>
          <MissionSection />
          <WhatWeDoSection />
          <button className="btn btn-primary btn-block" onClick={() => { setStartInSignup(true); carousel.current?.goTo(SIGNUP_SLIDE); }}>
            {t("landing.getStarted")}
          </button>
        </section>

        {/* 2 — who is behind it. Its own slide so the bio is read rather than
            clipped, and because "who runs this" is a fair question to ask of
            an app you are about to trust with where you are at 1am. */}
        <section className="slide" aria-label={t("slide.leadership")}>
          <LeadershipSection />
          <button className="btn btn-primary btn-block" onClick={() => { setStartInSignup(true); carousel.current?.goTo(SIGNUP_SLIDE); }}>
            {t("landing.getStarted")}
          </button>
        </section>

        {/* 3 — every price, before any commitment. */}
        <section className="slide" aria-label={t("slide.pricing")}>
          {/* The launch banner sits above every slide, so repeating its
              sentence inside this card said the same thing twice on one
              screen. */}
          <PublicPricing onGetStarted={() => setStartInSignup(true)} />
        </section>

        {/* 4 — sign up, with how it works right beside the form so nobody has
            to guess what they are signing up to. */}
        <section className="slide" aria-label={t("slide.signup")}>
          <AuthScreen onSignedIn={onSignedIn} startInSignup={startInSignup} />
          <section className="card stack">
            <h2>{t("how.heading")}</h2>
            <ol className="timeline">
              {HOW_IT_WORKS.map((key) => (
                <li key={key}><span className="small">{t(key)}</span></li>
              ))}
            </ol>
          </section>

          {/* Only before go-live. Once the service is running, "tell me when
              it starts" is a worse offer than the signup form above it, and
              a mailing list nobody needs is just another box to ignore. */}
          {launch && launch.phase !== "closed" && <NewsletterSignup source="landing" />}
        </section>

        {/* 5 — the other side of the app: the people who work it. */}
        <section className="slide" aria-label={t("slide.work")}>
          <section className="card stack">
            <h2>{t("work.heading")}</h2>

            <div className="stack" style={{ gap: 6 }}>
              <strong className="small">{t("work.assistant")}</strong>
              <p className="tiny muted" style={{ margin: 0 }}>{t("work.assistantNote")}</p>
              {/* A real navigation, not a router push: /employee is a separate
                  area of the app with its own session (see main.tsx). */}
              <a className="btn btn-block" href="/employee">{t("work.assistantCta")}</a>
            </div>

            <div className="stack" style={{ gap: 6 }}>
              <strong className="small">{t("work.apply")}</strong>
              <p className="tiny muted" style={{ margin: 0 }}>{t("work.applyNote")}</p>
              <button className="btn btn-block btn-ghost" onClick={onDrive}>{t("app.drive")}</button>
            </div>

            {/* The roles being hired that have nothing to do with a car. Its
                own path because the driver form asks for a vehicle, a plate
                and a licence expiry, none of which a secretary has. */}
            <div className="stack" style={{ gap: 6 }}>
              <strong className="small">{t("work.staff")}</strong>
              <p className="tiny muted" style={{ margin: 0 }}>{t("work.staffNote")}</p>
              <button className="btn btn-block btn-ghost" onClick={onWorkWithUs}>{t("work.staffCta")}</button>
            </div>

            {/* The rate, here, rather than one click deeper inside whichever
                application form you happen to open. Somebody deciding whether
                to apply is exactly who the number is for. */}
            <PublicWorkerPay />
          </section>
        </section>
      </Carousel>

      <Footer />
    </div>
  );
}
