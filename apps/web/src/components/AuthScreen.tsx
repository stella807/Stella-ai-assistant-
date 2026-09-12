import { useEffect, useState } from "react";
import { api, type Account } from "../api.ts";
import { clearReferralCode, incomingReferralCode } from "../referral.ts";
import { useLanguage } from "../i18n.tsx";

/**
 * Sign-in gate. Deliberately plain: the interesting part of this app happens
 * after you're in, and an account screen that tries to be clever is one more
 * thing to fight at 1am.
 */
export function AuthScreen({ onSignedIn, startInSignup }: { onSignedIn: (account: Account) => void; startInSignup?: boolean }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "signup">(startInSignup ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  // Pre-filled from a ?ref= link but left editable: someone who was told a
  // code across a table has no link to click.
  const [referralCode, setReferralCode] = useState(incomingReferralCode());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "Get started" on the landing page can fire after this screen already
  // mounted (it's rendered alongside LandingIntro, not after it) — react to
  // the prop changing, not just its value at mount.
  useEffect(() => {
    if (startInSignup) setMode("signup");
  }, [startInSignup]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = mode === "login"
        ? await api.login({ email, password })
        : await api.signup({
          email, password, displayName, homeLabel: homeLabel || "Home",
          referralCode: referralCode.trim() || undefined,
        });
      if (mode === "signup") clearReferralCode();
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
        <button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(null); }}>{t("auth.signIn")}</button>
        <button role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setError(null); }}>{t("auth.createAccount")}</button>
      </div>

      <section className="card stack">
        <h2>{mode === "login" ? t("auth.welcomeBack") : t("auth.setUp")}</h2>

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="name">{t("auth.yourName")}</label>
            <input id="name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label htmlFor="email">{t("auth.email")}</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="pw">{t("auth.password")}</label>
          <input id="pw" type="password" value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)} />
          {mode === "signup" && <span className="tiny muted">{t("auth.passwordHint")}</span>}
        </div>

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="home">{t("auth.home")}</label>
            <input id="home" value={homeLabel} placeholder={t("auth.homePlaceholder")} onChange={(e) => setHomeLabel(e.target.value)} />
          </div>
        )}

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="ref">{t("auth.referral")}</label>
            <input id="ref" value={referralCode} placeholder="ABC-DE4" autoCapitalize="characters"
              onChange={(e) => setReferralCode(e.target.value)} />
            <span className="tiny muted">{t("auth.referralHint")}</span>
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={submit}>
          {mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
        </button>

        {error && <div className="banner banner-danger">{error}</div>}

        <p className="tiny muted">
          {t("auth.privacy")}
        </p>
      </section>
    </div>
  );
}
