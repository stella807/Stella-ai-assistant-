import { useEffect, useState } from "react";
import { api, type LocalCheckRow } from "../api.ts";

const KINDS = [["open", "Is it open?"], ["stock", "Is it in stock?"], ["line", "How long is the line?"], ["other", "Something else"]] as const;
const blank = { kind: "open", place: "", subject: "", statement: "", checkedBy: "", evidence: "photo" };

/** "Right now" in the form a phone's date box gives back, so a check can be entered while standing there. */
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/**
 * "Checked today": what someone from Safehubby saw on the ground. AI agents said this is what they would pay for: what is
 * true today in Puerto Rico, dated, and by a person who was there. Nothing is made up here; with no fresh check, agents
 * are told there is no answer and are not charged. What they asked for and did not get shows in Signals.
 */
export function CheckedTodaySection() {
  const [rows, setRows] = useState<LocalCheckRow[] | null>(null);
  const [fresh, setFresh] = useState(0);
  const [form, setForm] = useState(blank);
  const [seen, setSeen] = useState(nowLocal());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.localChecks().then((r) => { setRows(r.checks); setFresh(r.freshNow); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  useEffect(() => { void load(); }, []);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.addLocalCheck({ ...form, observedAt: new Date(seen).toISOString() });
      setForm({ ...blank, checkedBy: form.checkedBy }); setSeen(nowLocal());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "That did not save"); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { setError(null); try { await api.deleteLocalCheck(id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete"); } };
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.place.trim().length > 1 && form.subject.trim().length > 1 && form.statement.trim().length > 1 && form.checkedBy.trim().length > 0;

  return (
    <section className="card stack" aria-label="Checked today">
      <h3 style={{ margin: 0 }}>Checked today</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Record what you saw, where you were. Agents pay a few cents for a dated answer from a person who was there. A check goes stale on
        its own (a line in 45 minutes, opening hours in 6 hours), and a stale check is never sold. No links, emails or phone numbers.
      </p>
      <p className="small" style={{ margin: 0 }}>{rows === null ? "Loading…" : `${fresh} fresh now, ${rows.length} kept.`}</p>

      <label htmlFor="chk-kind" className="tiny">What kind</label>
      <select id="chk-kind" value={form.kind} onChange={set("kind")}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <label htmlFor="chk-place" className="tiny">Place</label>
      <input id="chk-place" value={form.place} maxLength={80} placeholder="Farmacia Central, Santurce" onChange={set("place")} />
      <label htmlFor="chk-subject" className="tiny">What you checked</label>
      <input id="chk-subject" value={form.subject} maxLength={120} placeholder="Open today? Insulin pens in stock?" onChange={set("subject")} />
      <label htmlFor="chk-statement" className="tiny">What you saw</label>
      <input id="chk-statement" value={form.statement} maxLength={300} placeholder="Open, counter staffed, no line" onChange={set("statement")} />
      <label htmlFor="chk-seen" className="tiny">When you saw it</label>
      <input id="chk-seen" type="datetime-local" value={seen} onChange={(e) => setSeen(e.target.value)} />
      <label htmlFor="chk-by" className="tiny">Who was there (first name)</label>
      <input id="chk-by" value={form.checkedBy} maxLength={40} onChange={set("checkedBy")} />
      <label htmlFor="chk-evidence" className="tiny">Proof you kept</label>
      <select id="chk-evidence" value={form.evidence} onChange={set("evidence")}><option value="photo">A photo</option><option value="receipt">A receipt</option><option value="call">A phone call</option><option value="none">None</option></select>
      <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={save}>{busy ? "Saving…" : "Record this check"}</button>
      {error && <p className="tiny" role="alert">{error}</p>}

      {(rows ?? []).map((c) => (
        <div key={c.id} className="small" style={{ borderTop: "1px solid var(--line, #ddd)", paddingTop: 6 }}>
          <strong>{c.place}</strong> · {c.subject}<br />
          {c.statement}<br />
          <span className="tiny muted">{c.checkedBy}, {new Date(c.observedAt).toLocaleString()} · {new Date(c.validUntil) > new Date() ? "fresh until " + new Date(c.validUntil).toLocaleTimeString() : "expired"} · proof: {c.evidence}</span>{" "}
          <button className="btn btn-sm btn-ghost" onClick={() => remove(c.id)}>Delete</button>
        </div>
      ))}
    </section>
  );
}
