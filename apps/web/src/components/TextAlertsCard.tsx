import { useEffect, useState } from "react";
import { api, type TextAlertsState } from "../api.ts";

type Language = "en" | "es";

const COPY = {
  en: {
    title: "Text alerts",
    lead: {
      account: "Get a text when your assistant answers, asks you to approve a purchase, or finishes — and, if you watch over someone, when they raise an SOS or miss a check-in.",
      assistant: "Get a text when a customer books you or writes to you, so you do not have to keep this page open.",
    },
    phone: "Mobile number",
    agree: "Yes, text me these alerts. Message and data rates may apply. I can turn this off here at any time.",
    save: "Turn on text alerts",
    on: (last4: string) => `On, for the number ending ${last4}.`,
    off: "Turn off",
    saved: "Text alerts are on.",
    stopped: "Text alerts are off.",
    notReady: "Texting isn't switched on for this server yet, so nothing will be sent for now.",
    private: "A text never contains a place, an amount, or what was bought — only that you should open the app.",
  },
  es: {
    title: "Alertas por texto",
    lead: {
      account: "Recibe un texto cuando tu asistente responda, te pida aprobar una compra o termine — y, si cuidas a alguien, cuando active un SOS o no haga su check-in.",
      assistant: "Recibe un texto cuando un cliente te reserve o te escriba, para no tener que dejar esta página abierta.",
    },
    phone: "Número de celular",
    agree: "Sí, envíenme estas alertas por texto. Pueden aplicar tarifas de mensajes y datos. Puedo desactivarlas aquí cuando quiera.",
    save: "Activar alertas por texto",
    on: (last4: string) => `Activadas, para el número que termina en ${last4}.`,
    off: "Desactivar",
    saved: "Las alertas por texto están activadas.",
    stopped: "Las alertas por texto están desactivadas.",
    notReady: "El envío de textos todavía no está activado en este servidor, así que por ahora no se enviará nada.",
    private: "Un texto nunca incluye un lugar, un monto ni lo que se compró — solo que abras la app.",
  },
} as const;

/**
 * Opting in to text alerts, for a customer (and anyone who watches over
 * someone) or for an assistant. The number is only stored together with the
 * person saying they agree, and turning it off is one tap, here.
 */
export function TextAlertsCard({ scope, language }: { scope: "account" | "assistant"; language: Language }) {
  const c = COPY[language];
  const [state, setState] = useState<TextAlertsState | null>(null);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.textAlerts(scope).then(setState).catch(() => {}); }, [scope]);
  if (!state) return null;

  const run = async (consent: boolean) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.saveTextAlerts(scope, consent ? { phone: phone.trim(), consent, language } : { consent, language });
      setState(await api.textAlerts(scope));
      setMessage(consent ? c.saved : c.stopped);
      setPhone(""); setAgreed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h3>{c.title}</h3>
      <p className="small muted">{c.lead[scope]}</p>

      {state.enabled ? (
        <>
          <p className="small">{c.on(state.phoneLast4 ?? "")}</p>
          <button className="btn btn-block btn-ghost" disabled={busy} onClick={() => run(false)}>{c.off}</button>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`text-phone-${scope}`}>{c.phone}</label>
            <input id={`text-phone-${scope}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="787 555 0142"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="small">{c.agree}</span>
          </label>
          <button className="btn btn-block btn-primary" disabled={busy || !agreed || phone.trim().length < 7} onClick={() => run(true)}>
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
