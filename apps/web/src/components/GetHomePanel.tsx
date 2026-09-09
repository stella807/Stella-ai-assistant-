import { useState } from "react";
import { api } from "../api.ts";

const HOME = { lat: 40.7488, lng: -73.9857 };

interface HandOff {
  provider: string;
  url: string;
  description: string;
}

/**
 * Getting home.
 *
 * This used to show fares and a Book button. It does not any more, because it
 * could not honestly: Uber and Lyft both closed their public ride APIs to
 * third-party developers, so nothing outside a formal partnership can quote a
 * fare or book a trip. A made-up price on the screen where someone is deciding
 * whether they can afford to not drive is the worst possible place to be wrong.
 *
 * So the app does the honest version of the same job: opens the real app with
 * the destination already filled in, and records that they took a ride.
 */
export function GetHomePanel({ pickup, homeLabel }: {
  pickup: { lat: number; lng: number } | null;
  homeLabel: string;
}) {
  const [handoffs, setHandoffs] = useState<HandOff[] | null>(null);
  const [note, setNote] = useState<string>("");
  const [supplies, setSupplies] = useState<string | null>(null);
  const [tookRide, setTookRide] = useState(false);
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
    <section className="card" aria-label="Get home">
      <h3>Get home</h3>

      {!handoffs && (
        <button className="btn btn-primary btn-block" disabled={busy}
          onClick={() => run(async () => {
            const res = await api.rideQuotes(at, { ...HOME, label: homeLabel });
            setHandoffs(res.handoffs ?? []);
            setNote(res.note ?? "");
          })}>
          Get me home to {homeLabel}
        </button>
      )}

      {handoffs?.map((h) => (
        <a key={h.provider} className="btn btn-block ride-link" href={h.url}
          target="_blank" rel="noreferrer"
          onClick={() => {
            // Recorded on the way out: the booking finishes in their app, and
            // choosing not to drive is the thing worth rewarding either way.
            if (!tookRide) {
              setTookRide(true);
              api.bookRide(h.provider.toLowerCase(), at, HOME).catch(() => {});
            }
          }}>
          <span>
            <strong>Open {h.provider}</strong>
            <span className="tiny muted">{h.description}</span>
          </span>
        </a>
      ))}

      {handoffs && note && <p className="tiny muted">{note}</p>}
      {tookRide && <div className="banner banner-safe">Ride home logged. <b>+100 points</b> for not driving.</div>}

      <button className="btn btn-block" disabled={busy}
        onClick={() => run(async () => {
          const order = await api.orderSupplies([{ id: "liquid-iv", qty: 1 }, { id: "gatorade", qty: 1 }], homeLabel);
          setSupplies(`Basket ready for ${homeLabel} — about ${order.etaMinutes} min once you confirm it.`);
        })}>
        Send water &amp; a snack home
      </button>

      {supplies && <div className="banner banner-safe">{supplies}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
