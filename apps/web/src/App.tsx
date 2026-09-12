import { useEffect, useState } from "react";
import type { DrinkDefinition } from "@safehubby/core";
import { api, type Account } from "./api.ts";
import { configError } from "./native/platform.ts";
import { isEnabled } from "@safehubby/core";
import { AuthScreen } from "./components/AuthScreen.tsx";
import { BillingScreen } from "./components/BillingScreen.tsx";
import { GamesScreen } from "./components/GamesScreen.tsx";
import { PartyScreen } from "./components/PartyScreen.tsx";
import { AccountScreen } from "./components/AccountScreen.tsx";
import { PendingOrderPrompt } from "./components/PendingOrderPrompt.tsx";
import { GuardianScreen } from "./components/GuardianScreen.tsx";
import { TravelerScreen } from "./components/TravelerScreen.tsx";
import { DriveSignupScreen } from "./components/DriveSignupScreen.tsx";
import { HiringScreen } from "./components/HiringScreen.tsx";
import { AboutScreen } from "./components/AboutScreen.tsx";
import { LandingIntro } from "./components/LandingIntro.tsx";

type Role = "out" | "watching" | "games" | "party" | "plans" | "hiring" | "about" | "account" | "drive";

export function App() {
  const [role, setRole] = useState<Role>("out");
  const [drinks, setDrinks] = useState<DrinkDefinition[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.catalog().then((c) => setDrinks(c.drinks)).catch(() => setOffline(true));
    api.me()
      .then((r) => setAccount(r.traveler))
      .catch(() => setOffline(true))
      .finally(() => setReady(true));
  }, []);

  return (
    <div className="app stack">
      <header className="row-between">
        <h1>Safehubby</h1>
        {account ? (
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setRole("account")}>Account</button>
            <button className="btn btn-sm btn-ghost" onClick={() => api.logout().then(() => setAccount(null))}>
              Sign out
            </button>
          </div>
        ) : (
          <span className="tiny muted">Get home safe</span>
        )}
      </header>

      {offline && (
        <div className="banner banner-danger">
          {configError() ?? <>Can&apos;t reach the Safehubby API. Start it with <code>pnpm dev</code>.</>}
        </div>
      )}

      {/* Applying to drive needs no rider account, so it has to be reachable
          from outside the auth gate below, not from inside it. */}
      {role !== "drive" && (
        <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setRole("drive")}>
          Drive for Safehubby →
        </button>
      )}

      {role === "drive" ? (
        <DriveSignupScreen onBack={() => setRole("out")} />
      ) : !ready ? null : !account ? (
        <>
          <LandingIntro />
          <AuthScreen onSignedIn={setAccount} />
        </>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={role === "out"} onClick={() => setRole("out")}>Tonight</button>
            <button role="tab" aria-selected={role === "watching"} onClick={() => setRole("watching")}>Watch</button>
            <button role="tab" aria-selected={role === "games"} onClick={() => setRole("games")}>Games</button>
            {isEnabled("party-supply") && (
              <button role="tab" aria-selected={role === "party"} onClick={() => setRole("party")}>Party</button>
            )}
            <button role="tab" aria-selected={role === "plans"} onClick={() => setRole("plans")}>Payments</button>
            <button role="tab" aria-selected={role === "hiring"} onClick={() => setRole("hiring")}>Hiring</button>
            <button role="tab" aria-selected={role === "about"} onClick={() => setRole("about")}>About</button>
          </div>

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
        Safehubby never tells anyone they are safe to drive. In an emergency call 911.
      </footer>
    </div>
  );
}
