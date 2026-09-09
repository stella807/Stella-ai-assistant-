import { useState } from "react";
import { api, type Account } from "../api.ts";

/**
 * Sign-in gate. Deliberately plain: the interesting part of this app happens
 * after you're in, and an account screen that tries to be clever is one more
 * thing to fight at 1am.
 */
export function AuthScreen({ onSignedIn }: { onSignedIn: (account: Account) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = mode === "login"
        ? await api.login({ email, password })
        : await api.signup({ email, password, displayName, homeLabel: homeLabel || "Home" });
      onSignedIn(res.traveler);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const ready = email.trim() && password.length >= (mode === "signup" ? 10 : 1) && (mode === "login" || displayName.trim());

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(null); }}>Sign in</button>
        <button role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setError(null); }}>Create account</button>
      </div>

      <section className="card stack">
        <h2>{mode === "login" ? "Welcome back" : "Set up Safehubby"}</h2>

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)} />
          {mode === "signup" && <span className="tiny muted">At least 10 characters. Length beats punctuation.</span>}
        </div>

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="home">Home (what your ride home is called)</label>
            <input id="home" value={homeLabel} placeholder="142 Rowan St" onChange={(e) => setHomeLabel(e.target.value)} />
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={submit}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>

        {error && <div className="banner banner-danger">{error}</div>}

        <p className="tiny muted">
          Your location and drink history are yours. They are never sold, and never used for ad targeting.
        </p>
      </section>
    </div>
  );
}
