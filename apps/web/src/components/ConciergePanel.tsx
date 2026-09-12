import { useEffect, useState } from "react";
import {
  CONCIERGE_CATEGORIES, CONCIERGE_MAX_CAP_CENTS, CONCIERGE_MIN_CAP_CENTS, hasFeature, isAssistantAvailable,
} from "@safehubby/core";
import type { AssistantProfile, ConciergeCategory, ConciergeTask, PlanId } from "@safehubby/core";
import { api } from "../api.ts";
import { currentFix, type Fix } from "../native/location.ts";
import type { Account } from "../api.ts";
import { AssistantModal } from "./AssistantModal.tsx";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/**
 * Personal concierge: request a vetted partner-network professional for one
 * bounded, in-person task, at a spend cap the subscriber sets and that is
 * never exceeded — see concierge.ts for why this is a booking layer on an
 * already-vetted partner rather than an open "hire a stranger" tab.
 *
 * Browsing and picking a specific assistant, then a voice-message popup for
 * talking to them, both live here rather than as a separate step: the roster
 * only means anything in the context of the task it's being picked for.
 */
export function ConciergePanel({ account }: { account: Account }) {
  const locked = !hasFeature(account.planId as PlanId, "personal-concierge");

  const [category, setCategory] = useState<ConciergeCategory>("grab-something");
  const [note, setNote] = useState("");
  const [capDollars, setCapDollars] = useState(25);
  const [tasks, setTasks] = useState<ConciergeTask[]>([]);
  const [roster, setRoster] = useState<AssistantProfile[] | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [selected, setSelected] = useState<AssistantProfile | null>(null);
  const [openTask, setOpenTask] = useState<ConciergeTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (locked) return;
    api.conciergeTasks().then((r) => setTasks(r.tasks)).catch(() => {});
  }, [locked]);

  if (locked) {
    return (
      <section className="card stack">
        <h3>Personal concierge</h3>
        <p className="tiny muted">
          🔒 Send a vetted assistant for a bounded, capped-spend task — grab something, sit with a friend,
          or check on someone in person. Included on every paid plan.
        </p>
      </section>
    );
  }

  const spendCapCents = Math.round(capDollars * 100);

  const browse = async () => {
    setBusy(true);
    setError(null);
    setRoster(null);
    try {
      const at = await currentFix();
      if (!at) throw new Error("Turn on location to browse assistants — they need to know where to go.");
      setFix(at);
      const res = await api.conciergeAssistants(category, at);
      setRoster(res.assistants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the roster right now");
    } finally {
      setBusy(false);
    }
  };

  // The modal stays open after booking — it transitions itself into the
  // voice-message thread for the new task, so it closes only when the
  // subscriber taps close, not the instant a request goes out.
  const onBooked = (task: ConciergeTask) => setTasks((t) => [task, ...t]);

  const closeSelected = () => {
    setSelected(null);
    setRoster(null);
    setNote("");
  };

  const cancel = (taskId: string) => api.cancelConcierge(taskId)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => setError(e instanceof Error ? e.message : "Could not cancel"));

  const complete = (taskId: string) => api.completeConcierge(taskId)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => setError(e instanceof Error ? e.message : "Could not mark that done"));

  const active = tasks.filter((t) => t.status === "in-progress");

  return (
    <section className="card stack">
      <h3>Personal concierge</h3>
      <p className="small muted">
        Send someone for one bounded task, capped at exactly what you set below — never more, whatever it
        ends up costing.
      </p>

      {active.length > 0 && (
        <ul className="timeline">
          {active.map((t) => (
            <li key={t.id}>
              <div className="row-between">
                <div>
                  <strong className="small">{t.note}</strong>
                  <div className="tiny muted">
                    {t.provider} · capped at {money(t.spendCapCents)}
                    {t.card && ` · paying on a card ending ${t.card.last4} — not yours`}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" disabled={busy} onClick={() => setOpenTask(t)}>Message</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => complete(t.id)}>Done</button>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => cancel(t.id)}>Cancel</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="chip-grid">
        {CONCIERGE_CATEGORIES.map((c) => (
          <button key={c.id} className={`chip${c.id === category ? " chip-on" : ""}`}
            onClick={() => { setCategory(c.id); setRoster(null); }} aria-pressed={c.id === category}>
            <strong>{c.label}</strong>
            <span className="tiny">{c.description}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="concierge-note">What do you need?</label>
        <textarea id="concierge-note" maxLength={280} rows={2} value={note}
          onChange={(e) => { setNote(e.target.value); setRoster(null); }}
          placeholder="Grab a burger and fries from The Anchor Tavern" />
      </div>

      <div className="field">
        <label htmlFor="concierge-cap">Spend cap — never charged more than this</label>
        <input id="concierge-cap" type="range" min={CONCIERGE_MIN_CAP_CENTS / 100} max={CONCIERGE_MAX_CAP_CENTS / 100}
          step={5} value={capDollars}
          onChange={(e) => { setCapDollars(Number(e.target.value)); setRoster(null); }} />
        <span className="small">{money(spendCapCents)}</span>
      </div>

      {roster === null && (
        <button className="btn btn-block" disabled={busy || !note.trim()} onClick={browse}>
          Browse assistants
        </button>
      )}

      {roster !== null && roster.length === 0 && (
        <p className="small muted">
          No assistants to show right now. Try a different task type, or check back shortly.
        </p>
      )}

      {roster !== null && roster.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {roster.map((a) => {
            const available = isAssistantAvailable(a);
            return (
              <button key={a.id} className="card card-quiet assistant-card" disabled={!available}
                style={{ boxShadow: "inset 0 0 0 1px var(--line)", opacity: available ? 1 : 0.5 }}
                onClick={() => setSelected(a)}>
                <div className="assistant-avatar">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" /> : a.name.slice(0, 1)}
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <strong className="small">{a.name}</strong>
                  <span className="tiny muted">
                    {available ? `Up to ${a.maxConcurrentCustomers} at once` : "At capacity right now"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}

      {selected && fix && (
        <AssistantModal
          assistant={selected}
          category={category}
          note={note}
          spendCapCents={spendCapCents}
          location={fix}
          onBooked={onBooked}
          onClose={closeSelected}
        />
      )}

      {openTask && (
        <AssistantModal
          assistant={{
            id: openTask.assistantId ?? "assistant",
            name: openTask.assistantName ?? (openTask.assistantId ? "Your assistant" : openTask.provider),
            categories: [openTask.category],
            maxConcurrentCustomers: 1,
            currentCustomers: 0,
          }}
          category={openTask.category}
          note={openTask.note}
          spendCapCents={openTask.spendCapCents}
          location={openTask.location}
          existingTask={openTask}
          onBooked={() => {}}
          onClose={() => setOpenTask(null)}
        />
      )}
    </section>
  );
}
