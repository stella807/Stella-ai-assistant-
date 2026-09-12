import { useEffect, useRef, useState } from "react";
import { LeadershipSection, MissionSection, WhatWeDoSection } from "./AboutScreen.tsx";
import { AuthScreen } from "./AuthScreen.tsx";
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
export function LandingIntro({ onSignedIn, onDrive, launch }: {
  onSignedIn: (account: Account) => void;
  /** Switches the app to the public driver application — App state, not a
   *  route, so it comes in as a callback rather than a link. */
  onDrive: () => void;
  /** Null until the catalog request lands, and while the API is unreachable.
   *  The banner simply does not render then, rather than claiming a promotion
   *  we have not confirmed is open. */
  launch: LaunchStatus | null;
}) {
  const { t, language } = useLanguage();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [startInSignup, setStartInSignup] = useState(false);

  const labels: TranslationKey[] = ["slide.about", "slide.signup", "slide.work"];
  const invitedBy = incomingReferralCode();

  const goTo = (next: number) => {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(next, labels.length - 1));
    setEngaged(true);
    // The slide's own offset, not clientWidth * index: the product drifts a
    // sub-pixel and leaves a sliver of the neighbour showing at the edge.
    const slide = el.children[clamped] as HTMLElement | undefined;
    el.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: "smooth" });
    setIndex(clamped);
  };

  // Which slide is actually on screen, read from the scroll position rather
  // than tracked separately — a swipe moves the container, not our state.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const width = el.clientWidth || 1;
      setIndex(Math.round(el.scrollLeft / width));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (engaged) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const width = el.clientWidth || 1;
      const current = Math.round(el.scrollLeft / width);
      const next = (current + 1) % labels.length;
      const slide = el.children[next] as HTMLElement | undefined;
      el.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: "smooth" });
      setIndex(next);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [engaged, labels.length]);

  // The track is a flex row, so its natural height is the tallest slide —
  // which would leave the short slides sitting above a canyon of empty
  // space. Measure whichever slide is on screen and size the track to it,
  // re-measuring when the content or the viewport changes.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const fit = () => {
      const slide = el.children[index] as HTMLElement | undefined;
      if (slide) el.style.height = `${slide.offsetHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    for (const child of Array.from(el.children)) observer.observe(child);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [index]);

  const stopRevolving = () => setEngaged(true);

  return (
    <div className="stack" onPointerDown={stopRevolving} onKeyDown={stopRevolving} onFocus={stopRevolving}>
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

      <div className="slides" ref={track} aria-live="off">
        {/* 1 — who we are: the mission, the founder, and what the app does. */}
        <section className="slide" aria-label={t("slide.about")}>
          <MissionSection />
          <LeadershipSection />
          <WhatWeDoSection />
          <button className="btn btn-primary btn-block" onClick={() => { setStartInSignup(true); goTo(1); }}>
            {t("landing.getStarted")}
          </button>
        </section>

        {/* 2 — sign up, with how it works right beside the form so nobody has
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
        </section>

        {/* 3 — the other side of the app: the people who work it. */}
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
          </section>
        </section>
      </div>

      <div className="slide-nav">
        <button className="btn btn-sm btn-ghost" disabled={index === 0}
          onClick={() => goTo(index - 1)} aria-label={t("slide.prev")}>
          ←
        </button>

        <div className="slide-dots" role="tablist" aria-label={t("slide.about")}>
          {labels.map((label, i) => (
            <button key={label} role="tab" aria-current={index === i} aria-label={t(label)}
              onClick={() => goTo(i)} />
          ))}
        </div>

        <button className="btn btn-sm btn-ghost" disabled={index === labels.length - 1}
          onClick={() => goTo(index + 1)} aria-label={t("slide.next")}>
          →
        </button>
      </div>

      <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>
        {t(labels[index] ?? "slide.about")}
      </p>
    </div>
  );
}
