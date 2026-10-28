import { useLanguage } from "../i18n.tsx";
import { askWords, choiceLabel } from "../app/ask-copy.ts";
import { useEffect, useState } from "react";
import { hasFeature, type PlanId } from "@safehubby/core";
import { api } from "../api.ts";
import type { Account } from "../api.ts";
import type { DeskTask } from "@safehubby/core";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { extrasWords } from "../app/extras-copy.ts";

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
export function DeskTasksPanel({ account, chosenKind, embedded = false }: {
  account: Account;
  /** Set when the choice was made in the shared "Ask an assistant" grid. */
  chosenKind?: string;
  /** Inside another card: just the form and what is open, no card or grid of its own. */
  embedded?: boolean;
}) {
  const locked = !hasFeature(account.planId as PlanId, "desk-tasks");
  const { language } = useLanguage();
  const d = extrasWords(language).desk;
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
        <h3>{d.title}</h3>
        <p className="tiny muted">{d.locked}</p>
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
      setError(e instanceof Error ? e.message : d.failed);
    } finally {
      setBusy(false);
    }
  };

  const cancel = (id: string) => api.cancelDeskTask(id).then(load).catch(() => {});
  const open = tasks.filter((t) => t.status === "open");
  const out = allowance?.remaining === 0;
  const activeKind = chosenKind ?? kind;
  const w = askWords(language === "es" ? "es" : "en");
  const sendIt = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createDeskTask({ kind: activeKind, note });
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : d.failed);
    } finally {
      setBusy(false);
    }
  };

  if (embedded) {
    return (
      <div className="stack">
        <div className="field">
          <label htmlFor="desk-note">{w.need}</label>
          <textarea id="desk-note" rows={3} value={note} maxLength={500}
            placeholder={w.deskPlaceholder}
            onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !note.trim() || out} onClick={sendIt}>{w.send}</button>
        {error && <div className="banner banner-danger">{error}</div>}
        {open.map((t) => (
          <div key={t.id} className="row-between">
            <span className="small">{t.note}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => cancel(t.id)}>{d.cancel}</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="card stack">
      <h3>{d.title}</h3>
      <p className="small muted">{d.intro}</p>

      <div className="category-grid">
        {kinds.map((k) => (
          <button key={k.id} className="category-tile" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            <span className="category-tile-icon"><CategoryIcon id={k.id} /></span>
            <span className="category-tile-label">{choiceLabel(k.id, k.label, language === "es" ? "es" : "en")}</span>
          </button>
        ))}
      </div>
      {kinds.find((k) => k.id === kind) && (
        <p className="tiny muted" style={{ margin: 0 }}>{kinds.find((k) => k.id === kind)!.description}</p>
      )}

      <div className="field">
        <label htmlFor="desk-note">{d.need}</label>
        <textarea id="desk-note" rows={3} value={note} maxLength={500}
          placeholder={d.placeholder}
          onChange={(e) => setNote(e.target.value)} />
      </div>

      {/* The one thing about this feature somebody should read before using
          it, so it sits with the form rather than in a policy page. */}
      <p className="tiny muted">{accessRule}</p>

      {allowance && (
        <p className="tiny muted">{d.left(allowance.remaining, allowance.allowance, out)}</p>
      )}

      <button className="btn btn-primary btn-block" disabled={busy || !note.trim() || out} onClick={send}>
        {d.send}
      </button>

      {error && <div className="banner banner-danger">{error}</div>}

      {open.length > 0 && (
        <ul className="timeline">
          {open.map((t) => (
            <li key={t.id}>
              <div className="row-between">
                <span className="small">{t.note}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => cancel(t.id)}>{d.cancel}</button>
              </div>
              <span className="tiny muted">
                {choiceLabel(t.kind, kinds.find((k) => k.id === t.kind)?.label ?? t.kind, language === "es" ? "es" : "en")} · {d.withAssistant}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The desk choices as tiles for the shared "Ask an assistant" grid. */
export function DeskTiles({ account, chosen, onChoose }: {
  account: Account; chosen: string | null; onChoose: (kind: string) => void;
}) {
  const [kinds, setKinds] = useState<{ id: string; label: string }[]>([]);
  const { language } = useLanguage();
  const locked = !hasFeature(account.planId as PlanId, "desk-tasks");
  useEffect(() => { if (!locked) api.deskTasks().then((r) => setKinds(r.kinds)).catch(() => {}); }, [locked]);
  return (
    <>
      {kinds.map((k) => (
        <button key={k.id} className="category-tile" aria-pressed={chosen === k.id} onClick={() => onChoose(k.id)}>
          <span className="category-tile-icon"><CategoryIcon id={k.id} /></span>
          <span className="category-tile-label">{choiceLabel(k.id, k.label, language === "es" ? "es" : "en")}</span>
        </button>
      ))}
    </>
  );
}
