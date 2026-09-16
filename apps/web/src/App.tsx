import { useEffect, useState } from "react";
import type { DrinkDefinition } from "@safehubby/core";
import { api, type Account, type LaunchStatus } from "./api.ts";
import { configError } from "./native/platform.ts";
import { isEnabled } from "@safehubby/core";
import { BillingScreen } from "./components/BillingScreen.tsx";
import { GamesScreen } from "./components/GamesScreen.tsx";
import { PartyScreen } from "./components/PartyScreen.tsx";
import { AccountScreen } from "./components/AccountScreen.tsx";
import { PendingOrderPrompt } from "./components/PendingOrderPrompt.tsx";
import { GuardianScreen } from "./components/GuardianScreen.tsx";
import { TravelerScreen } from "./components/TravelerScreen.tsx";
import { DriveSignupScreen } from "./components/DriveSignupScreen.tsx";
import { StaffSignupScreen } from "./components/StaffSignupScreen.tsx";
import { HiringScreen } from "./components/HiringScreen.tsx";
import { AboutScreen } from "./components/AboutScreen.tsx";
import { LandingIntro } from "./components/LandingIntro.tsx";
import { useLanguage, type Language } from "./i18n.tsx";
import { IconBriefcase, IconCard, IconConfetti, IconDice, IconEye, IconMoon } from "./components/NavIcons.tsx";

type Role =
  | "out" | "watching" | "games" | "party" | "plans" | "hiring" | "about" | "account"
  | "drive" | "work";

export function App() {
  const [role, setRole] = useState<Role>("out");
  const [drinks, setDrinks] = useState<DrinkDefinition[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [launch, setLaunch] = useState<LaunchStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    api.catalog()
      .then((c) => { setDrinks(c.drinks); setLaunch(c.launch); })
      .catch(() => setOffline(true));
    api.me()
      .then((r) => setAccount(r.traveler))
      .catch(() => setOffline(true))
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="app stack">
      <header className="row-between">
        <h1>Safehubby</h1>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          {account ? (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => setRole("about")}>{t("nav.about")}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setRole("account")}>{t("app.account")}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => api.logout().then(() => setAccount(null))}>
                {t("app.signOut")}
              </button>
            </>
          ) : (
            <span className="tiny muted">{t("app.tagline")}</span>
          )}
          <LanguageToggle language={language} setLanguage={setLanguage} />
        </div>
      </header>

      {offline && (
        <div className="banner banner-danger">
          {configError() ?? t("app.offline")}
        </div>
      )}

      {/* Applying to drive or to a non-driving role needs no rider account.
          While signed out, the landing carousel's fifth slide has both — so
          these would just be the same buttons twice there. They appear here
          for signed-in riders, who have no carousel to find them on: without
          this, StaffSignupScreen ("work" role) had no way in at all once
          somebody had an account, since onWorkWithUs is a LandingIntro prop
          and LandingIntro only renders while signed out. */}
      {role !== "drive" && role !== "work" && account && (
        <div className="row" style={{ gap: 6, alignSelf: "flex-start" }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setRole("drive")}>
            {t("app.drive")}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setRole("work")}>
            {t("app.careers")}
          </button>
        </div>
      )}

      {role === "drive" ? (
        <DriveSignupScreen onBack={() => setRole("out")} />
      ) : role === "work" ? (
        <StaffSignupScreen onBack={() => setRole("out")} />
      ) : !ready ? null : !account ? (
        <LandingIntro
          onSignedIn={setAccount}
          onDrive={() => setRole("drive")}
          onWorkWithUs={() => setRole("work")}
          launch={launch}
        />
      ) : (
        <>
          <nav className="tabs-bottom" role="tablist" aria-label="Main">
            <button role="tab" aria-selected={role === "out"} onClick={() => setRole("out")}>
              <span className="tab-icon"><IconMoon /></span><span>{t("nav.tonight")}</span>
            </button>
            <button role="tab" aria-selected={role === "watching"} onClick={() => setRole("watching")}>
              <span className="tab-icon"><IconEye /></span><span>{t("nav.watch")}</span>
            </button>
            <button role="tab" aria-selected={role === "games"} onClick={() => setRole("games")}>
              <span className="tab-icon"><IconDice /></span><span>{t("nav.games")}</span>
            </button>
            {isEnabled("party-supply") && (
              <button role="tab" aria-selected={role === "party"} onClick={() => setRole("party")}>
                <span className="tab-icon"><IconConfetti /></span><span>{t("nav.party")}</span>
              </button>
            )}
            <button role="tab" aria-selected={role === "plans"} onClick={() => setRole("plans")}>
              <span className="tab-icon"><IconCard /></span><span>{t("nav.payments")}</span>
            </button>
            <button role="tab" aria-selected={role === "hiring"} onClick={() => setRole("hiring")}>
              <span className="tab-icon"><IconBriefcase /></span><span>{t("nav.hiring")}</span>
            </button>
          </nav>

          {/* The sober ask outranks whatever tab you are on: it is a question
              about your money that has been waiting for you to be able to
              answer it. */}
          <PendingOrderPrompt />
          {role === "out" && <TravelerScreen drinks={drinks} account={account} />}
          {role === "watching" && <GuardianScreen />}
          {role === "games" && <GamesScreen account={account} />}
          {role === "party" && isEnabled("party-supply") && <PartyScreen />}
          {role === "account" && (
            <AccountScreen account={account} onDeleted={() => { setAccount(null); setRole("out"); }} />
          )}
          {role === "plans" && (
            <BillingScreen
              currentPlanId={account.planId}
              onPlanChanged={(planId) => setAccount((a) => (a && a.planId !== planId ? { ...a, planId } : a))}
            />
          )}
          {role === "hiring" && <HiringScreen account={account} />}
          {role === "about" && <AboutScreen />}
        </>
      )}

      <footer className="tiny muted" style={{ paddingTop: 8 }}>
        {t("app.footer")}
      </footer>
    </div>
  );
}

function LanguageToggle({ language, setLanguage }: { language: Language; setLanguage: (l: Language) => void }) {
  return (
    <div className="row" style={{ gap: 2 }} aria-label="Language">
      <button
        className="btn btn-sm btn-ghost"
        aria-pressed={language === "en"}
        style={language === "en" ? { fontWeight: 700 } : undefined}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <button
        className="btn btn-sm btn-ghost"
        aria-pressed={language === "es"}
        style={language === "es" ? { fontWeight: 700 } : undefined}
        onClick={() => setLanguage("es")}
      >
        ES
      </button>
    </div>
  );
}
