import { useState } from "react";
import { LeadershipSection, MissionSection, WhatWeDoSection } from "./AboutScreen.tsx";

type Tab = "mission" | "what" | "leadership";

/**
 * What a visitor sees before they ever reach the sign-in form — the mission,
 * what the app actually does, and who's behind it, all front and center
 * rather than buried in a tab someone only finds after creating an account.
 * Reuses the exact same section content as the signed-in "About" tab
 * (`AboutScreen.tsx`) so the story never drifts between the two audiences.
 */
export function LandingIntro() {
  const [tab, setTab] = useState<Tab>("mission");

  return (
    <div className="stack" style={{ marginBottom: 4 }}>
      <div className="card stack" style={{ textAlign: "center" }}>
        <h1 style={{ margin: 0 }}>Get home safe. Never alone.</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Safehubby watches out for you on a night out, and sends real help when a text or a ride isn't
          enough.
        </p>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "mission"} onClick={() => setTab("mission")}>Our mission</button>
        <button role="tab" aria-selected={tab === "what"} onClick={() => setTab("what")}>What we do</button>
        <button role="tab" aria-selected={tab === "leadership"} onClick={() => setTab("leadership")}>Leadership</button>
      </div>

      {tab === "mission" && <MissionSection />}
      {tab === "what" && <WhatWeDoSection />}
      {tab === "leadership" && <LeadershipSection />}
    </div>
  );
}
