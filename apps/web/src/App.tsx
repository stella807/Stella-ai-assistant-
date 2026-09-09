import { useEffect, useState } from "react";
import type { DrinkDefinition } from "@safehubby/core";
import { api } from "./api.ts";
import { GuardianScreen } from "./components/GuardianScreen.tsx";
import { TravelerScreen } from "./components/TravelerScreen.tsx";

type Role = "out" | "watching";

export function App() {
  const [role, setRole] = useState<Role>("out");
  const [drinks, setDrinks] = useState<DrinkDefinition[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api.catalog().then((c) => setDrinks(c.drinks)).catch(() => setOffline(true));
  }, []);

  return (
    <div className="app stack">
      <header className="row-between">
        <h1>Safehubby</h1>
        <span className="tiny muted">Get home safe</span>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={role === "out"} onClick={() => setRole("out")}>I'm out</button>
        <button role="tab" aria-selected={role === "watching"} onClick={() => setRole("watching")}>I'm watching</button>
      </div>

      {offline && <div className="banner banner-danger">Can't reach the Safehubby API. Start it with <code>pnpm dev</code>.</div>}

      {role === "out" ? <TravelerScreen drinks={drinks} /> : <GuardianScreen />}

      <footer className="tiny muted" style={{ paddingTop: 8 }}>
        Safehubby never tells anyone they are safe to drive. In an emergency call 911.
      </footer>
    </div>
  );
}
