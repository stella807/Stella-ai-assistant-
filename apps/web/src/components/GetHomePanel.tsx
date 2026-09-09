import { useState } from "react";
import type { RideQuote } from "@safehubby/core";
import { api } from "../api.ts";

const HOME = { lat: 40.7488, lng: -73.9857 };

/** Rides, supplies, and the safe-route note. Fares come from the ride provider. */
export function GetHomePanel({ pickup, homeLabel }: {
  pickup: { lat: number; lng: number } | null;
  homeLabel: string;
}) {
  const [quotes, setQuotes] = useState<RideQuote[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const [supplies, setSupplies] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const at = pickup ?? { lat: 40.714, lng: -74.003 };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  return (
    <section className="card stack" aria-label="Get home">
      <h3>Get home</h3>

      {!quotes && (
        <button className="btn btn-primary btn-block" disabled={busy}
          onClick={() => run(async () => setQuotes(await api.rideQuotes(at, HOME)))}>
          Find me a ride to {homeLabel}
        </button>
      )}

      {quotes && !booked && (
        <>
          <ul className="rides">
            {quotes.map((q) => (
              <li key={q.providerId}>
                <button
                  type="button"
                  className={`ride${chosen === q.providerId ? " ride-on" : ""}`}
                  aria-pressed={chosen === q.providerId}
                  onClick={() => setChosen(q.providerId)}
                >
                  <span className="ride-name">
                    {q.productName}
                    <span className="ride-eta">{q.providerName} · {q.etaMinutes} min away</span>
                  </span>
                  <span className="ride-fare">${(q.fareEstimateCents / 100).toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>

          <button className="btn btn-primary btn-block" disabled={busy || !chosen}
            onClick={() => run(async () => {
              const b = await api.bookRide(chosen!, at, HOME);
              setBooked(b.bookingId);
            })}>
            {chosen
              ? `Book ${quotes.find((q) => q.providerId === chosen)!.productName}`
              : "Choose a ride"}
          </button>

          <p className="tiny muted">Fares and driver pay are set by the ride company. Safehubby only shows their estimate.</p>
        </>
      )}

      {booked && <div className="banner banner-safe">Ride booked ({booked}). +100 points for not driving.</div>}

      <button className="btn btn-block" disabled={busy}
        onClick={() => run(async () => {
          const order = await api.orderSupplies([{ id: "liquid-iv", qty: 1 }, { id: "gatorade", qty: 1 }, { id: "crackers", qty: 1 }], homeLabel);
          setSupplies(`Electrolytes and a snack heading to ${homeLabel} — about ${order.etaMinutes} min.`);
        })}>
        Send water &amp; a snack home
      </button>

      {supplies && <div className="banner banner-safe">{supplies}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
