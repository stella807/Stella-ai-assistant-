import type { ReactNode } from "react";
import { LiveMap } from "./LiveMap.tsx";
import { PopupCard } from "./PopupCard.tsx";

/**
 * The map that comes up on its own when a ride is on its way or a flight is
 * in the air: a big map first, then the one line that matters, then who to
 * call. One shell for both so a ride and a flight look like the same promise —
 * "we are watching this for you".
 */
export function TripMapPopup({ kind, title, status, points, lines, actions, onClose }: {
  kind: "ride" | "flight";
  title: string;
  status: string;
  points: { lat: number; lng: number; label?: string }[];
  lines?: string[];
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <PopupCard
      label={kind === "ride" ? "Your ride" : "Your flight"}
      onClose={onClose}
      header={
        <>
          <span className="trip-mark" aria-hidden="true">{kind === "ride" ? "🚗" : "✈️"}</span>
          <div className="popup-who">
            <strong>{title}</strong>
            <span className="tiny popup-status popup-status-live">{status}</span>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close map">Close</button>
        </>
      }
      footer={actions ? <div className="row" style={{ gap: 8, width: "100%" }}>{actions}</div> : undefined}
    >
      <div className="trip-map"><LiveMap points={points} height={340} /></div>
      {lines?.map((l) => <p key={l} className="small" style={{ margin: "8px 0 0" }}>{l}</p>)}
    </PopupCard>
  );
}
