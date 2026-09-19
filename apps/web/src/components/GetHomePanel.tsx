import { useEffect, useState } from "react";
import { defaultCapFor } from "@safehubby/core";
import type { PickupRequest, PlanId } from "@safehubby/core";
import { api, type SecureQuote } from "../api.ts";
import { LiveMap } from "./LiveMap.tsx";
import { money } from "../money.ts";

const FALLBACK_HOME_LABEL = "Home";

/**
 * Getting home — Safehubby arranges the ride on a rideshare, and a person
 * does the arranging.
 *
 * This used to hand off to Uber or Lyft by deep link, which left the rider
 * doing the work themselves; then it dispatched Safehubby's own drivers,
 * which needs a roster of insured drivers before anyone can be taken
 * anywhere. It now does the thing in between, and the thing that is actually
 * a service: somebody on the Safehubby side opens the rideshare app and
 * books the trip for them. Uber retired its Ride Request API for
 * third-party apps (see docs/mobile.md), so no app can book that ride — but
 * a person with a phone needs no API at all.
 *
 * Two numbers, and only one of them is Safehubby's: the arranging fee,
 * published up front, and the fare, which the rideshare sets and which is
 * passed through at whatever it actually came to. The fare is deliberately
 * not estimated here — see ride-coordination.ts for why a straight-line
 * guess at somebody else's surge-priced fare would be fabrication.
 */
export function GetHomePanel({ pickup, homeLabel, planId }: {
  pickup: { lat: number; lng: number } | null;
  homeLabel: string;
  /** So the one-tap "bring water & a snack" button below opens at a cap the
   *  server will actually accept — Free's own `grab-something` ceiling is
   *  far below the standard default. See `defaultCapFor` in concierge.ts. */
  planId: PlanId;
}) {
  const [homeAddress, setHomeAddress] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [addressLabel, setAddressLabel] = useState(FALLBACK_HOME_LABEL);
  const [request, setRequest] = useState<PickupRequest | null>(null);
  const [secure, setSecure] = useState<SecureQuote | null>(null);
  // What Safehubby charges to arrange the ride. The fare itself is not
  // here and is not guessed — see this file's doc comment.
  const [arrangeFeeCents, setArrangeFeeCents] = useState<number | null>(null);
  const [secureOpen, setSecureOpen] = useState(false);
  const [note, setNote] = useState("");
  const [supplies, setSupplies] = useState<string | null>(null);
  const [suppliesError, setSuppliesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gpsFix = pickup ?? { lat: 40.714, lng: -74.003 };
  // The exact spot a driver is sent to, not just wherever the phone's GPS
  // says it is. A fix is routinely off by a building's width in a crowded
  // venue or a parking structure, and until now there was no way to correct
  // that before someone got sent to the wrong door — see the pin-drop map
  // below. Starts at the GPS fix and only moves when the rider says so.
  const [pin, setPin] = useState(gpsFix);
  useEffect(() => { setPin(gpsFix); }, [gpsFix.lat, gpsFix.lng]);
  const at = pin;

  const dropoff = homeAddress ?? { lat: 40.7488, lng: -73.9857, label: homeLabel };

  useEffect(() => {
    api.homeAddress().then((r) => setHomeAddress(r.address)).catch(() => {});
    api.myPickupRequests().then((r) => {
      const active = r.requests.find((req) => req.status === "requested" || req.status === "coordinated");
      setRequest(active ?? null);
    }).catch(() => {});
  }, []);
  // Secure transport is a real, separately vetted protective-service
  // provider, not Uber or Lyft — kept, unlike the ordinary ride quote this
  // used to also come from. `rideQuotes` is still the endpoint that computes
  // it (see POST /api/rides/quote in routes.ts), so this reads only that
  // one field off it and ignores the handoffs/estimates it also returns.
  useEffect(() => {
    api.rideQuotes(at, dropoff).then((r) => {
      setSecure(r.secure ?? null);
      setArrangeFeeCents(r.standard.arrangeFeeCents);
    }).catch(() => { setSecure(null); setArrangeFeeCents(null); });
  }, [at.lat, at.lng, dropoff.lat, dropoff.lng]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const saveAddress = () => run(async () => {
    const saved = await api.saveHomeAddress(at.lat, at.lng, addressLabel.trim() || FALLBACK_HOME_LABEL);
    setHomeAddress(saved.address);
  });

  const coordinatePickup = () => run(async () => {
    const res = await api.coordinatePickup(
      { lat: at.lat, lng: at.lng, label: "Pickup" },
      { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label },
      note || undefined,
    );
    setRequest(res.request);
  });

  const cancelPickup = () => run(async () => {
    if (!request) return;
    const res = await api.cancelPickupRequest(request.id);
    setRequest(res.request);
  });

  return (
    <section className="card" aria-label="Get home">
      <h3>Get home</h3>

      <LiveMap
        points={[
          { lat: at.lat, lng: at.lng, label: "Pickup — drag or tap to move" },
          { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label ?? homeLabel },
        ]}
        onPick={!request ? setPin : undefined}
      />
      {!request && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Drag the pin, or tap anywhere on the map, to set exactly where the driver should pick you up — your
          device's location is only a starting guess.
        </p>
      )}

      {!request && (
        <>
          {arrangeFeeCents !== null && (
            <div className="row-between">
              <span className="tiny muted">We arrange it for</span>
              <strong className="small charge-amount">{money(arrangeFeeCents)}</strong>
            </div>
          )}
          <div className="field">
            <label htmlFor="pickup-note" className="tiny muted">Anything the driver should know? (optional)</label>
            <input id="pickup-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Side entrance, silver door" />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={coordinatePickup}>
            Arrange my ride
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>
            Someone on our end books the ride for you and texts you who's coming. You pay the fare, whatever it
            comes to — we tell you the price before booking, because by then we're looking at it — plus
            {arrangeFeeCents !== null ? ` the ${money(arrangeFeeCents)} for arranging it.` : " a small fee for arranging it."}
          </p>
        </>
      )}

      {request && request.status === "requested" && (
        <div className="banner">
          <strong>Arranging your ride.</strong> We're booking it now and will text you the price and who's coming.
          Arranging fee {money(request.arrangeFeeCents)}; the fare is whatever the ride costs.
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={cancelPickup}>Cancel request</button>
          </div>
        </div>
      )}

      {request && request.status === "coordinated" && (
        <div className="banner banner-safe">
          <strong>{request.driverName} is coming to get you.</strong>{" "}
          {request.driverPhone && (
            <>
              <a href={`tel:${request.driverPhone}`} className="inline-link">Call {request.driverPhone}</a>
              {" · "}
              <a href={`sms:${request.driverPhone}`} className="inline-link">Text</a>
            </>
          )}
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {request.rideCostCents === undefined
              ? `Arranging fee ${money(request.arrangeFeeCents)}. We'll confirm the fare once it's booked.`
              : `${money(request.rideCostCents)} fare${request.bookedOn ? ` on ${request.bookedOn}` : ""} + ${money(request.arrangeFeeCents)} arranging = ${money(request.rideCostCents + request.arrangeFeeCents)}.`}
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={cancelPickup}>Cancel</button>
          </div>
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
                  await api.bookSecureRide(at, dropoff);
                })}>
                I understand — book it (~${(secure.fareEstimateCents / 100).toFixed(0)}, {secure.etaMinutes} min)
              </button>
            </>
          )}
        </section>
      )}

      {!homeAddress ? (
        <div className="field">
          <label htmlFor="address-label" className="tiny muted">
            Save a delivery address so an errand runner can bring you things later
          </label>
          <div className="row" style={{ gap: 6 }}>
            <input id="address-label" type="text" value={addressLabel}
              onChange={(e) => setAddressLabel(e.target.value)} placeholder="Home" style={{ flex: 1 }} />
            <button className="btn btn-sm" disabled={busy} onClick={saveAddress}>Save this pin as my address</button>
          </div>
        </div>
      ) : (
        <>
          <p className="tiny muted" style={{ margin: 0 }}>Delivering to {homeAddress.label}.</p>
          <button className="btn btn-block" disabled={busy}
            onClick={() => run(async () => {
              setSuppliesError(null);
              try {
                const { task } = await api.bookConcierge({
                  category: "grab-something",
                  note: "Water, Liquid I.V. or Pedialyte, and a snack",
                  location: homeAddress,
                  spendCapCents: defaultCapFor("grab-something", planId),
                  quickTask: true,
                });
                setSupplies(`On the way from ${task.assistantName ?? "an errand runner"} to ${homeAddress.label}.`);
              } catch (e) {
                setSuppliesError(e instanceof Error ? e.message : "Could not send that right now");
              }
            })}>
            Have an errand runner bring water &amp; a snack
          </button>
        </>
      )}

      {supplies && <div className="banner banner-safe">{supplies}</div>}
      {suppliesError && <div className="banner banner-danger">{suppliesError}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
