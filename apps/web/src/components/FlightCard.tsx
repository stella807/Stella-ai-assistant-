import { bestTimeFor, describeFlightStatus, type FlightInfo } from "@safehubby/core";
import { LiveMap } from "./LiveMap.tsx";

const STATUS_CLASS: Record<FlightInfo["status"], string> = {
  scheduled: "",
  active: "pill-safe",
  landed: "pill-safe",
  cancelled: "pill-danger",
  diverted: "pill-warn",
  unknown: "",
};

/**
 * A flight, shown the way the person meeting it actually needs it: who's
 * operating it, where to stand, and whether it's still worth heading to the
 * airport for. Every field is `FlightInfo`'s own — see flight-tracking.ts —
 * so there is nothing here Safehubby computed except which line to put a
 * number on.
 *
 * The map only appears while a real position exists (mid-flight, within
 * provider coverage) and only ever plots that position against the arrival
 * airport — the same "show the real point, not an invented ETA" rule the
 * ride pickup pin follows for a car.
 */
export function FlightCard({ flight, showMap = true }: { flight: FlightInfo; showMap?: boolean }) {
  const now = new Date();
  const arrivalLabel = flight.arrival.name ?? flight.arrival.iata;
  const departureLabel = flight.departure.name ?? flight.departure.iata;

  return (
    <div className="card card-quiet stack" style={{ gap: 10 }}>
      <div className="row-between">
        <div className="row" style={{ gap: 10 }}>
          {flight.logoUrl ? (
            <img src={flight.logoUrl} alt={flight.airlineName} style={{ height: 28, width: "auto" }} />
          ) : (
            <span className="pill">{flight.airlineIata || "—"}</span>
          )}
          <div className="stack" style={{ gap: 1 }}>
            <strong className="small">{flight.airlineName} {flight.flightNumber}</strong>
            <span className="tiny muted">{flight.departure.iata} → {flight.arrival.iata}</span>
          </div>
        </div>
        <span className={`pill ${STATUS_CLASS[flight.status]}`}>{flight.status}</span>
      </div>

      <p className="small" style={{ margin: 0 }}>{describeFlightStatus(flight, now)}</p>

      <ul className="timeline">
        <li className="row-between">
          <span className="tiny muted">Departs — {departureLabel}</span>
          <span className="small">
            {new Date(bestTimeFor(flight.departure)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {flight.departure.terminal ? ` · T${flight.departure.terminal}` : ""}
            {flight.departure.gate ? ` gate ${flight.departure.gate}` : ""}
          </span>
        </li>
        <li className="row-between">
          <span className="tiny muted">Arrives — {arrivalLabel}</span>
          <span className="small">
            {new Date(bestTimeFor(flight.arrival)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {flight.arrival.terminal ? ` · T${flight.arrival.terminal}` : ""}
            {flight.arrival.gate ? ` gate ${flight.arrival.gate}` : ""}
          </span>
        </li>
        {flight.aircraftTailNumber && (
          <li className="row-between">
            <span className="tiny muted">Aircraft</span>
            <span className="small">{flight.aircraftTailNumber}{flight.aircraftType ? ` · ${flight.aircraftType}` : ""}</span>
          </li>
        )}
      </ul>

      {showMap && flight.position && flight.arrival.lat !== undefined && flight.arrival.lng !== undefined && (
        <>
          <LiveMap points={[
            { lat: flight.position.lat, lng: flight.position.lng, label: `${flight.flightNumber} — in the air` },
            { lat: flight.arrival.lat, lng: flight.arrival.lng, label: arrivalLabel },
          ]} />
          <p className="tiny muted" style={{ margin: 0 }}>
            Position as of {new Date(flight.position.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {flight.position.groundSpeedKts ? ` · ${Math.round(flight.position.groundSpeedKts)} kt` : ""}
            {flight.position.altitudeFt ? ` · ${Math.round(flight.position.altitudeFt).toLocaleString()} ft` : ""}
          </p>
        </>
      )}
    </div>
  );
}
