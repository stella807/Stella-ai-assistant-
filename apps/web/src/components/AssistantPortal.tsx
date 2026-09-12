import { useEffect, useRef, useState } from "react";
import { MAX_VOICE_MESSAGE_SECONDS, conciergeCategoryLabel } from "@safehubby/core";
import type { ConciergeTask, VoiceMessage } from "@safehubby/core";
import { api } from "../api.ts";
import { startRecording, type ActiveRecording } from "../native/audio.ts";
import { readFileAsBase64 } from "../native/camera.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type PortalTask = ConciergeTask & { requesterName: string };

/**
 * The assistant's own screen — no relation to the rider-facing app beyond
 * sharing its visual language. Reached at `?assistant_token=...`, a link the
 * partner network relays to whoever they assigned (Safehubby has no channel
 * of its own to an assistant — see docs/concierge.md), not by signing in:
 * there is no Safehubby account behind this, on purpose.
 *
 * Kept deliberately plain. It exists to answer three questions in one place —
 * what does this task need, who is it for, and what did they ask for — and
 * to let the assistant do the three things a bounded task calls for: talk to
 * the customer, confirm who's who with a selfie, and close the loop when
 * it's done or when they need to say no.
 */
export function AssistantPortal({ token }: { token: string }) {
  const [tasks, setTasks] = useState<PortalTask[] | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.assistantPortal(token)
      .then((r) => { setAssistantId(r.assistantId); setTasks(r.tasks); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your tasks"));
  };

  useEffect(load, [token]);

  if (error) {
    return (
      <div className="app stack">
        <h1>Safehubby</h1>
        <div className="banner banner-danger">{error}</div>
        <p className="small muted">
          This link should have come from the network that assigned you a task. If it's not working, ask
          them for a fresh one.
        </p>
      </div>
    );
  }

  if (!tasks) return <div className="app stack"><h1>Safehubby</h1><p className="small muted">Loading…</p></div>;

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const active = tasks.filter((t) => t.status === "in-progress");
  const past = tasks.filter((t) => t.status !== "in-progress");

  return (
    <div className="app stack">
      <div>
        <h1>Safehubby</h1>
        <p className="tiny muted">Assistant portal — the tasks assigned to you, in one place.</p>
      </div>

      {selected ? (
        <TaskDetail task={selected} token={token} onBack={() => setSelectedId(null)} onChanged={load} />
      ) : (
        <div className="stack">
          {active.length === 0 && past.length === 0 && (
            <p className="small muted">Nothing assigned to you right now.</p>
          )}

          {active.length > 0 && (
            <section className="stack">
              <span className="section-label">Active</span>
              {active.map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelectedId(t.id)} />)}
            </section>
          )}

          {past.length > 0 && (
            <section className="stack">
              <span className="section-label">Past</span>
              {past.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelectedId(t.id)} />)}
            </section>
          )}
        </div>
      )}

      {assistantId && <p className="tiny muted">Signed in as assistant {assistantId}.</p>}
    </div>
  );
}

function TaskRow({ task, onOpen }: { task: PortalTask; onOpen: () => void }) {
  return (
    <button className="card card-quiet" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} onClick={onOpen}>
      <div className="row-between">
        <div>
          <strong className="small">{conciergeCategoryLabel(task.category)}</strong>
          <div className="tiny muted">For {task.requesterName} · {task.note.slice(0, 60)}</div>
        </div>
        <span className={`pill${task.status === "in-progress" ? " pill-safe" : ""}`}>{task.status}</span>
      </div>
    </button>
  );
}

function TaskDetail({ task, token, onBack, onChanged }: {
  task: PortalTask; token: string; onBack: () => void; onChanged: () => void;
}) {
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [billed, setBilled] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRecording = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selfieInput = useRef<HTMLInputElement>(null);

  const loadMessages = () => api.assistantVoiceMessages(task.id, token).then((r) => setMessages(r.messages)).catch(() => {});
  useEffect(() => { loadMessages(); }, [task.id]);
  useEffect(() => () => {
    activeRecording.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const record = async () => {
    if (activeRecording.current) {
      const rec = activeRecording.current;
      activeRecording.current = null;
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setBusy(true);
      try {
        const clip = await rec.stop();
        await api.assistantSendVoiceMessage(task.id, token, clip);
        loadMessages();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send that message");
      } finally {
        setBusy(false);
      }
      return;
    }
    setError(null);
    const started = await startRecording(MAX_VOICE_MESSAGE_SECONDS);
    if (started === "denied") { setError("Microphone access was denied."); return; }
    if (started === "unavailable") { setError("Voice messages aren't available in this browser."); return; }
    activeRecording.current = started;
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const captureSelfie = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await readFileAsBase64(file);
      await api.assistantSendSelfie(task.id, token, photo);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo");
    } finally {
      setBusy(false);
      if (selfieInput.current) selfieInput.current.value = "";
    }
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      const cents = billed.trim() ? Math.round(Number(billed) * 100) : undefined;
      await api.assistantComplete(task.id, token, cents);
      onChanged();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark this done");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantDecline(task.id, token);
      onChanged();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not decline this");
    } finally {
      setBusy(false);
    }
  };

  const ended = task.status !== "in-progress";

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>← All tasks</button>

      <section className="card stack">
        <div className="row-between">
          <h3>{conciergeCategoryLabel(task.category)}</h3>
          <span className={`pill${!ended ? " pill-safe" : ""}`}>{task.status}</span>
        </div>
        <p className="small">{task.note}</p>
        {task.location.label && <p className="tiny muted">Near {task.location.label}</p>}

        <div className="row-between tiny muted">
          <span>You'll be paid</span>
          <span className="charge-amount">{money(task.serviceFeeCents)}</span>
        </div>
        <div className="row-between tiny muted">
          <span>Spend cap for the purchase — reimbursed on the card issued for this task</span>
          <span className="charge-amount">{money(task.spendCapCents)}</span>
        </div>

        <div className="row-between">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {task.identityPhotos?.traveler ? (
              <img className="selfie-thumb" alt={task.requesterName}
                src={`data:${task.identityPhotos.traveler.mimeType};base64,${task.identityPhotos.traveler.base64}`} />
            ) : (
              <span className="tiny muted">{task.requesterName} hasn't sent a selfie yet</span>
            )}
          </div>
          {!ended && (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {task.identityPhotos?.assistant ? (
                <img className="selfie-thumb" alt="You" src={`data:${task.identityPhotos.assistant.mimeType};base64,${task.identityPhotos.assistant.base64}`} />
              ) : (
                <button className="btn btn-sm" disabled={busy} onClick={() => selfieInput.current?.click()}>
                  Take my selfie
                </button>
              )}
              <input ref={selfieInput} type="file" accept="image/*" capture="user" hidden
                onChange={(e) => captureSelfie(e.target.files?.[0])} />
            </div>
          )}
        </div>
        <p className="tiny muted">Your selfie is shown to {task.requesterName} so they know it's you.</p>
      </section>

      <section className="card stack">
        <h3>Messages</h3>
        <div className="voice-thread" aria-live="polite">
          {messages.length === 0 && <p className="tiny muted">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`voice-bubble${m.sender === "assistant" ? " voice-bubble-mine" : ""}`}>
              <div className="tiny muted">{m.sender === "assistant" ? "You" : task.requesterName} · {m.durationSeconds}s</div>
              <audio controls src={`data:${m.mimeType};base64,${m.audioBase64}`} />
            </div>
          ))}
        </div>
        {!ended && (
          <>
            <button className={`record-button${isRecording ? " recording" : ""}`} disabled={busy && !isRecording} onClick={record}
              aria-label={isRecording ? "Stop and send" : "Record a voice message"}>
              {isRecording ? `${elapsed}s` : "●"}
            </button>
            <p className="tiny muted" style={{ textAlign: "center" }}>
              {isRecording ? "Recording — tap to send" : `Tap to record, up to ${MAX_VOICE_MESSAGE_SECONDS}s`}
            </p>
          </>
        )}
      </section>

      {!ended && (
        <section className="card stack">
          <h3>Wrap up</h3>
          <div className="field">
            <label htmlFor="billed">What did you actually spend? (optional — leave blank for the full cap)</label>
            <input id="billed" type="number" inputMode="decimal" placeholder={(task.spendCapCents / 100).toFixed(2)}
              value={billed} onChange={(e) => setBilled(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={complete}>Mark done</button>
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={decline}>
            Decline — unsafe, illegal, or not what I agreed to
          </button>
        </section>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
