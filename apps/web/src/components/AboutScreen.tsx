import { useState } from "react";
import { useLanguage } from "../i18n.tsx";

/** Mission and leadership. Public-facing, plain, and grounded in the
 *  founder's own reason for building this rather than anyone else's story.
 *  Exported as separate sections so the pre-signup landing page
 *  (`LandingIntro.tsx`) and the signed-in "About" tab can share the exact
 *  same content instead of drifting apart over time. */

export function MissionSection() {
  const { t } = useLanguage();
  return (
    <section className="card stack">
      <h2>{t("mission.heading")}</h2>
      <p className="small">{t("mission.p1")}</p>
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

const FEATURES: { id: string; titleKey: "what.nightOut.title" | "what.watch.title" | "what.rideHome.title" | "what.concierge.title" | "what.emergency.title" | "what.games.title"; blurbKey: "what.nightOut.blurb" | "what.watch.blurb" | "what.rideHome.blurb" | "what.concierge.blurb" | "what.emergency.blurb" | "what.games.blurb" }[] = [
  { id: "night-out", titleKey: "what.nightOut.title", blurbKey: "what.nightOut.blurb" },
  { id: "watch", titleKey: "what.watch.title", blurbKey: "what.watch.blurb" },
  { id: "ride-home", titleKey: "what.rideHome.title", blurbKey: "what.rideHome.blurb" },
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
