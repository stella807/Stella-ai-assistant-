import { Fragment, useEffect, useState } from "react";
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
import { entryRoleFromUrl, entryRouteFromUrl, hashForEntryRoute, pathAfterLeaving } from "./app/entry-route.ts";
import { HiringScreen, type HiringTab } from "./components/HiringScreen.tsx";
import { AboutScreen } from "./components/AboutScreen.tsx";
import { HowItWorks } from "./components/HowItWorks.tsx";
import { LandingIntro } from "./components/LandingIntro.tsx";
import { useLanguage } from "./i18n.tsx";
import { LanguageToggle } from "./components/LanguageToggle.tsx";
import { ScreenGuard } from "./components/ScreenGuard.tsx";
import { SiteChatBubble } from "./components/SiteChatBubble.tsx";
import { BackButton } from "./components/BackButton.tsx";
import { IconBriefcase, IconCard, IconEye, IconMoon } from "./components/NavIcons.tsx";

type Role =
  | "out" | "watching" | "games" | "party" | "plans" | "hiring" | "about" | "account"
  | "drive" | "work" | "how";

export function App() {
  // A link can open the job application directly — see entry-route.ts.
  const [pickerRequest, setPickerRequest] = useState(0);
  const [role, setRoleState] = useState<Role>(() => entryRouteFromUrl(window.location));
  // Read once, at load: which role an ad asked the form to start on.
  const [initialRole] = useState(() => entryRoleFromUrl(window.location));
  // Every move between screens is a browser history entry, so the phone's or
  // browser's own Back button walks back through them instead of leaving the
  // site. The address keeps the job-application hash in step too, so a
  // refresh does not reopen a form somebody already left.
  const urlFor = (next: Role) => {
    const hash = hashForEntryRoute(next);
    const onEntryScreen = next === "work" || next === "drive";
    const path = onEntryScreen ? window.location.pathname : pathAfterLeaving(window.location.pathname);
    const search = path === window.location.pathname ? window.location.search : "";
    return `${path}${search}${hash}`;
  };
  const setRole = (next: Role) => {
    if (next === role) return;
    setRoleState(next);
    const depth = ((window.history.state as { depth?: number } | null)?.depth ?? 0) + 1;
    window.history.pushState({ role: next, depth }, "", urlFor(next));
  };
  /** Back one screen: through history when there is somewhere to go back to
   *  inside the site, otherwise home — never off the site. */
  const goBack = () => {
    if (((window.history.state as { depth?: number } | null)?.depth ?? 0) > 0) window.history.back();
    else setRole("out");
  };
  useEffect(() => {
    // The screen the page opened on is the bottom of the stack.
    window.history.replaceState({ role, depth: 0 }, "", window.location.href);
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { role?: Role } | null;
      setRoleState(state?.role ?? entryRouteFromUrl(window.location));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Once, at load: the stack's bottom is the screen the page opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Which Hiring sub-tab to open on, when something else sent the member
  // there for a specific thing. Cleared by HiringScreen's own tabs from then
  // on; it only decides where that screen starts.
  const [hiringTab, setHiringTab] = useState<HiringTab | undefined>(undefined);
  const [drinks, setDrinks] = useState<DrinkDefinition[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [launch, setLaunch] = useState<LaunchStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const { language, t } = useLanguage();

  useEffect(() => {
    api.me()
      .then((r) => setAccount(r.traveler))
      .catch(() => setOffline(true))
      .finally(() => setReady(true));
  }, []);
  // The catalog carries words (drink names, the launch note), so it is read
  // again in the new language when the reader switches.
  useEffect(() => {
    api.catalog()
      .then((c) => { setDrinks(c.drinks); setLaunch(c.launch); })
      .catch(() => setOffline(true));
  }, [language]);

  return (
    // `app-customer` is the hook for the desktop layout (styles/desktop.css);
    // the employee and owner portals share `.app` but keep their own widths.
    <div className="app app-customer stack">
      <header className="row-between">
        <h1 className="brand-mark">
          <img src="/favicon.png" alt="" width={38} height={38} />
          Safehubby
        </h1>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          {account ? (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => setRole("account")}>{t("app.account")}</button>
            </>
          ) : (
            <span className="tiny muted">{t("app.tagline")}</span>
          )}
          <LanguageToggle />
        </div>
      </header>

      {offline && (
        <div className="banner banner-danger">
          {configError() ?? t("app.offline")}
        </div>
      )}

      {role === "drive" ? (
        <DriveSignupScreen onBack={goBack} />
      ) : role === "work" ? (
        <StaffSignupScreen onBack={goBack} initialRole={initialRole} />
      ) : !ready ? null : !account ? (
        <LandingIntro
          onSignedIn={setAccount}
          onDrive={() => setRole("drive")}
          onWorkWithUs={() => setRole("work")}
          launch={launch}
        />
      ) : (
        <>
          <nav className="tabs-bottom" role="tablist" aria-label={language === "es" ? "Principal" : "Main"}>
            <button role="tab" aria-selected={role === "out"} onClick={() => setRole("out")}>
              <span className="tab-icon"><IconMoon /></span><span>{t("nav.tonight")}</span>
            </button>
            <button role="tab" aria-selected={role === "watching"} onClick={() => setRole("watching")}>
              <span className="tab-icon"><IconEye /></span><span>{t("nav.watch")}</span>
            </button>
            <button role="tab" aria-selected={role === "hiring"}
              onClick={() => { setHiringTab(undefined); setRole("hiring"); }}>
              <span className="tab-icon"><IconBriefcase /></span><span>{t("nav.hiring")}</span>
            </button>
            <button role="tab" aria-selected={role === "plans"} onClick={() => setRole("plans")}>
              <span className="tab-icon"><IconCard /></span><span>{t("nav.payments")}</span>
            </button>
          </nav>

          {/* The sober ask outranks whatever tab you are on: it is a question
              about your money that has been waiting for you to be able to
              answer it. */}
          <PendingOrderPrompt />
          {role !== "out" && <BackButton onBack={goBack} />}
          {/* Keyed by language: switching remounts the screen, so what it
              loaded in the old language is loaded again in the new one. */}
          <Fragment key={language}>
          <ScreenGuard key={role}>
          {role === "out" && (
            <TravelerScreen drinks={drinks} account={account}
              onOpenHiring={(tab) => { setHiringTab(tab); setRole("hiring"); }}
              onOpenPlans={() => setRole("plans")}
              onOpenHow={() => setRole("how")}
              onOpenGames={() => setRole("games")} />
          )}
          {role === "watching" && <GuardianScreen />}
          {role === "games" && <GamesScreen account={account} />}
          {role === "party" && isEnabled("party-supply") && <PartyScreen />}
          {role === "account" && (
            <AccountScreen account={account} onDeleted={() => { setAccount(null); setRole("out"); }}
              onManagePlan={() => setRole("plans")} />
          )}
          {role === "plans" && (
            <BillingScreen
              pickerRequest={pickerRequest}
              currentPlanId={account.planId}
              onPlanChanged={(planId) => setAccount((a) => (a && a.planId !== planId ? { ...a, planId } : a))}
            />
          )}
          {role === "hiring" && <HiringScreen account={account} initialTab={hiringTab} />}
          {role === "about" && <AboutScreen />}
          {role === "how" && <HowItWorks onOpenPlans={() => setRole("plans")} />}
          </ScreenGuard>
          </Fragment>
        </>
      )}

      <SiteChatBubble signedIn={Boolean(account)} signedInNav={Boolean(account) && role !== "drive" && role !== "work"} onChoosePlan={() => {
        if (account) { setPickerRequest((n) => n + 1); setRole("plans"); return; }
        // Not signed in: a plan belongs to an account, so send them to the sign-up at the top.
        window.scrollTo({ top: 0, behavior: "smooth" });
      }} />

      <footer className="tiny muted" style={{ paddingTop: 8 }}>
        {t("app.footer")}
        {/* Jobs are for people who want to work for Safehubby, not for the
            customers using it, so they live down here rather than in the header
            every customer sees. Signed out, the landing carries both already. */}
        {account && role !== "drive" && role !== "work" && (
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            <nav className="footer-links" aria-label={language === "es" ? "Más" : "More"}>
              <button className="linklike" onClick={() => setRole("about")}>{t("nav.about")}</button>
              <a href="mailto:contact@safehubby.com">{t("footer.contact")}</a>
              {isEnabled("party-supply") && <button className="linklike" onClick={() => setRole("party")}>{t("nav.party")}</button>}
              <button className="linklike" onClick={() => api.logout().then(() => setAccount(null))}>{t("app.signOut")}</button>
            </nav>
            <nav className="footer-links footer-portals" aria-label={language === "es" ? "Trabaja con nosotros" : "Work with us"}>
              <button className="linklike" onClick={() => setRole("work")}>{t("app.careers")}</button>
              <button className="linklike" onClick={() => setRole("drive")}>{t("app.drive")}</button>
              <a href="/employee">{t("footer.employeePortal")}</a>
              <a href="/master">{t("footer.ownerPortal")}</a>
            </nav>
          </div>
        )}
      </footer>
    </div>
  );
}
