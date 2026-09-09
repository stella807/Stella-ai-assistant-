import { useEffect, useState } from "react";
import { api, type PendingOrder } from "../api.ts";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * The sober ask.
 *
 * Food ordered at 1am is queued, not charged. This is the prompt that finally
 * puts the question — and it only appears once the estimate says the person can
 * actually answer it. An "are you sure?" tapped by someone too drunk to read it
 * is not consent, it is a formality with a charge attached.
 */
export function PendingOrderPrompt() {
  const [askNow, setAskNow] = useState<PendingOrder[]>([]);
  const [waiting, setWaiting] = useState<PendingOrder[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.pendingOrders()
      .then((r) => { setAskNow(r.askNow); setWaiting(r.waiting); })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); load(); } finally { setBusy(false); }
  };

  if (askNow.length === 0) {
    if (waiting.length === 0) return null;
    return (
      <div className="banner">
        {waiting.length} order{waiting.length > 1 ? "s" : ""} waiting. Safehubby will ask you about
        {waiting.length > 1 ? " them" : " it"} once you have sobered up — nothing has been charged.
      </div>
    );
  }

  return (
    <>
      {askNow.map((o) => (
        <section key={o.id} className="card ask">
          <h3>Still want this?</h3>
          <p className="small">{o.queuedBecause}</p>

          <ul className="timeline">
            {o.lines.map((l) => (
              <li key={l.sku}>
                <div className="grow"><strong className="small">{l.qty}× {l.name}</strong></div>
                <span className="small">{money(l.priceCents * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="row-between">
            <span className="small muted">{o.vendorName} → {o.deliverTo}</span>
            <strong>{money(o.totalCents)}</strong>
          </div>

          <div className="row">
            <button className="btn grow" disabled={busy} onClick={() => act(() => api.declineOrder(o.id))}>
              No thanks
            </button>
            <button className="btn btn-primary grow" disabled={busy} onClick={() => act(() => api.confirmOrder(o.id))}>
              Order it
            </button>
          </div>

          <p className="tiny muted">Queued last night and held until now. Nothing was charged while you were out.</p>
        </section>
      ))}
    </>
  );
}
