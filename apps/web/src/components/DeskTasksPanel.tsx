import { useEffect, useState } from "react";
import { hasFeature, type PlanId } from "@safehubby/core";
import { api } from "../api.ts";
import type { Account } from "../api.ts";
import type { DeskTask } from "@safehubby/core";
import { CategoryIcon } from "./CategoryIcons.tsx";

/**
 * The assistant's job that does not need feet: appointments, reminders, the
 * email nobody wants to write.
 *
 * Deliberately the plainest form in the app. There is no cap to set, no card,
 * no assistant to browse and no price to agree — because none of those exist
 * for this work (see desk-tasks.ts). Adding any of that furniture would make
 * a two-minute phone call feel like a booking, which is exactly the friction
 * that stops people asking.
 */
export function DeskTasksPanel({ account }: { account: Account }) {
  const locked = !hasFeature(account.planId as PlanId, "desk-tasks");
  const [kinds, setKinds] = useState<{ id: string; label: string; description: string }[]>([]);
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [tasks, setTasks] = useState<DeskTask[]>([]);
  const [allowance, setAllowance] = useState<{ allowance: number; remaining: number; resetsAt: string } | null>(null);
  const [accessRule, setAccessRule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.deskTasks().then((r) => {
    setKinds(r.kinds);
    setKind((cur) => cur || r.kinds[0]?.id || "");
    setTasks(r.tasks);
    setAccessRule(r.accessRule);
    setAllowance({ allowance: r.allowance, remaining: r.remaining, resetsAt: r.resetsAt });
  }).catch(() => {});

  useEffect(() => { if (!locked) void load(); }, [locked]);

  if (locked) {
    return (
      <section className="card stack">
        <h3>Ask an assistant</h3>
        <p className="tiny muted">
          🔒 Appointments, reminders, emails and admin — handled by a person, included on every paid plan.
        </p>
      </section>
    );
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createDeskTask({ kind, note });
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = (id: string) => api.cancelDeskTask(id).then(load).catch(() => {});
  const open = tasks.filter((t) => t.status === "open");
  const out = allowance?.remaining === 0;

  return (
    <section className="card stack">
      <h3>Ask an assistant</h3>
      <p className="small muted">
        The things that eat an afternoon and never needed you personally. No charge, no spend cap — it is
        part of your plan.
      </p>

      <div className="category-grid">
        {kinds.map((k) => (
          <button key={k.id} className="category-tile" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            <span className="category-tile-icon"><CategoryIcon id={k.id} /></span>
            <span className="category-tile-label">{k.label}</span>
          </button>
        ))}
      </div>
      {kinds.find((k) => k.id === kind) && (
        <p className="tiny muted" style={{ margin: 0 }}>{kinds.find((k) => k.id === kind)!.description}</p>
      )}

      <div className="field">
        <label htmlFor="desk-note">What do you need?</label>
        <textarea id="desk-note" rows={3} value={note} maxLength={500}
          placeholder="Book the dentist, any afternoon after the 12th"
          onChange={(e) => setNote(e.target.value)} />
      </div>

      {/* The one thing about this feature somebody should read before using
          it, so it sits with the form rather than in a policy page. */}
      <p className="tiny muted">{accessRule}</p>

      {allowance && (
        <p className="tiny muted">
          {allowance.remaining} of {allowance.allowance} left this month
          {out && " — the count resets on the 1st, and a bigger plan carries more"}.
        </p>
      )}

      <button className="btn btn-primary btn-block" disabled={busy || !note.trim() || out} onClick={send}>
        Send it
      </button>

      {error && <div className="banner banner-danger">{error}</div>}

      {open.length > 0 && (
        <ul className="timeline">
          {open.map((t) => (
            <li key={t.id}>
              <div className="row-between">
                <span className="small">{t.note}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => cancel(t.id)}>Cancel</button>
              </div>
              <span className="tiny muted">
                {kinds.find((k) => k.id === t.kind)?.label ?? t.kind} · with an assistant
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
