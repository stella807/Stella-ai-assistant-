import { useCallback, useEffect, useState } from "react";
import { BALANCE_MAX_CENTS } from "@safehubby/core";
import { api, type BalanceInfo } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";
import {
  ATH_CONTAINER_ID, ATH_SCRIPT_URL, athCheckoutConfig, ecommerceIdFrom,
} from "../app/ath-checkout.ts";

const PRESETS_CENTS = [1_000, 2_500, 5_000, 10_000];

const COPY = {
  en: {
    title: "Safehubby balance",
    lead: "Load money with ATH Móvil and errands and assistants are paid from it. Whatever isn't spent stays here, and you can send it back any time.",
    available: "Available",
    held: "Set aside for tasks in progress",
    pay: (amount: string) => `Add ${amount} with ATH Móvil`,
    pick: "How much?",
    cancel: "Cancel",
    waiting: "Finish in your ATH Móvil app. Your balance updates as soon as it's confirmed.",
    added: "Added to your balance.",
    notDone: "That payment wasn't completed, so nothing was added.",
    refund: (amount: string) => `Send ${amount} back to ATH Móvil`,
    sure: "Send it back?",
    yes: "Yes, send it back",
    refunded: "Sent back to your ATH Móvil.",
    notReady: "ATH Móvil isn't turned on yet.",
  },
  es: {
    title: "Balance de Safehubby",
    lead: "Carga dinero con ATH Móvil y los mandados y asistentes se pagan de ahí. Lo que no se gasta se queda aquí y puedes devolverlo cuando quieras.",
    available: "Disponible",
    held: "Reservado para tareas en curso",
    pay: (amount: string) => `Añadir ${amount} con ATH Móvil`,
    pick: "¿Cuánto?",
    cancel: "Cancelar",
    waiting: "Termina en tu app de ATH Móvil. Tu balance se actualiza en cuanto se confirme.",
    added: "Añadido a tu balance.",
    notDone: "Ese pago no se completó, así que no se añadió nada.",
    refund: (amount: string) => `Devolver ${amount} a ATH Móvil`,
    sure: "¿Devolverlo?",
    yes: "Sí, devolverlo",
    refunded: "Devuelto a tu ATH Móvil.",
    notReady: "ATH Móvil todavía no está activado.",
  },
} as const;

interface AthWindow {
  ATHM_Checkout?: unknown;
  authorizationATHM?: () => Promise<void>;
  cancelATHM?: () => Promise<void>;
  expiredATHM?: () => Promise<void>;
  authorization?: () => Promise<unknown>;
}

/**
 * The prepaid balance, and the ATH Móvil button that loads it.
 *
 * ATH Móvil takes the money the moment the customer confirms, so it pays
 * into a balance rather than sitting behind a hold like a card. The button
 * itself is Evertec's script; what comes back from it is only a claim, and
 * the server asks Evertec whether it is true before crediting anything.
 */
export function BalanceCard() {
  const { language } = useLanguage();
  const c = COPY[language === "es" ? "es" : "en"];
  const [info, setInfo] = useState<BalanceInfo | null>(null);
  const [amount, setAmount] = useState(2_500);
  const [checkout, setCheckout] = useState<{ nonce: string; total: string; metadata1: string; metadata2: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => api.balance().then(setInfo).catch(() => {}), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const ready = info?.ath.ready === true;
  const publicToken = info && info.ath.ready ? info.ath.publicToken : null;

  // Evertec's script reads its config from the page when it loads, so each
  // payment gets a fresh script once the container is on screen.
  useEffect(() => {
    if (!checkout || !publicToken) return;
    const w = window as unknown as AthWindow;
    const nonce = checkout.nonce;
    const finish = (text: string | null, failed = false) => {
      setCheckout(null);
      setBusy(false);
      if (failed) setError(text); else setMessage(text);
      void refresh();
    };
    try {
      w.ATHM_Checkout = athCheckoutConfig({
        publicToken, total: checkout.total, metadata1: checkout.metadata1, metadata2: checkout.metadata2,
        lang: language === "es" ? "es" : "en",
      });
    } catch (e) {
      finish(e instanceof Error ? e.message : c.notDone, true);
      return;
    }
    w.authorizationATHM = async () => {
      try {
        const id = ecommerceIdFrom(await w.authorization?.());
        if (!id) return finish(c.notDone, true);
        await api.completeBalanceLoad(id, nonce);
        finish(c.added);
      } catch (e) {
        finish(e instanceof Error ? e.message : c.notDone, true);
      }
    };
    w.cancelATHM = async () => finish(null);
    w.expiredATHM = async () => finish(c.notDone, true);

    const script = document.createElement("script");
    script.src = ATH_SCRIPT_URL;
    script.async = true;
    script.onerror = () => finish(c.notReady, true);
    document.body.appendChild(script);
    return () => {
      script.remove();
      delete w.ATHM_Checkout;
      delete w.authorizationATHM;
      delete w.cancelATHM;
      delete w.expiredATHM;
    };
  }, [checkout, publicToken, language, refresh, c.added, c.notDone, c.notReady]);

  const begin = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      setCheckout(await api.startBalanceLoad(amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : c.notReady);
      setBusy(false);
    }
  };

  const refund = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.refundBalance();
      setMessage(c.refunded);
      setConfirmingRefund(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  if (!info) return null;
  // ATH Móvil is the only way to load the balance. Until it is turned on there
  // is nothing to load it with, so the card stays off the screen rather than
  // showing a button that cannot work — unless money is already in it, which
  // is always shown.
  if (!ready && info.availableCents === 0 && info.heldCents === 0) return null;
  const maxLoad = Math.min(info.maxLoadCents, Math.max(0, BALANCE_MAX_CENTS - info.availableCents - info.heldCents));

  return (
    <section className="card stack balance-card">
      <h3>{c.title}</h3>
      <p className="small muted">{c.lead}</p>

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

      {!checkout && ready && (
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
          <button className="btn btn-block btn-primary" disabled={busy || amount > maxLoad} onClick={begin}>
            {c.pay(money(amount))}
          </button>
        </>
      )}

      {checkout && (
        <>
          <p className="small">{c.waiting}</p>
          <div id={ATH_CONTAINER_ID} />
          <button className="btn btn-block btn-ghost" onClick={() => { setCheckout(null); setBusy(false); }}>{c.cancel}</button>
        </>
      )}

      {ready && info.availableCents > 0 && !checkout && (
        confirmingRefund ? (
          <div className="row">
            <button className="btn grow" disabled={busy} onClick={() => setConfirmingRefund(false)}>{c.cancel}</button>
            <button className="btn btn-primary grow" disabled={busy} onClick={refund}>{c.yes}</button>
          </div>
        ) : (
          <button className="btn btn-block btn-ghost" onClick={() => setConfirmingRefund(true)}>
            {c.refund(money(info.availableCents))}
          </button>
        )
      )}

      {message && <div className="banner">{message}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
