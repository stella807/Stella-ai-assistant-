import { IssuingCardView } from "./IssuingCardView.tsx";
import { useCallback, useEffect, useState } from "react";
import { MAX_ELITE_BRIEF_LENGTH } from "@safehubby/core";
import type { EliteBooking, EliteService, EliteServiceId } from "@safehubby/core";
import { api } from "../api.ts";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { FlightCard } from "./FlightCard.tsx";
import { TaskCardVisual } from "./TaskCardVisual.tsx";
import { useLanguage } from "../i18n.tsx";
import { eliteWords } from "../app/elite-copy.ts";
import { localeOf } from "../app/dates.ts";

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
  const { language } = useLanguage();
  const w = eliteWords(language);
  const [services, setServices] = useState<(EliteService & { disclosures: string[]; commissionNote: string })[]>([]);
  const [bookings, setBookings] = useState<EliteBooking[]>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof api.eliteEvents>>["events"]>([]);
  const [eventBusy, setEventBusy] = useState<string | null>(null);
  const [spendingCard, setSpendingCard] = useState<Awaited<ReturnType<typeof api.eliteSpendingCard>> | null>(null);
  const [spendingBusy, setSpendingBusy] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const getKey = useCallback((nonce?: string) => api.eliteSpendingCardKey(nonce), []);
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
    api.eliteEvents().then((r) => setEvents(r.events)).catch(() => {});
    api.eliteSpendingCard().then(setSpendingCard).catch(() => {});
  };
  useEffect(load, []);

  const issueSpendingCard = async () => {
    setSpendingBusy(true);
    setError(null);
    try {
      const { card } = await api.issueEliteSpendingCard();
      setSpendingCard((s) => (s ? { ...s, card } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : w.errors.issue);
    } finally {
      setSpendingBusy(false);
    }
  };


  const toggleRsvp = async (eventId: string, isGoing: boolean) => {
    setEventBusy(eventId);
    try {
      const r = isGoing ? await api.cancelEliteEventRsvp(eventId) : await api.rsvpEliteEvent(eventId);
      setEvents((es) => es.map((e) => (e.id === eventId ? { ...e, isGoing: r.isGoing, rsvpCount: r.rsvpCount } : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : w.errors.rsvp);
    } finally {
      setEventBusy(null);
    }
  };

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
      setError(e instanceof Error ? e.message : w.errors.send);
    } finally {
      setBusy(false);
    }
  };

  if (services.length === 0) {
    return (
      <section className="card stack">
        <h3>{w.desk}</h3>
        <p className="small muted">{w.empty}</p>
      </section>
    );
  }

  return (
    <div className="stack">
      {spendingCard && (
        <section className="card stack">
          <h3>{w.allowance}</h3>
          <p className="tiny muted" style={{ margin: 0 }}>{w.allowanceBody(spendingCard.capCents)}</p>
          {spendingCard.card ? (
            <>
              <TaskCardVisual
                card={spendingCard.card}
                capCents={spendingCard.capCents}
                caption={w.thisMonth}
                holderLabel={w.holderFor}
                holderValue={w.you}
                footnote={w.resets}
              />
              {showCard
                ? <IssuingCardView getKey={getKey} />
                : <button className="btn btn-sm" onClick={() => setShowCard(true)}>{w.showNumber}</button>}
            </>
          ) : spendingCard.automatic ? (
            <button className="btn btn-primary btn-block" disabled={spendingBusy} onClick={issueSpendingCard}>
              {spendingBusy ? w.issuing : w.activate(spendingCard.capCents)}
            </button>
          ) : (
            <p className="tiny muted" style={{ margin: 0 }}>{w.noIssuing}</p>
          )}
        </section>
      )}

      {events.length > 0 && (
        <section className="card stack">
          <h3>{w.events}</h3>
          <p className="tiny muted" style={{ margin: 0 }}>{w.eventsBody}</p>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id} className="card card-quiet stack" style={{ gap: 4 }}>
                <div className="row-between">
                  <strong className="small">{e.emoji} {e.label}</strong>
                  <span className="tiny muted">
                    {new Date(e.date).toLocaleDateString(localeOf(language), { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}{e.city}
                  </span>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{e.description}</p>
                <div className="row-between">
                  <span className="tiny muted">
                    {w.seats(e.rsvpCount, e.capacity)}
                  </span>
                  <button
                    className={`btn btn-sm${e.isGoing ? "" : " btn-primary"}`}
                    disabled={eventBusy === e.id || (!e.isGoing && !e.hasRoom)}
                    onClick={() => toggleRsvp(e.id, e.isGoing)}
                  >
                    {e.isGoing ? w.cancelRsvp : e.hasRoom ? w.rsvp : w.full}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="category-grid">
        {services.map((s) => (
          <button key={s.id} className="category-tile" aria-pressed={selected === s.id}
            onClick={() => { setSelected(s.id); setNote(null); }}>
            <span className="category-tile-icon"><CategoryIcon id={s.id} /></span>
            <span className="category-tile-label">{s.label}</span>
            {/* No fixed price to show — the desk quotes each request — but the
                commission rate is the one number that does differ service to
                service, and it's the same reason a customer picking a plan
                shouldn't have to swipe through all of them to see it. */}
            <span className="category-tile-price">
              {s.commissionRate === 0 ? w.noCommission : w.fee(Math.round(s.commissionRate * 100))}
            </span>
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
            <label htmlFor="elite-brief">{w.need}</label>
            <textarea id="elite-brief" rows={3} value={brief} maxLength={MAX_ELITE_BRIEF_LENGTH}
              placeholder={w.briefPlaceholder}
              onChange={(e) => setBrief(e.target.value)} />
          </div>

          <button className="btn btn-primary btn-block" disabled={busy || !brief.trim()} onClick={send}>
            {w.sendDesk}
          </button>

          {note && <p className="small">{note}</p>}
          {error && <div className="banner banner-danger">{error}</div>}
        </section>
      )}

      {bookings.length > 0 && (
        <section className="card stack">
          <h3>{w.requests}</h3>
          <ul className="timeline">
            {bookings.map((b) => {
              const label = services.find((s) => s.id === b.serviceId)?.label ?? b.serviceId;
              return (
                <li key={b.id}>
                  <div className="row-between">
                    <strong className="small">{label}</strong>
                    <span className={`pill${b.status === "quoted" ? " pill-safe" : ""}`}>{w.status[b.status] ?? b.status}</span>
                  </div>
                  <p className="tiny muted" style={{ margin: "2px 0 0" }}>{b.brief}</p>
                  {b.status === "quoted" && typeof b.supplierQuoteCents === "number" && (
                    <p className="tiny muted" style={{ margin: "2px 0 0" }}>{w.quote(b.supplierQuoteCents, b.operatorName)}</p>
                  )}
                  {/* Entered by the desk's PA once the flight is actually booked —
                      see POST /api/admin/elite/bookings/:id/flight. A charter has no
                      public schedule to look up, so this is the desk's own account
                      of the booking, the same FlightCard an airport pickup uses. */}
                  {b.flight && <FlightCard flight={b.flight} showMap={false} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
