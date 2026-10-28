import type { SpendRequest } from "@safehubby/core";
import { money } from "../money.ts";
import { useLanguage } from "../i18n.tsx";
import { taskWords } from "../app/task-copy.ts";

/**
 * A card that pops up over the conversation when the assistant asks "is this
 * the right one?".
 *
 * They have photographed something and are standing there holding it, so the
 * answer has a clock on it. It lands on top of the thread rather than as a
 * row somewhere below it, and it is the one card that asks for an answer.
 * Nothing breaks if it is ignored — the spend cap already limits what can be
 * bought — which it says, because a card that looks urgent and is not is a
 * small dishonesty.
 */
export function SpendRequestPopup({ request, position, total, busy, onDecide }: {
  request: SpendRequest;
  /** 1-based, for "1 of 2" when more than one is waiting. */
  position: number;
  total: number;
  busy: boolean;
  onDecide: (approve: boolean) => void;
}) {
  const w = taskWords(useLanguage().language).ask;
  return (
    <div className="popup-event" role="alertdialog" aria-label={w.label}>
      <div className="popup-event-top">
        <span className="pill">{w.asking}</span>
        {total > 1 && <span className="tiny muted">{w.of(position, total)}</span>}
      </div>
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <img className="popup-event-photo" alt={request.note}
          src={`data:${request.photo.mimeType};base64,${request.photo.base64}`} />
        <div className="stack" style={{ gap: 2 }}>
          <strong>{request.note}</strong>
          <span className="small">{money(request.amountCents)}</span>
        </div>
      </div>
      {request.change && (
        <p className="tiny muted" style={{ margin: 0 }}>{w.change} {request.change.note}</p>
      )}
      <div className="row">
        <button className="btn grow" disabled={busy} onClick={() => onDecide(false)}>{w.not}</button>
        <button className="btn btn-primary grow" disabled={busy} onClick={() => onDecide(true)}>{w.right}</button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>{w.note}</p>
    </div>
  );
}
