import { useEffect, useRef, useState } from "react";
import {
  CONCIERGE_CATEGORIES, MAX_TASKS_PER_WEEK_ESTIMATE, MAX_VOICE_MESSAGE_SECONDS, annualEstimateCentsFor,
  assistantPayoutFor, conciergeCategoryLabel, hourlyRateCentsFor, isQuickTaskEligible,
} from "@safehubby/core";
import type { ConciergeTask, VoiceMessage } from "@safehubby/core";
import { api } from "../api.ts";
import { startRecording, type ActiveRecording } from "../native/audio.ts";
import { readFileAsBase64 } from "../native/camera.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const moneyRound = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

type PortalTask = ConciergeTask & { requesterName: string };

/**
 * The employee portal — a distinct area of the app from the customer-facing
 * side. Reached at `/employee`, with its own sign-in and its own session
 * cookie (`sh_assistant_session`), entirely separate from a Safehubby
 * traveler account. See docs/concierge.md, "The employee portal."
 *
 * Checks for an existing session first (a returning assistant with a valid
 * cookie skips straight to their tasks); otherwise shows the sign-in screen.
 */
export function EmployeePortal() {
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");

  useEffect(() => {
    api.assistantPortal().then(() => setStatus("signed-in")).catch(() => setStatus("signed-out"));
  }, []);

  if (status === "checking") {
    return <Shell><p className="small muted">Loading…</p></Shell>;
  }
  if (status === "signed-in") {
    return <PortalHome onSignedOut={() => setStatus("signed-out")} />;
  }
  return <EmployeeSignIn onSignedIn={() => setStatus("signed-in")} />;
}

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return (
    <div className="app stack">
      <div className="row-between">
        <div>
          <h1>Safehubby</h1>
          <p className="tiny muted">Employee portal — not the app customers use.</p>
        </div>
        {onSignOut && <button className="btn btn-sm btn-ghost" onClick={onSignOut}>Sign out</button>}
      </div>
      {children}
    </div>
  );
}

function EmployeeSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantLogin(username.trim(), password);
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="card stack">
        <h2>Employee sign-in</h2>
        <p className="small muted">
          For assistants on Safehubby's partner network — not a Safehubby customer account. Sign in with
          the username and temporary password relayed to you when you were first assigned a task.
        </p>
        <div className="field">
          <label htmlFor="emp-username">Username</label>
          <input id="emp-username" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="emp-password">Password</label>
          <input id="emp-password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !username.trim() || !password} onClick={submit}>
          Sign in
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </div>
    </Shell>
  );
}

function ForcedPasswordChange({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantChangePassword(current, next);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change your password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Set your own password</h3>
      <p className="small muted">
        You're signed in with a temporary password. Set your own before continuing — a system-generated
        password should never stay your permanent one.
      </p>
      <div className="field">
        <label htmlFor="cur-pw">Temporary password</label>
        <input id="cur-pw" type="password" autoComplete="current-password" value={current}
          onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="new-pw">New password</label>
        <input id="new-pw" type="password" autoComplete="new-password" value={next}
          onChange={(e) => setNext(e.target.value)} />
        <span className="tiny muted">At least 10 characters.</span>
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || !current || next.length < 10} onClick={submit}>
        Set password
      </button>
      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}

/**
 * What this category could add up to over a year of steady bookings — a
 * calculator built from the real published per-task fee, not an invented
 * salary figure. Nothing here is a commitment: Safehubby is a booking layer,
 * not an employer, and no customer is required to send any set number of
 * tasks — see concierge.ts's own doc comment on why this module stays that
 * shape.
 */
function PayRates({ onBack }: { onBack: () => void }) {
  const [tasksPerWeek, setTasksPerWeek] = useState(3);

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>← All tasks</button>
      <section className="card stack">
        <h3>Pay rates</h3>
        <p className="tiny muted">
          What you take home per task, before nothing — this is the full amount that reaches you, not a
          figure Safehubby's cut still comes out of. The customer pays more than this; the difference is
          Safehubby's margin and is added on top of your rate, never taken out of it (see
          docs/concierge.md). You're paid per task, not by the hour; the hourly figure is only a
          reference, using the typical time a task like this takes.
        </p>
        <table className="pay-table">
          <thead>
            <tr><th>Task</th><th>Per task</th><th>≈ Per hour</th></tr>
          </thead>
          <tbody>
            {CONCIERGE_CATEGORIES.map((c) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>
                  {money(assistantPayoutFor(c.id))}
                  {isQuickTaskEligible(c.id) && (
                    <span className="tiny muted"> (as low as {money(assistantPayoutFor(c.id, true))} for a quick task)</span>
                  )}
                </td>
                <td>≈ {money(hourlyRateCentsFor(c.id))}/hr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <h3>If a customer keeps sending you work</h3>
        <div className="field">
          <label htmlFor="tasks-per-week">Tasks per week, from one customer</label>
          <input id="tasks-per-week" type="range" min={1} max={MAX_TASKS_PER_WEEK_ESTIMATE} value={tasksPerWeek}
            onChange={(e) => setTasksPerWeek(Number(e.target.value))} />
          <span className="small">{tasksPerWeek} / week</span>
        </div>
        <ul className="timeline">
          {CONCIERGE_CATEGORIES.map((c) => (
            <li key={c.id}>
              <div className="row-between">
                <span className="small">{c.label}</span>
                <strong className="charge-amount">≈ {moneyRound(annualEstimateCentsFor(c.id, tasksPerWeek))}/yr</strong>
              </div>
            </li>
          ))}
        </ul>
        <p className="tiny muted">
          A calculator, not a commitment. Safehubby is a booking layer, not your employer — no customer is
          required to send any set number of tasks, and this figure is real math on your own published
          rate, not a promise of hours or income.
        </p>
      </section>
    </div>
  );
}

/**
 * Where a biweekly payout is actually sent, plus the record of every one
 * already paid. The bank account is entered here, by the assistant, never
 * by Safehubby staff — see docs/concierge.md. An outstanding clawback (see
 * `AssistantAdjustment` in payroll.ts) is shown plainly, since it directly
 * reduces the next payout rather than being a silent deduction.
 */
function PayoutSettings({ onBack }: { onBack: () => void }) {
  const [destination, setDestination] = useState<{ accountHolderName: string; accountNumberLast4: string } | null | undefined>(undefined);
  const [payouts, setPayouts] = useState<{
    id: string; periodStart: string; periodEnd: string; totalCents: number;
    status: "pending" | "paid" | "failed"; paidAt?: string; failureReason?: string;
  }[]>([]);
  const [unpaid, setUnpaid] = useState(0);
  const [owed, setOwed] = useState(0);
  const [editing, setEditing] = useState(false);
  const [accountHolderName, setAccountHolderName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.assistantPayoutDestination().then((r) => setDestination(r.destination)).catch(() => setDestination(null));
    api.assistantPayouts().then((r) => {
      setPayouts(r.payouts);
      setUnpaid(r.unpaidEarningsCents);
      setOwed(r.outstandingClawbackCents);
    }).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.assistantSetPayoutDestination(accountHolderName.trim(), routingNumber.trim(), accountNumber.trim());
      setDestination(res);
      setEditing(false);
      setAccountHolderName(""); setRoutingNumber(""); setAccountNumber("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that bank account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>← All tasks</button>

      <section className="card stack">
        <h3>Get paid</h3>
        <p className="tiny muted">
          Paid biweekly, straight to this account, for every task you've completed since your last payout.
        </p>
        <div className="row-between tiny muted">
          <span>Earned, not yet paid</span>
          <span className="charge-amount">{money(unpaid)}</span>
        </div>
        {owed > 0 && (
          <div className="row-between tiny muted">
            <span>Owed back from a customer dispute</span>
            <span className="charge-amount">−{money(owed)}</span>
          </div>
        )}
        {owed > 0 && (
          <p className="tiny muted">
            A customer's dispute over an undelivered task was upheld, and that amount comes out of your next
            payout(s) before anything is sent — see your task history for which one.
          </p>
        )}

        {!editing && destination && (
          <div className="row-between">
            <span className="small">{destination.accountHolderName} — ending in {destination.accountNumberLast4}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>Change</button>
          </div>
        )}
        {!editing && destination === null && (
          <button className="btn btn-block" onClick={() => setEditing(true)}>Add a bank account</button>
        )}
        {editing && (
          <>
            <div className="field">
              <label htmlFor="pd-name">Name on the account</label>
              <input id="pd-name" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pd-routing">Routing number</label>
              <input id="pd-routing" inputMode="numeric" maxLength={9} value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="field">
              <label htmlFor="pd-account">Account number</label>
              <input id="pd-account" inputMode="numeric" value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="row">
              <button className="btn grow" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary grow"
                disabled={busy || !accountHolderName.trim() || routingNumber.length !== 9 || accountNumber.length < 4}
                onClick={save}>
                Save
              </button>
            </div>
          </>
        )}
        {error && <div className="banner banner-danger">{error}</div>}
      </section>

      <section className="card stack">
        <h3>Payout history</h3>
        {payouts.length === 0 && <p className="tiny muted">Nothing paid out yet.</p>}
        {payouts.length > 0 && (
          <ul className="timeline">
            {payouts.map((p) => (
              <li key={p.id}>
                <div className="row-between">
                  <span className="small">
                    {new Date(p.periodStart).toLocaleDateString()} – {new Date(p.periodEnd).toLocaleDateString()}
                  </span>
                  <strong className="charge-amount">{money(p.totalCents)}</strong>
                </div>
                <span className={`pill${p.status === "paid" ? " pill-safe" : ""}`}>{p.status}</span>
                {p.status === "failed" && p.failureReason && <p className="tiny muted">{p.failureReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PortalHome({ onSignedOut }: { onSignedOut: () => void }) {
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tasks, setTasks] = useState<PortalTask[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showPayouts, setShowPayouts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.assistantPortal()
      .then((r) => { setAssistantId(r.assistantId); setMustChangePassword(r.mustChangePassword); setTasks(r.tasks); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your tasks"));
  };

  useEffect(load, []);

  const signOut = () => { api.assistantLogout().finally(onSignedOut); };

  if (error) {
    return (
      <Shell onSignOut={signOut}>
        <div className="banner banner-danger">{error}</div>
      </Shell>
    );
  }

  if (!tasks) return <Shell><p className="small muted">Loading…</p></Shell>;

  if (mustChangePassword) {
    return <Shell onSignOut={signOut}><ForcedPasswordChange onChanged={() => setMustChangePassword(false)} /></Shell>;
  }

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const active = tasks.filter((t) => t.status === "in-progress");
  const past = tasks.filter((t) => t.status !== "in-progress");

  return (
    <Shell onSignOut={signOut}>
      {selected ? (
        <TaskDetail task={selected} onBack={() => setSelectedId(null)} onChanged={load} />
      ) : showPay ? (
        <PayRates onBack={() => setShowPay(false)} />
      ) : showPayouts ? (
        <PayoutSettings onBack={() => setShowPayouts(false)} />
      ) : (
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setShowPay(true)}>See pay rates</button>
            <button className="btn btn-sm" onClick={() => setShowPayouts(true)}>Get paid</button>
          </div>

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

      {assistantId && <p className="tiny muted">Signed in as {assistantId}.</p>}
    </Shell>
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

function TaskDetail({ task, onBack, onChanged }: {
  task: PortalTask; onBack: () => void; onChanged: () => void;
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
  const completionInput = useRef<HTMLInputElement>(null);

  const loadMessages = () => api.assistantVoiceMessages(task.id).then((r) => setMessages(r.messages)).catch(() => {});
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
        await api.assistantSendVoiceMessage(task.id, clip);
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
      await api.assistantSendSelfie(task.id, photo);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo");
    } finally {
      setBusy(false);
      if (selfieInput.current) selfieInput.current.value = "";
    }
  };

  const captureCompletionPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await readFileAsBase64(file);
      await api.assistantSendCompletionPhoto(task.id, photo);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo");
    } finally {
      setBusy(false);
      if (completionInput.current) completionInput.current.value = "";
    }
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      const cents = billed.trim() ? Math.round(Number(billed) * 100) : undefined;
      await api.assistantComplete(task.id, cents);
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
      await api.assistantDecline(task.id);
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
          <span className="charge-amount">{money(task.assistantPayoutCents)}</span>
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
          <div className="row-between" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {task.completionPhoto ? (
                <img className="selfie-thumb" alt="What you delivered"
                  src={`data:${task.completionPhoto.mimeType};base64,${task.completionPhoto.base64}`} />
              ) : (
                <span className="tiny muted">No proof-of-completion photo yet</span>
              )}
              <button className="btn btn-sm" disabled={busy} onClick={() => completionInput.current?.click()}>
                {task.completionPhoto ? "Retake photo" : "Add a photo"}
              </button>
              <input ref={completionInput} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => captureCompletionPhoto(e.target.files?.[0])} />
            </div>
          </div>
          <p className="tiny muted">
            A photo of what you actually delivered — the item, or the person you checked on — shown to{" "}
            {task.requesterName} as proof. Optional, but the honest way to close out a task with no room
            for a dispute over whether it happened.
          </p>
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
