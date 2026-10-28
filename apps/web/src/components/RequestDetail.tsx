import { useState } from "react";
import { conciergeCategoryLabel } from "@safehubby/core";
import type { ConciergeTask } from "@safehubby/core";
import { api } from "../api.ts";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { FlightCard } from "./FlightCard.tsx";
import { LiveMap } from "./LiveMap.tsx";
import { money } from "../money.ts";
import { useLanguage } from "../i18n.tsx";
import { taskWords } from "../app/task-copy.ts";
import { choiceLabel } from "../app/ask-copy.ts";
import { dayOf } from "../app/dates.ts";

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
  const { language } = useLanguage();
  const w = taskWords(language);
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


  const refreshFlight = async () => {
    if (!task.flightNumber || !task.flightDate) return;
    setFlightBusy(true);
    setFlightError(null);
    try {
      const res = await api.flightLookup(task.flightNumber, task.flightDate);
      setFlight(res.flight);
    } catch (e) {
      setFlightError(e instanceof Error ? e.message : w.errors.flight);
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
      setDisputeError(e instanceof Error ? e.message : w.errors.sendShort);
    } finally {
      setDisputeBusy(false);
    }
  };

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>
        {w.all}
      </button>

      <section className="card stack">
        <div className="row-between">
          <div className="row" style={{ gap: 10 }}>
            <span className="category-tile-icon"><CategoryIcon id={task.category} /></span>
            <div className="stack" style={{ gap: 2 }}>
              <h3 style={{ margin: 0 }}>{choiceLabel(task.category, conciergeCategoryLabel(task.category), language)}</h3>
              <span className="tiny muted">
                {dayOf(task.createdAt, language)}
                {task.peopleCount > 1 ? ` · ${w.people(task.peopleCount)}` : ""}
              </span>
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {/* Elite's "priority everything" — see the `priority` field's
                own doc comment in concierge.ts for what it actually does. */}
            {task.priority && <span className="pill pill-safe">{w.priority}</span>}
            <span className={`pill${task.status === "in-progress" ? " pill-safe" : ""}`}>
              {w.status[task.status] ?? task.status}
            </span>
          </div>
        </div>

        <p className="small">{task.note}</p>
        {task.status === "in-progress" && <QuickReply taskId={task.id} />}

        {task.flightNumber && (
          <div className="stack" style={{ gap: 6 }}>
            {flight ? (
              <FlightCard flight={flight} />
            ) : (
              <p className="small muted" style={{ margin: 0 }}>{w.meeting(task.flightNumber)}</p>
            )}
            <button className="btn btn-sm btn-ghost" disabled={flightBusy} onClick={refreshFlight}>
              {flightBusy ? w.refreshing : w.refresh}
            </button>
            {flightError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{flightError}</p>}
          </div>
        )}

        {/* No pin for an order placed for somebody else: its coordinates are only
            the middle of the area, and drawing a marker there would point at
            nothing. The words are the destination. */}
        {task.onBehalfOf ? (
          <div className="card card-quiet stack" style={{ gap: 2 }}>
            <span className="tiny muted">{w.goingTo}</span>
            <strong className="small">{task.onBehalfOf.recipientName}</strong>
            <span className="small">{task.location.label}</span>
          </div>
        ) : (
          <LiveMap points={[{ lat: task.location.lat, lng: task.location.lng, label: task.location.label ?? w.taskLocation }]} />
        )}

        <ul className="timeline">
          <li className="row-between">
            <span className="tiny muted">{w.location}</span>
            <span className="small">{task.location.label ?? w.wherever}</span>
          </li>
          <li className="row-between">
            <span className="tiny muted">{w.assistant}</span>
            <span className="small">{task.assistantName ?? task.provider}</span>
          </li>
        </ul>



        <button className="btn btn-block" disabled={busy} onClick={onMessage}>{w.openChat}</button>
        {onComplete && <button className="btn btn-block" disabled={busy} onClick={onComplete}>{w.markDone}</button>}
        {onCancel && <button className="btn btn-block btn-ghost" disabled={busy} onClick={onCancel}>{w.cancel}</button>}
      </section>

      {/* The help for when the assistant, not the app, is what went wrong —
          never delivered, or kept money for something they didn't do. Only
          offered once a task is done; one still in progress is cancelled
          instead, which already stops the money. */}
      {task.disputed ? (
        <section className="card stack">
          <h3>{w.reported}</h3>
          <p className="small muted">{task.disputeReason}</p>
          {typeof task.refundedCents === "number" && (
            <p className="small">{w.refunded(money(task.refundedCents))}</p>
          )}
        </section>
      ) : onDispute && (
        <section className="card stack">
          <h3>{w.somethingWrong}</h3>
          {!disputing ? (
            <button className="btn btn-block btn-ghost" onClick={() => setDisputing(true)}>
              {w.report}
            </button>
          ) : (
            <>
              <div className="field">
                <label htmlFor="dispute-reason">{w.whatHappened}</label>
                <textarea id="dispute-reason" rows={3} maxLength={MAX_DISPUTE_REASON} value={reason}
                  placeholder={w.disputePlaceholder}
                  onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="row">
                <button className="btn grow" disabled={disputeBusy}
                  onClick={() => { setDisputing(false); setReason(""); setDisputeError(null); }}>
                  {w.cancel}
                </button>
                <button className="btn btn-primary grow" disabled={disputeBusy || !reason.trim()} onClick={sendDispute}>
                  {w.sendReport}
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

/** Right under the request: write to your assistant and send, without
 *  opening anything else. What it costs comes by email, not here. */
function QuickReply({ taskId }: { taskId: string }) {
  const w = taskWords(useLanguage().language);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    try { await api.sendTaskMessage(taskId, text.trim()); setText(""); setSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : w.errors.send); }
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <textarea aria-label={w.messageAssistant} rows={2} value={text} placeholder={w.messagePlaceholder}
        onChange={(e) => { setText(e.target.value); setSent(false); }} />
      <button className="btn btn-primary btn-block" disabled={!text.trim()} onClick={send}>{w.send}</button>
      {sent && <p className="tiny" style={{ margin: 0 }}>{w.sent}</p>}
      {error && <p className="tiny" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
