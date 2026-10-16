import { useEffect, useRef, useState } from "react";
import {
  CONCIERGE_DISCLOSURES, MAX_TEXT_MESSAGE_LENGTH, MAX_VOICE_MESSAGE_SECONDS, assistantPayoutFor, errandPayoutCents,
  describeAssistantCapacity, findRole,
} from "@safehubby/core";
import type { AssistantProfile, ConciergeCategory, ConciergeTask, ErrandTierId, OnBehalfOf, VoiceMessage } from "@safehubby/core";
import type { TaskTextMessage } from "../api.ts";
import { api } from "../api.ts";
import { startRecording, type ActiveRecording } from "../native/audio.ts";
import { permissionCopy, settingsPath } from "../native/permissions.ts";
import { PermissionGate } from "./PermissionGate.tsx";
import { readFileAsBase64 } from "../native/camera.ts";
import { TaskMessageThread } from "./TaskMessageThread.tsx";
import { PopupCard } from "./PopupCard.tsx";
import { SpendRequestPopup } from "./SpendRequestPopup.tsx";
import { TaskDetails } from "./TaskDetails.tsx";
import { assistantFace, pendingSpendRequests, statusLine } from "../app/chat-cards.ts";

/** Exact, to the cent — this screen is where the hold is actually agreed to,
 *  so it follows the same rule ConciergePanel's own pricing card does: a fee
 *  of $87.50 shown as $88 is a number the customer did not actually accept. */
import { money } from "../money.ts";

/** How often an open, still-running thread re-reads its messages. Ten
 *  seconds is fast enough that "I'm outside" lands while it still means
 *  something, and slow enough not to matter to a phone's battery. */
const MESSAGE_POLL_MS = 10_000;

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
export function AssistantModal({ assistant, category, note, spendCapCents, quickTask, errandTier, onBehalfOf, acknowledgedOnBehalf, hours, location, flight, existingTask, onBooked, onClose }: {
  assistant: AssistantProfile;
  category: ConciergeCategory;
  note: string;
  spendCapCents: number;
  /** Only for work paid by the hour; absent on an errand. */
  hours?: number;
  /** Whether the subscriber opted into the discounted quick-task fee. */
  quickTask?: boolean;
  /** How big an errand this is — prices the runner's pay and the fee. */
  errandTier?: ErrandTierId;
  /** For somebody other than the customer, and that the customer has agreed
   *  to the notes about it — agreed on the screen before this one. */
  onBehalfOf?: OnBehalfOf;
  acknowledgedOnBehalf?: boolean;
  location: { lat: number; lng: number; label?: string };
  /** Required for, and only for, `airport-pickup` — see `ConciergeTaskInput.flight`. */
  flight?: { flightNumber: string; date: string };
  /** Reopening an already-booked task's thread, rather than requesting a new one. */
  existingTask?: ConciergeTask;
  onBooked: (task: ConciergeTask) => void;
  onClose: () => void;
}) {
  const [task, setTask] = useState<ConciergeTask | null>(existingTask ?? null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fetched fresh from the server rather than computed client-side, so the
  // number shown is never out of sync with what booking will actually
  // charge. `null` while loading or if the quote call hasn't resolved yet.
  const [serviceFeeCents, setServiceFeeCents] = useState<number | null>(existingTask?.serviceFeeCents ?? null);
  const [totalCents, setTotalCents] = useState<number | null>(
    existingTask ? existingTask.spendCapCents + existingTask.serviceFeeCents : null,
  );
  // How many people the task covers. Scales the assistant's pay and so the
  // fee — the server clamps it to the plan's seats and reports the ceiling
  // back, rather than this screen assuming what the plan allows.
  const [peopleCount, setPeopleCount] = useState(existingTask?.peopleCount ?? 1);
  const [maxPeopleCount, setMaxPeopleCount] = useState(1);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  // Typed messages sit on the same thread as the voice clips: an assistant
  // standing in an aisle asking "the 8ft or the 10ft?" should not have to
  // record audio to do it, and text is the option that works in a loud bar,
  // for someone hard of hearing, or when you cannot speak freely because of
  // who is standing next to you.
  const [texts, setTexts] = useState<TaskTextMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Whether the card is showing the paperwork instead of the conversation.
  const [showDetails, setShowDetails] = useState(false);
  // The live handle lives in a ref, not state: `record()` below both starts
  // and stops the same recording, and a `useEffect` keyed on a state value
  // that changes as part of that same flow would tear the recorder down out
  // from under its own stop() call the moment the state updated — a cleanup
  // meant for unmount firing mid-flow instead. A ref sidesteps that; the
  // effect below only ever runs its cleanup on unmount.
  const activeRecording = useRef<ActiveRecording | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Keeps the whole screen live while it is open — messages *and* the task.
   *
   * It used to fetch once and never again, so a reply from the assistant —
   * "I'm outside", "they only had the 10ft one" — never arrived until the
   * customer closed the popup and opened it again. Nobody does that while
   * waiting for an answer, so in practice the chat only ever showed what the
   * customer had said themselves.
   *
   * The task matters as much as the messages. Everything the assistant does
   * from their side lands on it: the selfie that answers "is this the person
   * at my door", a spend request asking whether to buy the thing in front of
   * them, a receipt, the completion photo, the status. Polling only the
   * messages left all of that frozen at whatever it was when the popup
   * opened — so a customer could be looking at "No photo from them yet"
   * while their assistant's face sat on the server.
   *
   * Polled rather than pushed because the API has no socket for this, and
   * only while the task can still change: a completed or canceled task's
   * thread is finished, and waking the radio every ten seconds for it would
   * cost battery for nothing. A window regaining focus refetches
   * immediately, which is what someone coming back to the tab expects.
   */
  const taskId = task?.id;
  const threadIsLive = task?.status === "in-progress";
  useEffect(() => {
    if (!taskId) return;
    let live = true;
    const load = () => {
      api.voiceMessages(taskId).then((r) => { if (live) setMessages(r.messages); }).catch(() => {});
      api.taskMessages(taskId).then((r) => { if (live) setTexts(r.messages); }).catch(() => {});
      api.conciergeTask(taskId).then((r) => { if (live) setTask(r.task); }).catch(() => {});
    };
    load();
    if (!threadIsLive) return () => { live = false; };

    const timer = setInterval(load, MESSAGE_POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [taskId, threadIsLive]);

  useEffect(() => {
    if (task) return;
    api.conciergeQuote({ category, note, location, spendCapCents, quickTask, errandTier, onBehalfOf, peopleCount, hours })
      .then((r) => {
        setServiceFeeCents(r.serviceFeeCents);
        setTotalCents(r.totalCents);
        setMaxPeopleCount(r.maxPeopleCount);
        // The server may have clamped it to the plan's seats; follow its answer.
        if (r.peopleCount !== peopleCount) setPeopleCount(r.peopleCount);
      })
      .catch(() => {});
  }, [task, category, note, location, spendCapCents, quickTask, errandTier, onBehalfOf, peopleCount, hours]);

  useEffect(() => () => {
    activeRecording.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Keep the newest message in view as the conversation grows. Only when
  // something arrives: moving the thread while somebody is reading back up it
  // would take their place away.
  const messageCount = texts.length + messages.length;
  useEffect(() => {
    const body = bodyRef.current;
    if (body && task && !showDetails) body.scrollTop = body.scrollHeight;
  }, [messageCount, task?.id, showDetails]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.bookConcierge({
        category, note, location, spendCapCents, assistantId: assistant.id, quickTask, errandTier, peopleCount, hours, flight,
        ...(onBehalfOf ? { onBehalfOf, acknowledgedOnBehalf } : {}),
      });
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
    if (started === "denied") {
      // Not "allow it": on iOS the prompt does not come back, so the only
      // honest instruction is where the switch actually is.
      setError(`${permissionCopy("microphone").recovery} ${settingsPath("microphone")}`);
      return;
    }
    if (started === "unavailable") { setError("Voice messages aren't available in this browser."); return; }
    activeRecording.current = started;
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const sendText = async () => {
    if (!task || !draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.sendTaskMessage(task.id, draft);
      setTexts((t) => [...t, res.message]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that message");
    } finally {
      setBusy(false);
    }
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
    }
  };

  const decide = async (requestId: string, approve: boolean) => {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.decideSpendRequest(task.id, requestId, approve);
      setTask({
        ...task,
        spendRequests: (task.spendRequests ?? []).map((r) => (r.id === requestId ? res.request : r)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that");
    } finally {
      setBusy(false);
    }
  };

  /** Resolves true if the report went through, so the form closes only then. */
  const submitDispute = async (reason: string): Promise<boolean> => {
    if (!task) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await api.disputeConcierge(task.id, reason);
      setTask(res.task);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not file that report");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const face = assistantFace(assistant, task);
  const status = statusLine(task);
  const pending = pendingSpendRequests(task);
  const payout = errandTier ? errandPayoutCents(errandTier) : assistantPayoutFor(category, quickTask, peopleCount, hours);

  const header = (
    <>
      <div className="assistant-avatar popup-avatar">
        {face ? <img src={face} alt="" /> : assistant.name.slice(0, 1)}
      </div>
      <div className="popup-who">
        <strong>{assistant.name}</strong>
        <span className="tiny muted">
          {assistant.role ? `${findRole(assistant.role).label} · ` : ""}
          <span className={`popup-status${status.live ? " popup-status-live" : ""}`}>{status.label}</span>
        </span>
      </div>
      {task && (
        <button className="btn btn-sm btn-ghost" onClick={() => setShowDetails((v) => !v)}
          aria-pressed={showDetails} aria-label={showDetails ? "Back to the conversation" : "Task details"}>
          {showDetails ? "Chat" : "Details"}
        </button>
      )}
      <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Close">✕</button>
    </>
  );

  // Before there is a task this is the request card: what is being asked, what
  // it costs, and the agreement. The agreement and the button stay pinned so
  // the one action on the card is never scrolled out of reach.
  if (!task) {
    return (
      <PopupCard label={assistant.name} onClose={onClose} header={header} footer={
        <>
          {error && <div className="banner banner-danger">{error}</div>}
          <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span className="small">I understand what this means and want to send this request.</span>
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !acknowledged || totalCents === null} onClick={send}>
            Send request
          </button>
        </>
      }>
        {assistant.bio && <p className="small muted" style={{ margin: 0 }}>{assistant.bio}</p>}
        <p className="tiny muted" style={{ margin: 0 }}>{describeAssistantCapacity(assistant)}</p>
        {onBehalfOf && (
          <p className="small" style={{ margin: 0 }}>
            <strong>For:</strong> {onBehalfOf.recipientName} — {onBehalfOf.place}{onBehalfOf.room ? `, ${onBehalfOf.room}` : ""}
          </p>
        )}
        <p className="small" style={{ margin: 0 }}><strong>Request:</strong> {note}</p>

        {maxPeopleCount > 1 && (
          <div className="field">
            <label htmlFor="people-count">How many people is this for?</label>
            <select id="people-count" value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))}>
              {Array.from({ length: maxPeopleCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "Just me" : `${n} people`}</option>
              ))}
            </select>
            <span className="tiny muted">
              Looking after more people is more work, so the assistant is paid more for it. Your plan
              covers up to {maxPeopleCount}.
            </span>
          </div>
        )}

        <div className="card card-quiet stack" style={{ gap: 6 }}>
          <div className="row-between tiny muted">
            <span>Spend cap (reimbursed purchase)</span>
            <span className="charge-amount">{money(spendCapCents)}</span>
          </div>
          <div className="row-between tiny muted">
            <span>Service fee{peopleCount > 1 && ` — for ${peopleCount} people`}</span>
            <span className="charge-amount">{serviceFeeCents === null ? "…" : serviceFeeCents === 0 ? "Included" : money(serviceFeeCents)}</span>
          </div>
          {/* Not the fee: the fee is what the assistant is paid plus Safehubby's
              margin. This is the line that adds up for somebody doing the
              hourly arithmetic themselves. */}
          <div className="row-between tiny muted">
            <span>Your assistant is paid</span>
            <span className="charge-amount">{money(payout)}</span>
          </div>
          <div className="row-between small">
            <strong>Held on your card now</strong>
            <strong className="charge-amount">{totalCents === null ? "…" : money(totalCents)}</strong>
          </div>
        </div>
        <ul className="timeline">
          {CONCIERGE_DISCLOSURES.map((d) => <li key={d}><span className="tiny muted">{d}</span></li>)}
        </ul>
      </PopupCard>
    );
  }

  // After it is sent: the conversation is the card. The paperwork is one tap
  // away on "Details", and a question from the assistant pops up above the
  // message box where it cannot be missed.
  return (
    <PopupCard label={assistant.name} onClose={onClose} header={header} bodyRef={bodyRef} footer={
      <>
        {pending[0] && (
          <SpendRequestPopup request={pending[0]} position={1} total={pending.length} busy={busy}
            onDecide={(approve) => decide(pending[0]!.id, approve)} />
        )}
        {error && <div className="banner banner-danger">{error}</div>}
        <div className="popup-composer">
          <input
            aria-label="Message your assistant"
            placeholder={`Message ${assistant.name}`}
            value={draft}
            maxLength={MAX_TEXT_MESSAGE_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) sendText(); }}
          />
          <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={sendText}>Send</button>
          {/* Explains itself before the OS dialog appears. On a native build a
              refused microphone prompt is never shown again, so the one chance
              to ask has to land on someone who knows why. */}
          <div className="popup-mic-slot">
            <PermissionGate name="microphone" compact>
              <button className={`record-button popup-mic${isRecording ? " recording" : ""}`}
                disabled={busy && !isRecording} onClick={record}
                aria-label={isRecording ? "Stop and send" : "Record a voice message"}>
                {isRecording ? `${elapsed}s` : "●"}
              </button>
            </PermissionGate>
          </div>
        </div>
        {isRecording && <p className="tiny muted" style={{ margin: 0, textAlign: "center" }}>Recording — tap to send (up to {MAX_VOICE_MESSAGE_SECONDS}s)</p>}
      </>
    }>
      {showDetails ? (
        <TaskDetails task={task} busy={busy} onSelfie={captureSelfie} onDispute={submitDispute} />
      ) : (
        <>
          <p className="tiny muted" style={{ margin: 0 }}>
            Sent — {money(task.spendCapCents + task.serviceFeeCents)} held. Type or leave a voice message if there's more to say.
          </p>
          {/* Typed and spoken messages in one timeline — see TaskMessageThread. */}
          <TaskMessageThread texts={texts} voices={messages} assistantName={assistant.name} />
        </>
      )}
    </PopupCard>
  );
}
