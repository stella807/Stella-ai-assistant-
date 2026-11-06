import { useCallback, useEffect, useState } from "react";
import { api, type BalanceInfo } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";

const PRESETS_CENTS = [1_000, 2_500, 5_000, 10_000];

const COPY = {
  en: {
    title: "Safehubby balance",
    lead: "Add money with your saved card and errands and assistants are paid from it. Whatever isn't spent stays here.",
    available: "Available",
    held: "Set aside for tasks in progress",
    pick: "How much?",
    other: "Or another amount ($)",
    otherHint: "Any amount, $0.50 or more.",
    addCard: "Add a card to continue",
    added: "Added to your balance.",
    add: (amount: string) => `Add ${amount} with your card`,
    adding: "Charging your card…",
    note: "Charged to your saved card through Stripe. Money added to your balance is refunded by our team, not automatically.",
    needCard: "Save a card under Payments first, then you can add money here.",
  },
  es: {
    title: "Balance de Safehubby",
    lead: "Añade dinero con tu tarjeta guardada y los mandados y asistentes se pagan de ahí. Lo que no se gasta se queda aquí.",
    available: "Disponible",
    held: "Reservado para tareas en curso",
    pick: "¿Cuánto?",
    other: "U otra cantidad ($)",
    otherHint: "Cualquier cantidad, desde $0.50.",
    addCard: "Añade una tarjeta para continuar",
    added: "Añadido a tu balance.",
    add: (amount: string) => `Añadir ${amount} con tu tarjeta`,
    adding: "Cobrando tu tarjeta…",
    note: "Se cobra a tu tarjeta guardada a través de Stripe. El dinero añadido a tu balance lo devuelve nuestro equipo, no automáticamente.",
    needCard: "Guarda primero una tarjeta en Pagos y luego podrás añadir dinero aquí.",
  },
} as const;

/** A fresh id for each tap, so a double tap or a retry is one charge, not two. */
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * The prepaid balance, and the button that loads it from the member's saved
 * card through Stripe. The server charges the card first and credits the
 * balance only if the charge went through.
 */
export function BalanceCard() {
  const { language } = useLanguage();
  const c = COPY[language === "es" ? "es" : "en"];
  const [info, setInfo] = useState<BalanceInfo | null>(null);
  const [amount, setAmount] = useState(2_500);
  // What is typed in the "another amount" box, in dollars; empty means one of the preset amounts is chosen.
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => api.balance().then(setInfo).catch(() => {}), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const load = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      setInfo(await api.loadBalance(chosen, newRequestId()));
      setMessage(c.added);
    } catch (e) {
      setError(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  if (!info) return null;
  // Until Stripe is connected there is nothing to load the balance with, so the
  // card stays off the screen rather than showing a button that cannot work,
  // unless money is already in it, which is always shown.
  if (!info.stripe.ready && info.availableCents === 0 && info.heldCents === 0) return null;
  // A typed amount wins over a preset. Whole cents, and never below the least a card payment can be.
  const typed = custom.trim() === "" ? null : Math.round(Number(custom.replace(/[$,\s]/g, "")) * 100);
  const chosen = typed ?? amount;
  const valid = Number.isFinite(chosen) && chosen >= info.minLoadCents;
  const goToCard = () => document.getElementById("payment-method")?.scrollIntoView({ behavior: "smooth", block: "start" });

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

      {info.stripe.ready && (
        <>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
            <legend className="small"><strong>{c.pick}</strong></legend>
            <div className="row balance-presets">
              {PRESETS_CENTS.map((p) => (
                <button key={p} type="button" className={`btn grow${typed === null && amount === p ? " btn-primary" : ""}`}
                  aria-pressed={typed === null && amount === p} onClick={() => { setAmount(p); setCustom(""); }}>
                  ${p / 100}
                </button>
              ))}
            </div>
            <label className="stack" style={{ gap: 4 }}>
              <span className="small">{c.other}</span>
              <input type="text" inputMode="decimal" placeholder="0.00" value={custom} aria-describedby="balance-other-hint"
                onChange={(e) => setCustom(e.target.value)} />
              <span id="balance-other-hint" className="tiny muted">{c.otherHint}</span>
            </label>
          </fieldset>
          {info.stripe.hasCard ? (
            <>
              <button className="btn btn-block btn-primary" disabled={busy || !valid} onClick={load}>
                {busy ? c.adding : valid ? c.add(money(chosen)) : c.add(money(amount))}
              </button>
              <p className="tiny muted" style={{ margin: 0 }}>{c.note}</p>
            </>
          ) : (
            <>
              <p className="small muted" style={{ margin: 0 }}>{c.needCard}</p>
              <button className="btn btn-block btn-primary" onClick={goToCard}>{c.addCard}</button>
            </>
          )}
        </>
      )}

      {message && <div className="banner">{message}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
