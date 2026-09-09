import { useState } from "react";
import { api, type SecureQuote } from "../api.ts";

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
  const [automatic, setAutomatic] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<{ productId: string | null; productName: string | null; fareCents: number | null; etaMinutes: number | null }[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [booked, setBooked] = useState<any>(null);
  const [secure, setSecure] = useState<SecureQuote | null>(null);
  const [secureOpen, setSecureOpen] = useState(false);
  const [note, setNote] = useState<string>("");
  const [supplies, setSupplies] = useState<{ text: string; url?: string | null; cta?: string } | null>(null);
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
            setAutomatic(res.mode === "automatic" ? (res.provider ?? "your ride") : null);
            setEstimates(res.estimates ?? []);
            setChosen(res.estimates?.[0]?.productId ?? null);
            setHandoffs(res.handoffs ?? []);
            setSecure(res.secure ?? null);
            setNote(res.note ?? "");
          })}>
          Get me home to {homeLabel}
        </button>
      )}

      {automatic && !booked && (
        <>
          {estimates.length > 0 && (
            <ul className="rides">
              {estimates.map((e) => (
                <li key={e.productId ?? e.productName}>
                  <button type="button"
                    className={`ride${chosen === e.productId ? " ride-on" : ""}`}
                    aria-pressed={chosen === e.productId}
                    onClick={() => setChosen(e.productId)}>
                    <span className="ride-name">
                      {e.productName ?? "Ride"}
                      <span className="ride-eta">
                        {e.etaMinutes !== null ? `${e.etaMinutes} min away` : "Checking availability"}
                      </span>
                    </span>
                    {/* Uber's own quote. Safehubby never computes a fare. */}
                    <span className="ride-fare">
                      {e.fareCents !== null ? `$${(e.fareCents / 100).toFixed(2)}` : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button className="btn btn-primary btn-block" disabled={busy}
            onClick={() => run(async () => {
              const res = await api.bookRide(chosen ?? automatic.toLowerCase(), at, { ...HOME, label: homeLabel });
              setBooked(res);
              setTookRide(true);
            })}>
            Book it — {automatic} comes to you
          </button>

          {estimates.length > 0 && (
            <p className="tiny muted">Fares are Uber's estimate and are charged by them, not by Safehubby.</p>
          )}
        </>
      )}

      {booked && (
        <div className="banner banner-safe">
          <strong>{booked.provider} booked.</strong>{" "}
          {booked.etaMinutes ? `About ${booked.etaMinutes} min away. ` : ""}
          {booked.driver?.plate ? `Look for ${booked.driver.plate}. ` : ""}
          <b>+100 points</b> for not driving.
        </div>
      )}

      {secure && (
        <section className="secure">
          <div className="row-between">
            <div>
              <strong className="small">{secure.provider} — protected ride</strong>
              <div className="tiny muted">{secure.description}</div>
            </div>
            <strong>${(secure.fareEstimateCents / 100).toFixed(0)}</strong>
          </div>

          <button className="btn btn-sm btn-ghost btn-block" onClick={() => setSecureOpen((o) => !o)}>
            {secureOpen ? "Hide the details" : "What this means"}
          </button>

          {secureOpen && (
            <>
              <ul className="list-plain">
                {secure.disclosures.map((d) => <li key={d} className="tiny">{d}</li>)}
              </ul>
              <button className="btn btn-primary btn-block" disabled={busy}
                onClick={() => run(async () => {
                  const res = await api.bookSecureRide(at, { ...HOME, label: homeLabel });
                  setBooked(res);
                  setTookRide(true);
                })}>
                I understand — book it (~${(secure.fareEstimateCents / 100).toFixed(0)}, {secure.etaMinutes} min)
              </button>
            </>
          )}
        </section>
      )}

      {!automatic && handoffs?.map((h) => (
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
          const res = await api.orderSupplies([
            { id: "liquid-iv", name: "Liquid I.V. hydration packs", qty: 1, priceCents: 999 },
            { id: "gatorade", name: "Gatorade", qty: 2, priceCents: 349 },
            { id: "crackers", name: "Saltine crackers", qty: 1, priceCents: 299 },
          ], homeLabel);

          if (res.mode === "cart-ready") {
            setSupplies({
              text: `Basket built and waiting at ${res.provider}. One tap to check out — it goes to ${homeLabel}.`,
              url: res.trackingUrl,
              cta: `Check out at ${res.provider}`,
            });
          } else {
            setSupplies({
              text: res.error
                ? `${res.provider} didn't answer, so here's the basket at ${res.handoff?.provider} instead.`
                : `Basket ready. You place the order at ${res.handoff?.provider}.`,
              url: res.handoff?.url,
              cta: `Open ${res.handoff?.provider}`,
            });
          }
        })}>
        Send water &amp; a snack home
      </button>

      {supplies && (
        <div className="banner banner-safe">
          {supplies.text}
          {supplies.url && (
            <>
              {" "}
              <a href={supplies.url} target="_blank" rel="noreferrer" className="inline-link">{supplies.cta}</a>
            </>
          )}
        </div>
      )}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
