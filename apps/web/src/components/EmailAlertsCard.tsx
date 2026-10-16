import { useEffect, useState } from "react";
import { api, type EmailAlertsState } from "../api.ts";

type Language = "en" | "es";

const COPY = {
  en: {
    title: "Email alerts",
    lead: "Prefer email to texts? Get the same alerts in your inbox — or both.",
    email: "Email address",
    agree: "Yes, email me these alerts. I can turn this off here at any time.",
    save: "Turn on email alerts",
    on: (hint: string) => `On, for ${hint}.`,
    off: "Turn off",
    saved: "Email alerts are on.",
    stopped: "Email alerts are off.",
    notReady: "Email isn't switched on for this server yet, so nothing will be sent for now.",
    private: "An email never contains a place, an amount, or what was bought — only that you should open the app.",
  },
  es: {
    title: "Alertas por correo",
    lead: "¿Prefieres el correo a los textos? Recibe las mismas alertas en tu bandeja — o ambas.",
    email: "Correo electrónico",
    agree: "Sí, envíenme estas alertas por correo. Puedo desactivarlas aquí cuando quiera.",
    save: "Activar alertas por correo",
    on: (hint: string) => `Activadas, para ${hint}.`,
    off: "Desactivar",
    saved: "Las alertas por correo están activadas.",
    stopped: "Las alertas por correo están desactivadas.",
    notReady: "El correo todavía no está activado en este servidor, así que por ahora no se enviará nada.",
    private: "Un correo nunca incluye un lugar, un monto ni lo que se compró — solo que abras la app.",
  },
} as const;

/**
 * Email as the alternative to text alerts — same alerts, same consent rule,
 * turned off in one tap. Beside the text card rather than replacing it, so a
 * person can have either or both.
 */
export function EmailAlertsCard({ scope, language, defaultEmail = "" }: {
  scope: "account" | "assistant"; language: Language; defaultEmail?: string;
}) {
  const c = COPY[language];
  const [state, setState] = useState<EmailAlertsState | null>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.emailAlerts(scope).then(setState).catch(() => {}); }, [scope]);
  if (!state) return null;

  const run = async (consent: boolean) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.saveEmailAlerts(scope, consent ? { email: email.trim(), consent, language } : { consent, language });
      setState(await api.emailAlerts(scope));
      setMessage(consent ? c.saved : c.stopped);
      setAgreed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h3>{c.title}</h3>
      <p className="small muted">{c.lead}</p>

      {state.enabled ? (
        <>
          <p className="small">{c.on(state.emailHint ?? "")}</p>
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => run(false)}>{c.off}</button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`email-alert-${scope}`}>{c.email}</label>
            <input id={`email-alert-${scope}`} type="email" inputMode="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="small">{c.agree}</span>
          </label>
          <button className="btn btn-block btn-primary" disabled={busy || !agreed || !email.includes("@")} onClick={() => run(true)}>
            {c.save}
          </button>
        </>
      )}

      <p className="tiny muted" style={{ margin: 0 }}>{c.private}</p>
      {!state.providerReady && <p className="tiny muted" style={{ margin: 0 }}>{c.notReady}</p>}
      {message && <div className="banner">{message}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
