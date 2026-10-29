import { useState } from "react";
import { findPlan, isElitePlan, type PlanId } from "@safehubby/core";
import { api, type Account } from "../api.ts";
import { TextAlertsCard } from "./TextAlertsCard.tsx";
import { EmailAlertsCard } from "./EmailAlertsCard.tsx";
import { useLanguage } from "../i18n.tsx";
import { ShareCard } from "./ShareCard.tsx";
import { HomeAddressCard } from "./HomeAddressCard.tsx";
import { planNameFor } from "../app/plan-name.tsx";

/**
 * Account settings: export and deletion.
 *
 * Deletion is required by App Store guideline 5.1.1(v) and by the right to
 * erasure. It is real deletion, not deactivation, and the export sits directly
 * above it so taking your data with you is the obvious step before leaving.
 */
export function AccountScreen({ account, onDeleted, onManagePlan }: {
  account: Account; onDeleted: () => void; onManagePlan: () => void;
}) {
  const { language } = useLanguage();
  const es = language === "es";
  const plan = findPlan(account.planId as PlanId);
  const initials = account.displayName
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safehubby-${account.displayName.toLowerCase().replace(/\s+/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(es
        ? "Descargado. Incluye todo tu historial de ubicación sin cifrar: guárdalo en un lugar seguro."
        : "Downloaded. It includes your full location history in the clear — keep it somewhere safe.");
    } catch (e) {
      setError(e instanceof Error ? e.message : es ? "No se pudo exportar" : "Could not export");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password, confirm);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : es ? "No se pudo borrar la cuenta" : "Could not delete the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ gap: 12 }}>
        <div className="assistant-avatar assistant-avatar-lg">{initials}</div>
        <div className="stack" style={{ gap: 2 }}>
          <h2 style={{ margin: 0 }}>{account.displayName}</h2>
          <p className="tiny muted" style={{ margin: 0 }}>{account.email}</p>
          <span className={`pill${isElitePlan(account.planId as PlanId) ? " pill-safe" : ""}`} style={{ marginTop: 2 }}>
            {language === "es" ? `Miembro ${planNameFor(plan.id, plan.name, language)}` : `${plan.name} member`}
          </span>
        </div>
      </div>

      {/* The gold callout, same treatment the plan picker's own upgrade path
          gets — a plan is the one thing on this screen worth a second look
          rather than a settings row. */}
      <section className="card mission" style={{ gap: 8 }}>
        <p className="mission-eyebrow" style={{ margin: 0 }}>{language === "es" ? `Plan ${planNameFor(plan.id, plan.name, language)}` : `${plan.name} plan`}</p>
        <p className="small" style={{ margin: 0 }}>
          {isElitePlan(account.planId as PlanId)
            ? es ? "Reservas con prioridad, el servicio de lujo y todo lo de los planes más bajos."
              : "Priority booking, the luxury desk, and everything on every plan below it."
            : es ? "Mira lo que trae un plan más grande: más horas de concierge, más personas, el servicio Elite."
              : "See what a bigger plan unlocks — more concierge hours, more seats, the Elite desk."}
        </p>
        <button className="btn btn-primary btn-block" onClick={onManagePlan}>{es ? "Administrar el plan" : "Manage plan"}</button>
      </section>

      <HomeAddressCard />

      <TextAlertsCard scope="account" language={language === "es" ? "es" : "en"} />
      <EmailAlertsCard scope="account" language={language === "es" ? "es" : "en"} defaultEmail={account.email} />

      {/* Above the export-and-delete block on purpose: those two are the
          leaving path, and an invite sitting under them reads as a parting
          gift. */}
      <ShareCard />

      <section className="card">
        <h3>{es ? "Llévate tus datos" : "Take your data"}</h3>
        <p className="small muted">
          {es
            ? "Todo lo que Safehubby tiene de ti, en un archivo: noches, registro de bebidas, chequeos, lo compartido, grupos, juegos, puntos y todo tu historial de ubicación."
            : "Everything Safehubby holds about you, as a file: nights, drink logs, check-ins, sharing, crews, games, points and your full location history."}
        </p>
        <button className="btn btn-block" disabled={busy} onClick={doExport}>{es ? "Descargar mis datos" : "Download my data"}</button>
        {exported && <div className="banner banner-safe">{exported}</div>}
      </section>

      <section className="card">
        <h3>{es ? "Borrar mi cuenta" : "Delete my account"}</h3>
        <p className="small">
          {es
            ? "Esto borra tu cuenta y todo lo que tiene, para siempre; no se esconde. Quien te vigile pierde el acceso enseguida. "
            : "This deletes your account and everything on it — permanently, not hidden. Anyone watching you loses access immediately. "}
          <strong>{es ? "Tu historial de ubicación no se puede recuperar." : "Your location history cannot be recovered."}</strong>
        </p>
        <p className="tiny muted">
          {es
            ? "Los grupos y juegos que compartiste con otras personas siguen para ellos, sin ti."
            : "Crews and games you shared with other people stay standing for them, with you removed."}
        </p>

        {!armed ? (
          <button className="btn btn-block btn-ghost" onClick={() => setArmed(true)}>
            {es ? "Quiero borrar mi cuenta" : "I want to delete my account"}
          </button>
        ) : (
          <>
            <div className="field">
              <label htmlFor="pw-del">{es ? "Tu contraseña" : "Your password"}</label>
              <input id="pw-del" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirm-del">{es ? "Escribe DELETE para confirmar" : "Type DELETE to confirm"}</label>
              <input id="confirm-del" value={confirm} autoCapitalize="characters"
                onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn grow" disabled={busy} onClick={() => { setArmed(false); setPassword(""); setConfirm(""); }}>
                {es ? "Quedarme con mi cuenta" : "Keep my account"}
              </button>
              <button className="btn btn-danger grow"
                disabled={busy || !password || confirm.trim().toUpperCase() !== "DELETE"}
                onClick={doDelete}>
                {es ? "Borrar para siempre" : "Delete permanently"}
              </button>
            </div>
          </>
        )}

        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    </div>
  );
}
