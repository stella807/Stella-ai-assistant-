import { useEffect, useState } from "react";
import { api, type Basket, type CarePackageState } from "../api.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const TRIGGERS = [
  { id: "moderate", label: "When I'm impaired" },
  { id: "high", label: "When I'm well past it" },
  { id: "severe", label: "Only if it gets bad" },
] as const;

/**
 * The pharmacy run: water, electrolytes and food sent home automatically once
 * the night has got away from someone.
 *
 * The purchase is authorized here, while sober, with a spending cap — the API
 * refuses an authorization from someone already impaired. Charging a drunk
 * person's card on the strength of an estimate they cannot evaluate is exactly
 * backwards, so the consent has to happen before the drinking does.
 */
export function PharmacyPanel({ nightId, state, homeLabel, band, onChange }: {
  nightId: string;
  state: CarePackageState;
  homeLabel: string;
  /** Current impairment band — arming is refused past "low". */
  band: string;
  onChange: (next: CarePackageState) => void;
}) {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [basketId, setBasketId] = useState("hydration");
  const [trigger, setTrigger] = useState<string>("high");
  const [cap, setCap] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.baskets().then((r) => setBaskets(r.baskets)).catch(() => {}); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const chosen = baskets.find((b) => b.id === basketId);
  const total = chosen ? chosen.items.reduce((s, i) => s + i.priceCents * i.qty, 0) : 0;
  const armed = state.auth?.enabled;
  // Without a pharmacy partnership nothing can be charged, so the run prepares
  // a basket and hands off. The copy must not promise a purchase either way.
  const prepared = state.mode !== "ordered";
  // Mirrors the server rule rather than offering a button that can only fail.
  const impaired = ["moderate", "high", "severe"].includes(band);

  return (
    <section className="card" aria-label="Pharmacy run">
      <div className="row-between">
        <h3>Pharmacy run</h3>
        {armed && <span className="pill pill-safe">Armed</span>}
      </div>

      {state.orders.length > 0 && (
        <>
          <ul className="timeline">
            {state.orders.map((o) => (
              <li key={o.id}>
                <div className="grow">
                  <strong className="small">{baskets.find((b) => b.id === o.basketId)?.name ?? o.basketId}</strong>
                  <div className="tiny muted">
                    {prepared
                      ? `Lined up for ${o.deliverTo} · about ${money(o.totalCents)}`
                      : `${o.reason === "auto" ? "Sent automatically" : o.reason === "guardian" ? "Sent by your person" : "You sent this"} · ${money(o.totalCents)} · ${o.deliverTo} · ~${o.etaMinutes} min`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {prepared && state.handoff && (
            <a className="btn btn-primary btn-block ride-link" href={state.handoff.url} target="_blank" rel="noreferrer">
              <span>
                <strong>Order it at {state.handoff.provider}</strong>
                <span className="tiny muted">{state.handoff.description}</span>
              </span>
            </a>
          )}
        </>
      )}

      {armed ? (
        <>
          <p className="small muted">
            {prepared
              ? `${baskets.find((b) => b.id === state.auth!.basketId)?.name} gets lined up for ${state.auth!.deliverTo} if you cross the line you set. Nothing is charged — you or your person confirm it in the store's app.`
              : `${baskets.find((b) => b.id === state.auth!.basketId)?.name} goes to ${state.auth!.deliverTo} if you cross the line you set. Capped at ${money(state.auth!.capCents)}, once per night.`}
          </p>
          <button className="btn btn-block btn-ghost" disabled={busy}
            onClick={() => run(async () => onChange(await api.cancelCarePackage(nightId)))}>
            Turn it off
          </button>
        </>
      ) : impaired ? (
        <div className="banner">
          You&apos;re past the point where Safehubby will take an authorization to spend your money. That
          isn&apos;t consent — set this up before you start next time. Whoever is watching you can still
          send one by hand.
        </div>
      ) : (
        <>
          <p className="small muted">
            {prepared
              ? "Set this up now, before you start. If the night gets away from you, Safehubby lines up water and electrolytes — you or your person confirm the order in the store's own app."
              : "Set this up now, before you start. Water and electrolytes get sent home if the night gets away from you."}
          </p>

          <div className="chip-grid">
            {baskets.map((b) => (
              <button key={b.id} className={`chip${b.id === basketId ? " chip-on" : ""}`}
                disabled={b.locked} aria-disabled={b.locked}
                onClick={() => { if (!b.locked) setBasketId(b.id); }} aria-pressed={b.id === basketId}>
                <strong>{b.name}{b.locked && " 🔒"}</strong>
                <span className="tiny">
                  {b.locked ? "Family plan" : money(b.items.reduce((s, i) => s + i.priceCents * i.qty, 0))}
                </span>
              </button>
            ))}
          </div>

          {baskets.some((b) => b.locked) && (
            <p className="tiny muted">
              🔒 Pizza night, burgers, takeout bowls and brunch are part of the Family plan's full menu.
            </p>
          )}

          {chosen && (
            <p className="tiny muted">
              {chosen.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}
              {prepared && " · prices are the store's list prices, approximate"}
            </p>
          )}

          <div className="field">
            <label htmlFor="trigger">Send it</label>
            <select id="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="cap">{prepared ? `Keep the basket under $${cap}` : `Never spend more than ($${cap})`}</label>
            <input id="cap" type="range" min={5} max={100} step={5} value={cap}
              onChange={(e) => setCap(Number(e.target.value))} />
          </div>

          <button className="btn btn-primary btn-block" disabled={busy || Boolean(chosen?.locked) || total > cap * 100}
            onClick={() => run(async () => onChange(await api.authorizeCarePackage(nightId, {
              basketId, capCents: cap * 100, triggerBand: trigger, deliverTo: homeLabel,
            })))}>
            {chosen?.locked
              ? "Upgrade to arm this"
              : total > cap * 100
              ? "Raise the limit to arm this"
              : prepared ? "Arm it" : `Arm it — up to ${money(cap * 100)}`}
          </button>

          <p className="tiny muted">
            {prepared
              ? "Set up while sober, because a basket chosen drunk is one you did not really choose. Nothing is charged automatically — Safehubby has no pharmacy partnership yet, so you confirm the order yourself."
              : "You can only set this up while you're sober. Once you're impaired Safehubby will not take an authorization to spend your money — that's not consent."}
          </p>
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
