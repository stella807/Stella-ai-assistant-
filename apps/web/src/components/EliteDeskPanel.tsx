import { useEffect, useState } from "react";
import { MAX_ELITE_BRIEF_LENGTH } from "@safehubby/core";
import type { EliteBooking, EliteService, EliteServiceId } from "@safehubby/core";
import { api } from "../api.ts";
import { money } from "../money.ts";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { FlightCard } from "./FlightCard.tsx";
import { TaskCardVisual } from "./TaskCardVisual.tsx";

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
  const [events, setEvents] = useState<Awaited<ReturnType<typeof api.eliteEvents>>["events"]>([]);
  const [eventBusy, setEventBusy] = useState<string | null>(null);
  const [spendingCard, setSpendingCard] = useState<Awaited<ReturnType<typeof api.eliteSpendingCard>> | null>(null);
  const [spendingBusy, setSpendingBusy] = useState(false);
  const [revealUrl, setRevealUrl] = useState<string | null>(null);
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
      setError(e instanceof Error ? e.message : "Could not issue your spending card");
    } finally {
      setSpendingBusy(false);
    }
  };

  const revealSpendingCard = async () => {
    setSpendingBusy(true);
    setError(null);
    try {
      const { revealUrl: url } = await api.revealEliteSpendingCard();
      setRevealUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reveal your spending card");
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
      setError(e instanceof Error ? e.message : "Could not update your RSVP");
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
      {spendingCard && (
        <section className="card stack">
          <h3>Your monthly spending allowance</h3>
          <p className="tiny muted" style={{ margin: 0 }}>
            {money(spendingCard.capCents)} a month, loaded onto a card Safehubby pays for — a free bee that comes
            with the tier, never billed to you and never drawn from your own card on file.
          </p>
          {spendingCard.card ? (
            <>
              <TaskCardVisual
                card={spendingCard.card}
                capCents={spendingCard.capCents}
                caption="This month's allowance"
                holderLabel="For"
                holderValue="You"
                footnote="Resets every calendar month — unused balance does not roll over."
              />
              <button className="btn btn-sm" disabled={spendingBusy} onClick={revealSpendingCard}>
                {spendingBusy ? "Working…" : "Reveal card number"}
              </button>
              {revealUrl && (
                <a className="btn btn-sm btn-ghost" href={revealUrl} target="_blank" rel="noreferrer">
                  Open the reveal link →
                </a>
              )}
            </>
          ) : spendingCard.automatic ? (
            <button className="btn btn-primary btn-block" disabled={spendingBusy} onClick={issueSpendingCard}>
              {spendingBusy ? "Issuing…" : `Activate this month's ${money(spendingCard.capCents)} card`}
            </button>
          ) : (
            <p className="tiny muted" style={{ margin: 0 }}>
              Card issuing isn't set up on this server yet, so there is nothing to activate — the allowance is
              real and disclosed, just not live without Revolut Business configured. See adapters/cards.ts.
            </p>
          )}
        </section>
      )}

      {events.length > 0 && (
        <section className="card stack">
          <h3>Elite member events</h3>
          <p className="tiny muted" style={{ margin: 0 }}>
            Hosted by Safehubby, free to RSVP to — separate from the Wingman Club's monthly pick, which is
            included with Elite too. Seats are limited, so an RSVP holds one.
          </p>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id} className="card card-quiet stack" style={{ gap: 4 }}>
                <div className="row-between">
                  <strong className="small">{e.emoji} {e.label}</strong>
                  <span className="tiny muted">
                    {new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}{e.city}
                  </span>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>{e.description}</p>
                <div className="row-between">
                  <span className="tiny muted">
                    {e.rsvpCount}/{e.capacity} seats taken
                  </span>
                  <button
                    className={`btn btn-sm${e.isGoing ? "" : " btn-primary"}`}
                    disabled={eventBusy === e.id || (!e.isGoing && !e.hasRoom)}
                    onClick={() => toggleRsvp(e.id, e.isGoing)}
                  >
                    {e.isGoing ? "Cancel RSVP" : e.hasRoom ? "RSVP" : "Full"}
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
              {s.commissionRate === 0 ? "no commission" : `${Math.round(s.commissionRate * 100)}% fee`}
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
