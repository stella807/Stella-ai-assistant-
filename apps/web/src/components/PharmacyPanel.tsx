import { useEffect, useState } from "react";
import type { AmountScale } from "@safehubby/core";
import { api, type Basket, type CarePackageState } from "../api.ts";
import { AmountStepper } from "./AmountStepper.tsx";

import { money } from "../money.ts";
import { useLanguage } from "../i18n.tsx";
import { extrasWords } from "../app/extras-copy.ts";

/** $5 to $100, nudged in fives. The same control the concierge cap uses, so
 *  the two places this app asks for a spending limit behave identically. */
const CAP_SCALE: AmountScale = { minCents: 500, maxCents: 10000, stepCents: 500 };
const CAP_PRESETS_CENTS = [1500, 3000, 5000, 10000];

const TRIGGERS = ["moderate", "high", "severe"] as const;

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
  const x = extrasWords(useLanguage().language);
  const w = x.pharmacy;
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [basketId, setBasketId] = useState("hydration");
  const [trigger, setTrigger] = useState<string>("high");
  const [capCents, setCapCents] = useState(3000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.baskets().then((r) => setBaskets(r.baskets)).catch(() => {}); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : x.failed); }
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
    <section className="card" aria-label={w.title}>
      <div className="row-between">
        <h3>{w.title}</h3>
        {armed && <span className="pill pill-safe">{w.armed}</span>}
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
                      ? w.linedUp(o.deliverTo, money(o.totalCents))
                      : w.sent(o.reason === "auto" ? w.reasons.auto : o.reason === "guardian" ? w.reasons.guardian : w.reasons.self, money(o.totalCents), o.deliverTo, o.etaMinutes)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {prepared && state.handoff && (
            <a className="btn btn-primary btn-block ride-link" href={state.handoff.url} target="_blank" rel="noreferrer">
              <span>
                <strong>{w.orderAt(state.handoff.provider)}</strong>
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
              ? w.armedPrepared(baskets.find((b) => b.id === state.auth!.basketId)?.name ?? "", state.auth!.deliverTo)
              : w.armedOrdered(baskets.find((b) => b.id === state.auth!.basketId)?.name ?? "", state.auth!.deliverTo, state.auth!.capCents)}
          </p>
          <button className="btn btn-block btn-ghost" disabled={busy}
            onClick={() => run(async () => onChange(await api.cancelCarePackage(nightId)))}>
            {w.turnOff}
          </button>
        </>
      ) : impaired ? (
        <div className="banner">{w.impaired}</div>
      ) : (
        <>
          <p className="small muted">{prepared ? w.introPrepared : w.introOrdered}</p>

          <div className="chip-grid">
            {baskets.map((b) => (
              <button key={b.id} className={`chip${b.id === basketId ? " chip-on" : ""}`}
                disabled={b.locked} aria-disabled={b.locked}
                onClick={() => { if (!b.locked) setBasketId(b.id); }} aria-pressed={b.id === basketId}>
                <strong>{b.name}{b.locked && " 🔒"}</strong>
                <span className="tiny">
                  {b.locked ? w.familyPlan : money(b.items.reduce((s, i) => s + i.priceCents * i.qty, 0))}
                </span>
              </button>
            ))}
          </div>

          {baskets.some((b) => b.locked) && (
            <p className="tiny muted">{w.familyMenu}</p>
          )}

          {chosen && (
            <p className="tiny muted">
              {chosen.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}
              {prepared && w.listPrices}
            </p>
          )}

          <div className="field">
            <label htmlFor="trigger">{w.sendIt}</label>
            <select id="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
              {TRIGGERS.map((t) => <option key={t} value={t}>{w.triggers[t]}</option>)}
            </select>
          </div>

          <AmountStepper
            id="cap"
            label={prepared ? w.keepUnder : w.neverMore}
            valueCents={capCents}
            scale={CAP_SCALE}
            presetsCents={CAP_PRESETS_CENTS}
            onChange={setCapCents}
          />

          <button className="btn btn-primary btn-block" disabled={busy || Boolean(chosen?.locked) || total > capCents}
            onClick={() => run(async () => onChange(await api.authorizeCarePackage(nightId, {
              basketId, capCents, triggerBand: trigger, deliverTo: homeLabel,
            })))}>
            {chosen?.locked
              ? w.upgrade
              : total > capCents
              ? w.raise
              : prepared ? w.arm : w.armUpTo(capCents)}
          </button>

          <p className="tiny muted">{prepared ? w.soberPrepared : w.soberOrdered}</p>
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
