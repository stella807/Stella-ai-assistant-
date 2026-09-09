import { useEffect, useState } from "react";
import type { DrinkDefinition } from "@safehubby/core";
import { api, type Account } from "./api.ts";
import { AuthScreen } from "./components/AuthScreen.tsx";
import { GuardianScreen } from "./components/GuardianScreen.tsx";
import { TravelerScreen } from "./components/TravelerScreen.tsx";

type Role = "out" | "watching";

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
          <button className="btn btn-sm btn-ghost" onClick={() => api.logout().then(() => setAccount(null))}>
            Sign out
          </button>
        ) : (
          <span className="tiny muted">Get home safe</span>
        )}
      </header>

      {offline && (
        <div className="banner banner-danger">
          Can&apos;t reach the Safehubby API. Start it with <code>pnpm dev</code>.
        </div>
      )}

      {!ready ? null : !account ? (
        <AuthScreen onSignedIn={setAccount} />
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={role === "out"} onClick={() => setRole("out")}>I&apos;m out</button>
            <button role="tab" aria-selected={role === "watching"} onClick={() => setRole("watching")}>I&apos;m watching</button>
          </div>
          {role === "out" ? <TravelerScreen drinks={drinks} account={account} /> : <GuardianScreen />}
        </>
      )}

      <footer className="tiny muted" style={{ paddingTop: 8 }}>
        Safehubby never tells anyone they are safe to drive. In an emergency call 911.
      </footer>
    </div>
  );
}
