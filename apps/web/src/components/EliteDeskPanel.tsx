import { useEffect, useState } from "react";
import { MAX_ELITE_BRIEF_LENGTH } from "@safehubby/core";
import type { EliteBooking, EliteService, EliteServiceId } from "@safehubby/core";
import { api } from "../api.ts";
import { money } from "../money.ts";
import { CategoryIcon } from "./CategoryIcons.tsx";

/**
 * The Elite luxury desk: jet travel, yacht charter, villas, event production,
 * hospitality, and a concierge doctor — see elite.ts for why this is a
 * request-and-quote flow rather than a booking with a price on it.
 *
 * No spend cap, no card, nothing charged through Safehubby: the member pays
 * whichever supplier fulfils the request directly, and reads the disclosed
 * commission and — for jet travel and the doctor — the disclosures core
 * requires before agreeing to anything. Only reachable on Elite; see the
 * gate in HiringScreen.tsx.
 */
export function EliteDeskPanel() {
  const [services, setServices] = useState<(EliteService & { disclosures: string[]; commissionNote: string })[]>([]);
  const [bookings, setBookings] = useState<EliteBooking[]>([]);
  const [selected, setSelected] = useState<EliteServiceId | null>(null);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.eliteServices().then((r) => {
      setServices(r.services);
      setSelected((cur) => cur ?? r.services[0]?.id ?? null);
    }).catch(() => {});
    api.eliteBookings().then((r) => setBookings(r.bookings)).catch(() => {});
  };
  useEffect(load, []);

  const service = services.find((s) => s.id === selected);

  const send = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api.requestEliteBooking(selected, brief);
      setBrief("");
      setNote(res.note);
      await Promise.resolve(load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that to the desk.");
    } finally {
      setBusy(false);
    }
  };

  if (services.length === 0) {
    return (
      <section className="card stack">
        <h3>Elite desk</h3>
        <p className="small muted">Nothing on the desk yet for your plan.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="category-grid">
        {services.map((s) => (
          <button key={s.id} className="category-tile" aria-pressed={selected === s.id}
            onClick={() => { setSelected(s.id); setNote(null); }}>
            <span className="category-tile-icon"><CategoryIcon id={s.id} /></span>
            <span className="category-tile-label">{s.label}</span>
          </button>
        ))}
      </div>

      {service && (
        <section className="card stack">
          <h3>{service.label}</h3>
          <p className="small muted" style={{ margin: 0 }}>{service.description}</p>
          <p className="tiny muted">{service.commissionNote}</p>

          {service.disclosures.length > 0 && (
            <ul className="timeline">
              {service.disclosures.map((d) => (
                <li key={d}><span className="tiny muted">{d}</span></li>
              ))}
            </ul>
          )}

          <div className="field">
            <label htmlFor="elite-brief">What do you need?</label>
            <textarea id="elite-brief" rows={3} value={brief} maxLength={MAX_ELITE_BRIEF_LENGTH}
              placeholder="Austin to Aspen, four of us, Friday afternoon"
              onChange={(e) => setBrief(e.target.value)} />
          </div>

          <button className="btn btn-primary btn-block" disabled={busy || !brief.trim()} onClick={send}>
            Send it to the desk
          </button>

          {note && <p className="small">{note}</p>}
          {error && <div className="banner banner-danger">{error}</div>}
        </section>
      )}

      {bookings.length > 0 && (
        <section className="card stack">
          <h3>Your requests</h3>
          <ul className="timeline">
            {bookings.map((b) => {
              const label = services.find((s) => s.id === b.serviceId)?.label ?? b.serviceId;
              return (
                <li key={b.id}>
                  <div className="row-between">
                    <strong className="small">{label}</strong>
                    <span className={`pill${b.status === "quoted" ? " pill-safe" : ""}`}>{b.status}</span>
                  </div>
                  <p className="tiny muted" style={{ margin: "2px 0 0" }}>{b.brief}</p>
                  {b.status === "quoted" && typeof b.supplierQuoteCents === "number" && (
                    <p className="tiny muted" style={{ margin: "2px 0 0" }}>
                      {money(b.supplierQuoteCents)}, paid to the supplier directly
                      {b.operatorName ? ` — operated by ${b.operatorName}` : ""}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
