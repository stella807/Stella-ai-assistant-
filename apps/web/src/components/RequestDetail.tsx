import { useState } from "react";
import { conciergeCategoryLabel } from "@safehubby/core";
import type { ConciergeTask } from "@safehubby/core";
import { api } from "../api.ts";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { FlightCard } from "./FlightCard.tsx";
import { LiveMap } from "./LiveMap.tsx";
import { TaskCardVisual } from "./TaskCardVisual.tsx";
import { money } from "../money.ts";

const STATUS_LABEL: Record<string, string> = {
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const MAX_DISPUTE_REASON = 280;

/**
 * A single request, opened from the active- or past-requests list — the
 * same "tap a row, see the details" shape as the task card in the employee
 * portal, just from the customer's side. Every field here is real data
 * already on `ConciergeTask`; nothing is invented for the sake of a
 * fuller-looking screen.
 */
export function RequestDetail({ task, onBack, onMessage, onComplete, onCancel, onDispute, busy }: {
  task: ConciergeTask;
  onBack: () => void;
  onMessage: () => void;
  /** Omitted once the task is no longer in progress — there is nothing left to mark done or cancel. */
  onComplete?: () => void;
  onCancel?: () => void;
  /** Only offered on a completed task — see the "Only a completed task can
   *  be disputed" rule in routes.ts. Undefined elsewhere, including when
   *  the task is already disputed. */
  onDispute?: (reason: string) => Promise<unknown>;
  busy: boolean;
}) {
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  // The task's own snapshot to start — refreshed on demand, since a flight
  // in the air keeps moving and nobody wants to close and reopen the task
  // just to see if it landed yet.
  const [flight, setFlight] = useState(task.flight);
  const [flightBusy, setFlightBusy] = useState(false);
  const [flightError, setFlightError] = useState<string | null>(null);

  const totalHeld = task.spendCapCents + task.serviceFeeCents;

  const refreshFlight = async () => {
    if (!task.flightNumber || !task.flightDate) return;
    setFlightBusy(true);
    setFlightError(null);
    try {
      const res = await api.flightLookup(task.flightNumber, task.flightDate);
      setFlight(res.flight);
    } catch (e) {
      setFlightError(e instanceof Error ? e.message : "Could not refresh that flight");
    } finally {
      setFlightBusy(false);
    }
  };

  const sendDispute = async () => {
    if (!onDispute) return;
    setDisputeBusy(true);
    setDisputeError(null);
    try {
      await onDispute(reason);
      setDisputing(false);
      setReason("");
    } catch (e) {
      setDisputeError(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setDisputeBusy(false);
    }
  };

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>
        ← All requests
      </button>

      <section className="card stack">
        <div className="row-between">
          <div className="row" style={{ gap: 10 }}>
            <span className="category-tile-icon"><CategoryIcon id={task.category} /></span>
            <div className="stack" style={{ gap: 2 }}>
              <h3 style={{ margin: 0 }}>{conciergeCategoryLabel(task.category)}</h3>
              <span className="tiny muted">
                {new Date(task.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {task.peopleCount > 1 ? ` · ${task.peopleCount} people` : ""}
              </span>
            </div>
          </div>
          <span className={`pill${task.status === "in-progress" ? " pill-safe" : ""}`}>
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
        </div>

        <p className="small">{task.note}</p>

        {task.flightNumber && (
          <div className="stack" style={{ gap: 6 }}>
            {flight ? (
              <FlightCard flight={flight} />
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                Meeting flight {task.flightNumber} — no status preview yet.
              </p>
            )}
            <button className="btn btn-sm btn-ghost" disabled={flightBusy} onClick={refreshFlight}>
              {flightBusy ? "Refreshing…" : "Refresh flight status"}
            </button>
            {flightError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{flightError}</p>}
          </div>
        )}

        <LiveMap points={[{ lat: task.location.lat, lng: task.location.lng, label: task.location.label ?? "Task location" }]} />

        <ul className="timeline">
          <li className="row-between">
            <span className="tiny muted">Location</span>
            <span className="small">{task.location.label ?? "Wherever you are"}</span>
          </li>
          <li className="row-between">
            <span className="tiny muted">Assistant</span>
            <span className="small">{task.assistantName ?? task.provider}</span>
          </li>
          {task.hoursBooked !== undefined && (
            <li className="row-between">
              <span className="tiny muted">Booked for</span>
              <span className="small">{(task.hoursBooked / 100).toFixed(1).replace(/\.0$/, "")}h</span>
            </li>
          )}
          <li className="row-between">
            <span className="tiny muted">Held on your card</span>
            <span className="small charge-amount">{money(totalHeld)}</span>
          </li>
          {task.billedCents !== undefined && (
            <li className="row-between">
              <span className="tiny muted">Actually spent</span>
              <span className="small charge-amount">{money(task.billedCents)}</span>
            </li>
          )}
        </ul>

        {task.card && (
          <TaskCardVisual
            card={task.card}
            capCents={task.spendCapCents}
            caption="Assistant's card for this task"
            holderLabel="Holder"
            holderValue={task.assistantName ?? task.provider}
            footnote={`Not yours — this card only covers what ${task.assistantName ?? "your assistant"} spends on this task, up to the cap above.`}
          />
        )}

        <button className="btn btn-block" disabled={busy} onClick={onMessage}>Message concierge</button>
        {onComplete && <button className="btn btn-block" disabled={busy} onClick={onComplete}>Mark done</button>}
        {onCancel && <button className="btn btn-block btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>}
      </section>

      {/* The help for when the assistant, not the app, is what went wrong —
          never delivered, or kept money for something they didn't do. Only
          offered once a task is done; one still in progress is cancelled
          instead, which already stops the money. */}
      {task.disputed ? (
        <section className="card stack">
          <h3>Reported</h3>
          <p className="small muted">{task.disputeReason}</p>
          {typeof task.refundedCents === "number" && (
            <p className="small">{money(task.refundedCents)} refunded to your card.</p>
          )}
        </section>
      ) : onDispute && (
        <section className="card stack">
          <h3>Something wrong with this one?</h3>
          {!disputing ? (
            <button className="btn btn-block btn-ghost" onClick={() => setDisputing(true)}>
              Report a problem
            </button>
          ) : (
            <>
              <div className="field">
                <label htmlFor="dispute-reason">What happened</label>
                <textarea id="dispute-reason" rows={3} maxLength={MAX_DISPUTE_REASON} value={reason}
                  placeholder="Never showed up, and I was still charged the service fee"
                  onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="row">
                <button className="btn grow" disabled={disputeBusy}
                  onClick={() => { setDisputing(false); setReason(""); setDisputeError(null); }}>
                  Cancel
                </button>
                <button className="btn btn-primary grow" disabled={disputeBusy || !reason.trim()} onClick={sendDispute}>
                  Send report
                </button>
              </div>
              {disputeError && <div className="banner banner-danger">{disputeError}</div>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
