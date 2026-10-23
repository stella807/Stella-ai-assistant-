import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { BALANCE_MAX_CENTS } from "@safehubby/core";
import { api, type BalanceInfo } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";

const PRESETS_CENTS = [1_000, 2_500, 5_000, 10_000];

// Only someone paying in crypto downloads the checkout.
const CryptoCheckout = lazy(() => import("./CryptoCheckout.tsx"));

const COPY = {
  en: {
    title: "Safehubby balance",
    lead: "Add money with crypto and errands and assistants are paid from it. Whatever isn't spent stays here.",
    available: "Available",
    held: "Set aside for tasks in progress",
    pick: "How much?",
    cancel: "Cancel",
    added: "Added to your balance.",
    crypto: (amount: string) => `Add ${amount} with crypto`,
    cryptoNote: "Bitcoin, or USDT, USDC, SOL and ETH where offered. Money added with crypto is refunded by our team, not automatically.",
    loading: "Loading…",
    leadAth: "Add money with ATH Móvil and errands and assistants are paid from it. Whatever isn't spent stays here.",
    athPhone: "Your ATH Móvil phone number",
    ath: (amount: string) => `Add ${amount} with ATH Móvil`,
    athWaiting: (amount: string) => `Open ATH Móvil on your phone and approve the ${amount} payment to Safehubby. This page updates by itself.`,
    athCanceled: "The ATH Móvil payment was cancelled. Nothing was charged.",
    athExpired: "The ATH Móvil payment wasn't approved in time. Nothing was charged; try again.",
  },
  es: {
    title: "Balance de Safehubby",
    lead: "Añade dinero con cripto y los mandados y asistentes se pagan de ahí. Lo que no se gasta se queda aquí.",
    available: "Disponible",
    held: "Reservado para tareas en curso",
    cancel: "Cancelar",
    pick: "¿Cuánto?",
    added: "Añadido a tu balance.",
    crypto: (amount: string) => `Añadir ${amount} con cripto`,
    cryptoNote: "Bitcoin, o USDT, USDC, SOL y ETH donde se ofrezca. El dinero añadido con cripto lo devuelve nuestro equipo, no automáticamente.",
    loading: "Cargando…",
    leadAth: "Añade dinero con ATH Móvil y los mandados y asistentes se pagan de ahí. Lo que no se gasta se queda aquí.",
    athPhone: "Tu número de teléfono de ATH Móvil",
    ath: (amount: string) => `Añadir ${amount} con ATH Móvil`,
    athWaiting: (amount: string) => `Abre ATH Móvil en tu teléfono y aprueba el pago de ${amount} a Safehubby. Esta página se actualiza sola.`,
    athCanceled: "El pago de ATH Móvil se canceló. No se cobró nada.",
    athExpired: "El pago de ATH Móvil no se aprobó a tiempo. No se cobró nada; inténtalo otra vez.",
  },
} as const;

/**
 * The prepaid balance, and the crypto button that loads it.
 *
 * A crypto payment settles the moment it is made, so it pays into a balance
 * rather than sitting behind a hold like a saved PayPal account. The checkout
 * is OpenReceive's, and the server prices the load and credits it only once
 * the wallet itself reports the payment final.
 */
export function BalanceCard() {
  const { language } = useLanguage();
  const c = COPY[language === "es" ? "es" : "en"];
  const [info, setInfo] = useState<BalanceInfo | null>(null);
  const [amount, setAmount] = useState(2_500);
  const [cryptoRef, setCryptoRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [athPhone, setAthPhone] = useState("");
  /** An ATH Móvil payment waiting for the member to approve it in the app. */
  const [athLoad, setAthLoad] = useState<{ id: string; amountCents: number } | null>(null);

  const refresh = useCallback(() => api.balance().then(setInfo).catch(() => {}), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const beginCrypto = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      setCryptoRef((await api.startCryptoLoad(amount)).reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  // While an ATH Móvil payment is open, ask the server every few seconds
  // whether it was approved; the server is what talks to ATH and credits it.
  useEffect(() => {
    if (!athLoad) return;
    let stopped = false;
    const tick = async () => {
      try {
        const { status } = await api.checkAthLoad(athLoad.id);
        if (stopped || status === "open") return;
        setAthLoad(null);
        if (status === "paid") { setMessage(c.added); void refresh(); }
        else setError(status === "canceled" ? c.athCanceled : c.athExpired);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : null);
      }
    };
    const timer = setInterval(() => { void tick(); }, 4000);
    return () => { stopped = true; clearInterval(timer); };
  }, [athLoad, c, refresh]);

  const beginAth = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const { loadId } = await api.startAthLoad(amount, athPhone);
      setAthLoad({ id: loadId, amountCents: amount });
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  const cancelAth = () => {
    if (athLoad) void api.cancelAthLoad(athLoad.id).catch(() => {});
    setAthLoad(null);
  };

  if (!info) return null;
  const athReady = Boolean(info.athMovil?.ready);
  // Until crypto is turned on there is nothing to load the balance with, so
  // the card stays off the screen rather than showing a button that cannot
  // work — unless money is already in it, which is always shown.
  if (!info.crypto.ready && !athReady && info.availableCents === 0 && info.heldCents === 0) return null;
  const maxLoad = Math.min(info.maxLoadCents, Math.max(0, BALANCE_MAX_CENTS - info.availableCents - info.heldCents));

  return (
    <section className="card stack balance-card">
      <h3>{c.title}</h3>
      <p className="small muted">{info.crypto.ready ? c.lead : c.leadAth}</p>

      <div className="row-between">
        <span className="small">{c.available}</span>
        <span className="balance-amount">{money(info.availableCents)}</span>
      </div>
      {info.heldCents > 0 && (
        <div className="row-between">
          <span className="tiny muted">{c.held}</span>
          <span className="tiny muted">{money(info.heldCents)}</span>
        </div>
      )}

      {cryptoRef && (
        <>
          <Suspense fallback={<p className="small muted">{c.loading}</p>}>
            <CryptoCheckout reference={cryptoRef} onSettled={() => { setCryptoRef(null); setMessage(c.added); void refresh(); }} />
          </Suspense>
          <button className="btn btn-block btn-ghost" onClick={() => setCryptoRef(null)}>{c.cancel}</button>
        </>
      )}

      {athLoad && (
        <>
          <div className="banner">{c.athWaiting(money(athLoad.amountCents))}</div>
          <button className="btn btn-block btn-ghost" onClick={cancelAth}>{c.cancel}</button>
        </>
      )}

      {!cryptoRef && !athLoad && (info.crypto.ready || athReady) && (
        <>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="small"><strong>{c.pick}</strong></legend>
            <div className="row balance-presets">
              {PRESETS_CENTS.filter((p) => p >= info.minLoadCents && p <= maxLoad).map((p) => (
                <button key={p} type="button" className={`btn grow${amount === p ? " btn-primary" : ""}`}
                  aria-pressed={amount === p} onClick={() => setAmount(p)}>
                  ${p / 100}
                </button>
              ))}
            </div>
          </fieldset>
          {athReady && (
            <>
              <label className="stack" style={{ gap: 4 }}>
                <span className="small">{c.athPhone}</span>
                <input type="tel" inputMode="tel" autoComplete="tel" placeholder="787-555-1234"
                  value={athPhone} onChange={(e) => setAthPhone(e.target.value)} />
              </label>
              <button className="btn btn-block btn-primary" disabled={busy || amount > maxLoad || athPhone.replace(/\D/g, "").length < 10}
                onClick={beginAth}>
                {c.ath(money(amount))}
              </button>
            </>
          )}
          {info.crypto.ready && (
            <>
              <button className={`btn btn-block${athReady ? "" : " btn-primary"}`} disabled={busy || amount > maxLoad} onClick={beginCrypto}>
                {c.crypto(money(amount))}
              </button>
              <p className="tiny muted" style={{ margin: 0 }}>{c.cryptoNote}</p>
            </>
          )}
        </>
      )}

      {message && <div className="banner">{message}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
