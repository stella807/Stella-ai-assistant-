import { useEffect, useState } from "react";
import { defaultCapFor } from "@safehubby/core";
import type { PickupRequest, PlanId } from "@safehubby/core";
import { api, type SecureQuote } from "../api.ts";
import { LiveMap } from "./LiveMap.tsx";

const FALLBACK_HOME_LABEL = "Home";

/**
 * Getting home — coordinated with a driver Safehubby actually hired, not a
 * hand-off to Uber or Lyft.
 *
 * This used to open the Uber or Lyft app with the destination filled in,
 * because nothing outside a formal partnership could quote a fare or book a
 * trip through either of their closed ride APIs. That is no longer the
 * product: Safehubby hires and pays its own drivers (see driver-pay.ts and
 * the driver application flow), so a request here is coordinated with one
 * of them instead. There is still no live-matching engine — an operator on
 * the master dashboard matches the request to an approved driver by hand,
 * the same honest "request and coordinate" shape the Elite desk already
 * uses for a jet charter — so this says exactly that rather than implying a
 * car is already on its way the instant the button is tapped.
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
    api.rideQuotes(at, dropoff).then((r) => setSecure(r.secure ?? null)).catch(() => setSecure(null));
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
          <div className="field">
            <label htmlFor="pickup-note" className="tiny muted">Anything the driver should know? (optional)</label>
            <input id="pickup-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Side entrance, silver door" />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={coordinatePickup}>
            Coordinate pickup
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>
            Matched with one of Safehubby's own drivers — not Uber, not Lyft. Someone on our end confirms who's
            coming and texts you; this isn't an instant, live-tracked booking.
          </p>
        </>
      )}

      {request && request.status === "requested" && (
        <div className="banner">
          <strong>Coordinating your pickup.</strong> We're matching you with one of our drivers and will text you
          who's coming.
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
