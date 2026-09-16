import { conciergeCategoryLabel } from "@safehubby/core";
import type { ConciergeTask } from "@safehubby/core";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { money } from "../money.ts";

const STATUS_LABEL: Record<string, string> = {
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * A single request, opened from the active-requests list — the same "tap a
 * row, see the details" shape as the task card in the employee portal, just
 * from the customer's side. Every field here is real data already on
 * `ConciergeTask`; nothing is invented for the sake of a fuller-looking
 * screen.
 */
export function RequestDetail({ task, onBack, onMessage, onComplete, onCancel, busy }: {
  task: ConciergeTask;
  onBack: () => void;
  onMessage: () => void;
  /** Omitted once the task is no longer in progress — there is nothing left to mark done or cancel. */
  onComplete?: () => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const totalHeld = task.spendCapCents + task.serviceFeeCents;

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
          {task.card && (
            <li className="row-between">
              <span className="tiny muted">Paying on</span>
              <span className="small">{task.card.network} ···· {task.card.last4} — not yours</span>
            </li>
          )}
          {task.billedCents !== undefined && (
            <li className="row-between">
              <span className="tiny muted">Actually spent</span>
              <span className="small charge-amount">{money(task.billedCents)}</span>
            </li>
          )}
        </ul>

        <button className="btn btn-block" disabled={busy} onClick={onMessage}>Message concierge</button>
        {onComplete && <button className="btn btn-block" disabled={busy} onClick={onComplete}>Mark done</button>}
        {onCancel && <button className="btn btn-block btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>}
      </section>
    </div>
  );
}
