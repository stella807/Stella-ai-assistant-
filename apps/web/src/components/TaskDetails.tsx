import { useRef, useState } from "react";
import type { ConciergeTask } from "@safehubby/core";
import { money } from "../money.ts";

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
  const selfieInput = useRef<HTMLInputElement>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const answered = (task.spendRequests ?? []).filter((r) => r.status !== "open");

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card card-quiet stack" style={{ gap: 4 }}>
        <div className="row-between small">
          <strong>Held on your card</strong>
          <strong className="charge-amount">{money(task.spendCapCents + task.serviceFeeCents)}</strong>
        </div>
        <span className="tiny muted">
          {money(task.spendCapCents)} spend cap — a ceiling, charged only for what is spent — and{" "}
          {task.serviceFeeCents === 0 ? "no service fee" : `${money(task.serviceFeeCents)} service fee`}.
        </span>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <strong className="small">Who is who</strong>
        <div className="row-between">
          {task.identityPhotos?.assistant ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <img className="selfie-thumb" alt="Your assistant"
                src={`data:${task.identityPhotos.assistant.mimeType};base64,${task.identityPhotos.assistant.base64}`} />
              <span className="tiny muted">Your assistant</span>
            </div>
          ) : <span className="tiny muted">No photo from them yet</span>}
          {task.identityPhotos?.traveler ? (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="tiny muted">You</span>
              <img className="selfie-thumb" alt="Your selfie"
                src={`data:${task.identityPhotos.traveler.mimeType};base64,${task.identityPhotos.traveler.base64}`} />
            </div>
          ) : (
            <button className="btn btn-sm" disabled={busy} onClick={() => selfieInput.current?.click()}>
              Take my selfie
            </button>
          )}
          <input ref={selfieInput} type="file" accept="image/*" capture="user" hidden
            onChange={(e) => { onSelfie(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          A selfie from each of you is shared with the other, so you can confirm who you're meeting.
        </p>
      </div>

      {answered.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <strong className="small">What they bought</strong>
          {answered.map((r) => (
            <div key={r.id} className="card card-quiet stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <img className="selfie-thumb" alt={r.note} src={`data:${r.photo.mimeType};base64,${r.photo.base64}`} />
                <div className="stack" style={{ gap: 2 }}>
                  <span className="small">{r.note}</span>
                  <span className="tiny muted">
                    {money(r.amountCents)} · {r.status === "approved" ? "you said it looks right" : "you declined — the card is locked"}
                  </span>
                </div>
              </div>
              {r.receipt ? (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <img className="selfie-thumb" alt="Receipt" src={`data:${r.receipt.mimeType};base64,${r.receipt.base64}`} />
                  <span className="tiny muted">Receipt</span>
                </div>
              ) : <span className="tiny muted">No receipt yet.</span>}
            </div>
          ))}
        </div>
      )}

      {task.status === "completed" && (
        <div className="stack" style={{ gap: 6 }}>
          <strong className="small">Proof of completion</strong>
          {task.completionPhoto ? (
            <img className="selfie-thumb" alt="What your assistant delivered" style={{ width: 96, height: 96 }}
              src={`data:${task.completionPhoto.mimeType};base64,${task.completionPhoto.base64}`} />
          ) : (
            <p className="tiny muted" style={{ margin: 0 }}>Your assistant didn't attach a completion photo for this one.</p>
          )}

          {task.disputed ? (
            <p className="tiny muted" style={{ margin: 0 }}>
              Reported and refunded — {money(task.refundedCents ?? 0)} back to your card.
            </p>
          ) : disputing ? (
            <>
              <div className="field">
                <label htmlFor="dispute-reason">What happened?</label>
                <textarea id="dispute-reason" maxLength={280} rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)} placeholder="Never showed up, and I was still charged." />
              </div>
              <div className="row">
                <button className="btn btn-sm grow" disabled={busy} onClick={() => setDisputing(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary grow" disabled={busy || !reason.trim()}
                  onClick={async () => { if (await onDispute(reason)) { setDisputing(false); setReason(""); } }}>
                  Submit report
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setDisputing(true)}>
              Report a problem — never showed up or kept the money
            </button>
          )}
        </div>
      )}
    </div>
  );
}
