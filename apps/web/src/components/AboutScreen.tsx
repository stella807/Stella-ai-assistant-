import { useState } from "react";
import { useLanguage, type TranslationKey } from "../i18n.tsx";

/** Mission and leadership. Public-facing, plain, and grounded in the
 *  founder's own reason for building this rather than anyone else's story.
 *  Exported as separate sections so the pre-signup landing page
 *  (`LandingIntro.tsx`) and the signed-in "About" tab can share the exact
 *  same content instead of drifting apart over time. */

/**
 * The reason the app exists, set as the reason the app exists.
 *
 * This was a plain card in a stack of plain cards, at the far end of the tab
 * bar — the same weight as "what we do" and the leadership bio, which made
 * the mission read as one more section rather than the thing the rest of the
 * product is downstream of. The first paragraph is now set large enough to
 * be read as a statement, and the section is marked out from the cards around
 * it instead of matching them.
 */
export function MissionSection() {
  const { t } = useLanguage();
  return (
    <section className="card stack mission">
      <p className="mission-eyebrow">{t("mission.heading")}</p>
      <p className="mission-lead">{t("mission.p1")}</p>
      <p className="small">{t("mission.p2")}</p>
      <p className="tiny muted">{t("mission.disclaimer")}</p>
    </section>
  );
}

export function LeadershipSection() {
  const { t } = useLanguage();
  return (
    <section className="card stack">
      <h2>{t("leadership.heading")}</h2>
      <p className="small"><strong>{t("leadership.name")}</strong></p>
      <p className="small">{t("leadership.bio")}</p>
    </section>
  );
}

/**
 * Errands and the personal concierge are listed separately, and that is not
 * a copy preference. They are different jobs done by different people — only
 * a personal assistant is dispatched to sit with someone or check on them
 * (see roster.ts) — and describing them as one "vetted assistant" hid both
 * the price difference and the reason for it.
 */
const FEATURES: { id: string; titleKey: TranslationKey; blurbKey: TranslationKey }[] = [
  { id: "night-out", titleKey: "what.nightOut.title", blurbKey: "what.nightOut.blurb" },
  { id: "watch", titleKey: "what.watch.title", blurbKey: "what.watch.blurb" },
  { id: "ride-home", titleKey: "what.rideHome.title", blurbKey: "what.rideHome.blurb" },
  { id: "errands", titleKey: "what.errands.title", blurbKey: "what.errands.blurb" },
  { id: "concierge", titleKey: "what.concierge.title", blurbKey: "what.concierge.blurb" },
  { id: "emergency", titleKey: "what.emergency.title", blurbKey: "what.emergency.blurb" },
  { id: "games", titleKey: "what.games.title", blurbKey: "what.games.blurb" },
];

/** Genuinely interactive, not just decorative: each card expands in place to
 *  answer "what does that actually mean" without leaving the page. */
export function WhatWeDoSection() {
  const { t } = useLanguage();
  const [openId, setOpenId] = useState<string | null>(FEATURES[0]?.id ?? null);

  return (
    <section className="card stack">
      <h2>{t("what.heading")}</h2>
      <div className="stack" style={{ gap: 8 }}>
        {FEATURES.map((f) => {
          const open = openId === f.id;
          return (
            <button key={f.id} className="card card-quiet" style={{ textAlign: "left" }}
              aria-expanded={open} onClick={() => setOpenId(open ? null : f.id)}>
              <div className="row-between">
                <strong className="small">{t(f.titleKey)}</strong>
                <span className="tiny muted" aria-hidden="true">{open ? "−" : "+"}</span>
              </div>
              {open && <p className="tiny muted" style={{ marginTop: 6 }}>{t(f.blurbKey)}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AboutScreen() {
  return (
    <div className="stack">
      <MissionSection />
      <WhatWeDoSection />
      <LeadershipSection />
    </div>
  );
}
