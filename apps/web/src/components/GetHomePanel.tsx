import { useEffect, useRef, useState } from "react";
import { defaultCapFor } from "@safehubby/core";
import type { PickupRequest, PlanId } from "@safehubby/core";
import { api, type SecureQuote } from "../api.ts";
import { LiveMap } from "./LiveMap.tsx";
import { currentFix } from "../native/location.ts";
import { TripMapPopup } from "./TripMapPopup.tsx";
import { money } from "../money.ts";
import { useLanguage } from "../i18n.tsx";
import { rideWords } from "../app/rides-copy.ts";

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
  const { language } = useLanguage();
  const w = rideWords(language);
  const [homeAddress, setHomeAddress] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [addressLabel, setAddressLabel] = useState(w.home);
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
  // No fix passed in means the pin starts on a placeholder city; ask the
  // device once so the map opens where the rider actually is.
  useEffect(() => {
    if (pickup) return;
    currentFix().then((f) => { if (f) setPin({ lat: f.lat, lng: f.lng }); }).catch(() => {});
  }, [Boolean(pickup)]);
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
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : w.failed); }
    finally { setBusy(false); }
  };

  const saveAddress = () => run(async () => {
    const saved = await api.saveHomeAddress(at.lat, at.lng, addressLabel.trim() || w.home);
    setHomeAddress(saved.address);
  });

  // Opens by itself the moment a driver is assigned, once per request, and
  // can be brought back with the button on the banner.
  const [mapOpen, setMapOpen] = useState(false);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (request?.status === "coordinated" && announced.current !== request.id) {
      announced.current = request.id;
      setMapOpen(true);
    }
  }, [request?.status, request?.id]);

  const coordinatePickup = () => run(async () => {
    const res = await api.coordinatePickup(
      { lat: at.lat, lng: at.lng, label: w.pickup },
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
    <section className="card" aria-label={w.title}>
      <h3>{w.title}</h3>

      <LiveMap
        points={[
          { lat: at.lat, lng: at.lng, label: w.pinLabel },
          { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label ?? homeLabel },
        ]}
        onPick={!request ? setPin : undefined}
        onLocate={!request ? currentFix : undefined}
        height={!request ? 340 : 200}
      />
      {!request && (
        <p className="tiny muted" style={{ margin: 0 }}>{w.pinHelp}</p>
      )}

      {!request && (
        <>
          {arrangeFeeCents !== null && (
            <div className="row-between">
              <span className="tiny muted">{w.arrangeFor}</span>
              <strong className="small charge-amount">{money(arrangeFeeCents)}</strong>
            </div>
          )}
          <div className="field">
            <label htmlFor="pickup-note" className="tiny muted">{w.driverNote}</label>
            <input id="pickup-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={w.driverNotePlaceholder} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={coordinatePickup}>
            {w.arrange}
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>{w.arrangeHow(arrangeFeeCents)}</p>
        </>
      )}

      {request && request.status === "requested" && (
        <div className="banner">
          <strong>{w.arranging}</strong> {w.arrangingBody(request.arrangeFeeCents)}
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={cancelPickup}>{w.cancelRequest}</button>
          </div>
        </div>
      )}

      {request && request.status === "coordinated" && (
        <div className="banner banner-safe">
          <strong>{w.coming(request.driverName ?? w.yourDriver)}</strong>{" "}
          {request.driverPhone && (
            <>
              <a href={`tel:${request.driverPhone}`} className="inline-link">{w.call(request.driverPhone)}</a>
              {" · "}
              <a href={`sms:${request.driverPhone}`} className="inline-link">{w.text}</a>
            </>
          )}
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {request.rideCostCents === undefined
              ? w.fareLater(request.arrangeFeeCents)
              : w.fareTotal(request.rideCostCents, request.bookedOn, request.arrangeFeeCents)}
          </div>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => setMapOpen(true)}>{w.showMap}</button>{" "}
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={cancelPickup}>{w.cancel}</button>
          </div>
        </div>
      )}

      {mapOpen && request?.status === "coordinated" && (
        <TripMapPopup
          kind="ride"
          title={w.driverComing(request.driverName ?? w.yourDriver)}
          status={w.onTheWay}
          points={[
            { lat: at.lat, lng: at.lng, label: w.pickup },
            { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label ?? homeLabel },
          ]}
          lines={[w.to(dropoff.label ?? homeLabel)]}
          actions={request.driverPhone ? (
            <>
              <a className="btn btn-primary" href={`tel:${request.driverPhone}`}>{w.callShort}</a>
              <a className="btn" href={`sms:${request.driverPhone}`}>{w.text}</a>
            </>
          ) : undefined}
          onClose={() => setMapOpen(false)}
        />
      )}

      {secure && (
        <section className="secure">
          <div className="row-between">
            <div>
              <strong className="small">{w.protectedRide(secure.provider)}</strong>
              <div className="tiny muted">{secure.description}</div>
            </div>
            <strong>${(secure.fareEstimateCents / 100).toFixed(0)}</strong>
          </div>

          <button className="btn btn-sm btn-ghost btn-block" onClick={() => setSecureOpen((o) => !o)}>
            {secureOpen ? w.hideDetails : w.whatThisMeans}
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
                {w.bookSecure((secure.fareEstimateCents / 100).toFixed(0), secure.etaMinutes)}
              </button>
            </>
          )}
        </section>
      )}

      {!homeAddress ? (
        <div className="field">
          <label htmlFor="address-label" className="tiny muted">{w.saveAddressLabel}</label>
          <div className="row" style={{ gap: 6 }}>
            <input id="address-label" type="text" value={addressLabel}
              onChange={(e) => setAddressLabel(e.target.value)} placeholder={w.home} style={{ flex: 1 }} />
            <button className="btn btn-sm" disabled={busy} onClick={saveAddress}>{w.saveAddress}</button>
          </div>
        </div>
      ) : (
        <>
          <p className="tiny muted" style={{ margin: 0 }}>{w.deliveringTo(homeAddress.label)}</p>
          <button className="btn btn-block" disabled={busy}
            onClick={() => run(async () => {
              setSuppliesError(null);
              try {
                const { task } = await api.bookConcierge({
                  category: "grab-something",
                  note: w.suppliesNote,
                  location: homeAddress,
                  spendCapCents: defaultCapFor("grab-something", planId),
                  quickTask: true,
                });
                setSupplies(w.suppliesOnWay(task.assistantName, homeAddress.label));
              } catch (e) {
                setSuppliesError(e instanceof Error ? e.message : w.suppliesFailed);
              }
            })}>
            {w.bringSupplies}
          </button>
        </>
      )}

      {supplies && <div className="banner banner-safe">{supplies}</div>}
      {suppliesError && <div className="banner banner-danger">{suppliesError}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
