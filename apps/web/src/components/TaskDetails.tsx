import { useRef, useState } from "react";
import type { ConciergeTask } from "@safehubby/core";
import { money } from "../money.ts";
import { useLanguage } from "../i18n.tsx";
import { taskWords } from "../app/task-copy.ts";

/**
 * Everything about the task that is not the conversation: what was held, what
 * has been bought and answered, who is who, and what to do if it went wrong.
 *
 * It used to sit above the thread in the same scrolling sheet, which pushed
 * the conversation off the screen to make room for the paperwork. It is its
 * own card now, one tap away from the chat and one tap back.
 */
export function TaskDetails({ task, busy, onSelfie, onDispute }: {
  task: ConciergeTask;
  busy: boolean;
  onSelfie: (file: File | undefined) => void;
  onDispute: (reason: string) => Promise<boolean>;
}) {
  const t = taskWords(useLanguage().language);
  const w = t.details;
  const selfieInput = useRef<HTMLInputElement>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const answered = (task.spendRequests ?? []).filter((r) => r.status !== "open");

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card card-quiet stack" style={{ gap: 4 }}>
        <div className="row-between small">
          <strong>{w.held}</strong>
          <strong className="charge-amount">{money(task.spendCapCents + task.serviceFeeCents)}</strong>
        </div>
        <span className="tiny muted">{w.heldBody(money(task.spendCapCents), task.serviceFeeCents)}</span>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <strong className="small">{w.who}</strong>
        <div className="row-between">
          {task.identityPhotos?.assistant ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <img className="selfie-thumb" alt={w.yourAssistant}
                src={`data:${task.identityPhotos.assistant.mimeType};base64,${task.identityPhotos.assistant.base64}`} />
              <span className="tiny muted">{w.yourAssistant}</span>
            </div>
          ) : <span className="tiny muted">{w.noPhoto}</span>}
          {task.identityPhotos?.traveler ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="tiny muted">{w.you}</span>
              <img className="selfie-thumb" alt={w.yourSelfie}
                src={`data:${task.identityPhotos.traveler.mimeType};base64,${task.identityPhotos.traveler.base64}`} />
            </div>
          ) : (
            <button className="btn btn-sm" disabled={busy} onClick={() => selfieInput.current?.click()}>
              {w.takeSelfie}
            </button>
          )}
          <input ref={selfieInput} type="file" accept="image/*" capture="user" hidden
            onChange={(e) => { onSelfie(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>{w.selfieNote}</p>
      </div>

      {answered.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <strong className="small">{w.bought}</strong>
          {answered.map((r) => (
            <div key={r.id} className="card card-quiet stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <img className="selfie-thumb" alt={r.note} src={`data:${r.photo.mimeType};base64,${r.photo.base64}`} />
                <div className="stack" style={{ gap: 2 }}>
                  <span className="small">{r.note}</span>
                  <span className="tiny muted">
                    {money(r.amountCents)} · {r.status === "approved" ? w.approved : w.declined}
                  </span>
                </div>
              </div>
              {r.receipt ? (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <img className="selfie-thumb" alt={w.receipt} src={`data:${r.receipt.mimeType};base64,${r.receipt.base64}`} />
                  <span className="tiny muted">{w.receipt}</span>
                </div>
              ) : <span className="tiny muted">{w.noReceipt}</span>}
            </div>
          ))}
        </div>
      )}

      {task.status === "completed" && (
        <div className="stack" style={{ gap: 6 }}>
          <strong className="small">{w.proof}</strong>
          {task.completionPhoto ? (
            <img className="selfie-thumb" alt={w.delivered} style={{ width: 96, height: 96 }}
              src={`data:${task.completionPhoto.mimeType};base64,${task.completionPhoto.base64}`} />
          ) : (
            <p className="tiny muted" style={{ margin: 0 }}>{w.noProof}</p>
          )}

          {task.disputed ? (
            <p className="tiny muted" style={{ margin: 0 }}>{w.refunded(money(task.refundedCents ?? 0))}</p>
          ) : disputing ? (
            <>
              <div className="field">
                <label htmlFor="dispute-reason">{t.whatHappenedQ}</label>
                <textarea id="dispute-reason" maxLength={280} rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)} placeholder={t.disputePlaceholderShort} />
              </div>
              <div className="row">
                <button className="btn btn-sm grow" disabled={busy} onClick={() => setDisputing(false)}>{t.cancel}</button>
                <button className="btn btn-sm btn-primary grow" disabled={busy || !reason.trim()}
                  onClick={async () => { if (await onDispute(reason)) { setDisputing(false); setReason(""); } }}>
                  {t.submitReport}
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setDisputing(true)}>
              {t.reportLong}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
