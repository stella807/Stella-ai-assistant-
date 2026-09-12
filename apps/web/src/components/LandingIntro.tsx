import { useState } from "react";
import { LeadershipSection, MissionSection, WhatWeDoSection } from "./AboutScreen.tsx";
import { useLanguage } from "../i18n.tsx";

type Tab = "mission" | "what" | "leadership";

/**
 * What a visitor sees before they ever reach the sign-in form — the mission,
 * what the app actually does, and who's behind it, all front and center
 * rather than buried in a tab someone only finds after creating an account.
 * Reuses the exact same section content as the signed-in "About" tab
 * (`AboutScreen.tsx`) so the story never drifts between the two audiences.
 */
export function LandingIntro({ onGetStarted }: { onGetStarted?: () => void }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("mission");

  return (
    <div className="stack" style={{ marginBottom: 4 }}>
      <div className="card stack" style={{ textAlign: "center" }}>
        <h1 style={{ margin: 0 }}>{t("landing.heading")}</h1>
        <p className="small muted" style={{ margin: 0 }}>
          {t("landing.subtitle")}
        </p>
        {onGetStarted && (
          <button className="btn btn-primary" style={{ alignSelf: "center" }} onClick={onGetStarted}>
            {t("landing.getStarted")}
          </button>
        )}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "mission"} onClick={() => setTab("mission")}>{t("landing.tab.mission")}</button>
        <button role="tab" aria-selected={tab === "what"} onClick={() => setTab("what")}>{t("landing.tab.what")}</button>
        <button role="tab" aria-selected={tab === "leadership"} onClick={() => setTab("leadership")}>{t("landing.tab.leadership")}</button>
      </div>

      {tab === "mission" && <MissionSection />}
      {tab === "what" && <WhatWeDoSection />}
      {tab === "leadership" && <LeadershipSection />}
    </div>
  );
}
