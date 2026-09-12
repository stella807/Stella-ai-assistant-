import { useEffect, useRef, useState } from "react";
import {
  CONCIERGE_DISCLOSURES, MAX_VOICE_MESSAGE_SECONDS, describeAssistantCapacity, serviceFeeFor,
  totalChargeCents,
} from "@safehubby/core";
import type { AssistantProfile, ConciergeCategory, ConciergeTask, VoiceMessage } from "@safehubby/core";
import { api } from "../api.ts";
import { startRecording, type ActiveRecording } from "../native/audio.ts";
import { readFileAsBase64 } from "../native/camera.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/**
 * Popup shown after picking a specific assistant from the roster. Two modes
 * in one component because they are really one screen at two points in time:
 * before a task exists it asks for the disclosure acknowledgment and sends
 * the request; the moment that request becomes a task, the same window keeps
 * open into the voice-message thread for it — closing and reopening a
 * different-looking window at exactly the point someone wants to keep
 * talking to the person they just hired would be a strange place to make
 * them re-orient.
 */
export function AssistantModal({ assistant, category, note, spendCapCents, location, existingTask, onBooked, onClose }: {
  assistant: AssistantProfile;
  category: ConciergeCategory;
  note: string;
  spendCapCents: number;
  location: { lat: number; lng: number; label?: string };
  /** Reopening an already-booked task's thread, rather than requesting a new one. */
  existingTask?: ConciergeTask;
  onBooked: (task: ConciergeTask) => void;
  onClose: () => void;
}) {
  const [task, setTask] = useState<ConciergeTask | null>(existingTask ?? null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // The live handle lives in a ref, not state: `record()` below both starts
  // and stops the same recording, and a `useEffect` keyed on a state value
  // that changes as part of that same flow would tear the recorder down out
  // from under its own stop() call the moment the state updated — a cleanup
  // meant for unmount firing mid-flow instead. A ref sidesteps that; the
  // effect below only ever runs its cleanup on unmount.
  const activeRecording = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selfieInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task) return;
    api.voiceMessages(task.id).then((r) => setMessages(r.messages)).catch(() => {});
  }, [task?.id]);

  useEffect(() => () => {
    activeRecording.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.bookConcierge({ category, note, location, spendCapCents, assistantId: assistant.id });
      setTask(res.task);
      onBooked(res.task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request");
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (activeRecording.current) {
      const active = activeRecording.current;
      activeRecording.current = null;
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setBusy(true);
      try {
        const clip = await active.stop();
        if (!task) throw new Error("No request to attach this message to yet.");
        await api.sendVoiceMessage(task.id, clip);
        const fresh = await api.voiceMessages(task.id);
        setMessages(fresh.messages);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send that message");
      } finally {
        setBusy(false);
      }
      return;
    }

    setError(null);
    const started = await startRecording(MAX_VOICE_MESSAGE_SECONDS);
    if (started === "denied") { setError("Microphone access was denied — allow it to send a voice message."); return; }
    if (started === "unavailable") { setError("Voice messages aren't available in this browser."); return; }
    activeRecording.current = started;
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const captureSelfie = async (file: File | undefined) => {
    if (!file || !task) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await readFileAsBase64(file);
      const res = await api.sendSelfie(task.id, photo);
      setTask((t) => (t ? { ...t, identityPhotos: { ...t.identityPhotos, traveler: res.photo } } : t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo");
    } finally {
      setBusy(false);
      if (selfieInput.current) selfieInput.current.value = "";
    }
  };

  const serviceFeeCents = serviceFeeFor(category);
  const totalCents = totalChargeCents(category, spendCapCents);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={assistant.name}>
        <div className="row-between">
          <div className="row" style={{ gap: 10 }}>
            <div className="assistant-avatar">
              {assistant.photoUrl ? <img src={assistant.photoUrl} alt="" /> : assistant.name.slice(0, 1)}
            </div>
            <div>
              <strong className="small">{assistant.name}</strong>
              <div className="tiny muted">{describeAssistantCapacity(assistant)}</div>
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {assistant.bio && <p className="small muted">{assistant.bio}</p>}

        {!task ? (
          <>
            <p className="small">Request: {note}</p>
            <div className="row-between tiny muted">
              <span>Spend cap (reimbursed purchase)</span>
              <span className="charge-amount">{money(spendCapCents)}</span>
            </div>
            <div className="row-between tiny muted">
              <span>Service fee (pays your assistant)</span>
              <span className="charge-amount">{money(serviceFeeCents)}</span>
            </div>
            <div className="row-between small">
              <strong>Held on your card now</strong>
              <strong className="charge-amount">{money(totalCents)}</strong>
            </div>
            <ul className="timeline">
              {CONCIERGE_DISCLOSURES.map((d) => <li key={d}><span className="tiny muted">{d}</span></li>)}
            </ul>
            <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span className="small">I understand what this means and want to send this request.</span>
            </label>
            <button className="btn btn-primary btn-block" disabled={busy || !acknowledged} onClick={send}>
              Send request
            </button>
          </>
        ) : (
          <>
            <p className="tiny muted">
              Sent — {money(totalCents)} held ({money(spendCapCents)} spend cap + {money(serviceFeeCents)} service
              fee). Leave a voice message if there's more to say.
            </p>

            <div className="row-between">
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {task.identityPhotos?.assistant ? (
                  <img className="selfie-thumb" alt="Your assistant"
                    src={`data:${task.identityPhotos.assistant.mimeType};base64,${task.identityPhotos.assistant.base64}`} />
                ) : (
                  <span className="tiny muted">No photo from them yet</span>
                )}
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {task.identityPhotos?.traveler ? (
                  <img className="selfie-thumb" alt="Your selfie"
                    src={`data:${task.identityPhotos.traveler.mimeType};base64,${task.identityPhotos.traveler.base64}`} />
                ) : (
                  <button className="btn btn-sm" disabled={busy} onClick={() => selfieInput.current?.click()}>
                    Take my selfie
                  </button>
                )}
                <input ref={selfieInput} type="file" accept="image/*" capture="user" hidden
                  onChange={(e) => captureSelfie(e.target.files?.[0])} />
              </div>
            </div>
            <p className="tiny muted">
              A selfie from each of you is shared with the other, so you can confirm who you're meeting.
            </p>

            <div className="voice-thread" aria-live="polite">
              {messages.length === 0 && <p className="tiny muted">No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`voice-bubble${m.sender === "traveler" ? " voice-bubble-mine" : ""}`}>
                  <div className="tiny muted">{m.sender === "traveler" ? "You" : assistant.name} · {m.durationSeconds}s</div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a
                      transcript isn't available for a voice note recorded on
                      the fly, same tradeoff every voice-message product makes. */}
                  <audio controls src={`data:${m.mimeType};base64,${m.audioBase64}`} />
                </div>
              ))}
            </div>
            <button className={`record-button${isRecording ? " recording" : ""}`} disabled={busy && !isRecording} onClick={record}
              aria-label={isRecording ? "Stop and send" : "Record a voice message"}>
              {isRecording ? `${elapsed}s` : "●"}
            </button>
            <p className="tiny muted" style={{ textAlign: "center" }}>
              {isRecording ? "Recording — tap to send" : `Tap to record, up to ${MAX_VOICE_MESSAGE_SECONDS}s`}
            </p>
          </>
        )}

        {error && <div className="banner banner-danger">{error}</div>}
      </div>
    </div>
  );
}
