import { useEffect, useState } from "react";
import { api, type PhoneCheckRow } from "../api.ts";

const ANSWER: Record<string, string> = { yes: "In stock", no: "Not in stock" };

/**
 * Sofía, the automated caller (docs/phone-checks.md): the owner types a business number, the item and the place, and she calls to ask
 * that one question. A clear answer is saved to Checked today by the server. One call per number per day, ten a day in all.
 */
export function SofiaCallsSection() {
  const [state, setState] = useState<Awaited<ReturnType<typeof api.phoneChecks>> | null>(null);
  const [form, setForm] = useState({ to: "", item: "", place: "", lang: "es" as "es" | "en" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.phoneChecks().then(setState).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  useEffect(() => { void load(); }, []);

  const call = async () => {
    setBusy(true); setError(null);
    try { await api.startPhoneCheck(form); setForm({ ...form, to: "" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "The call did not start"); } finally { setBusy(false); }
  };
  const refresh = async (c: PhoneCheckRow) => {
    setError(null);
    try { await api.refreshPhoneCheck(c.id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not read the call"); }
  };
  const set = (k: "to" | "item" | "place") => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = state?.configured && state.caller && form.to.replace(/\D/g, "").length >= 10 && form.item.trim().length > 1 && form.place.trim().length > 1;

  if (!state) return error ? <p className="tiny" role="alert">{error}</p> : <p className="tiny muted">Loading…</p>;
  return (
    <section className="card stack" aria-label="Sofía: call to check">
      <h3 style={{ margin: 0 }}>Sofía: call to check</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        She says she is Safehubby's automated assistant, asks one question, hangs up on phone menus, and stops after 5 minutes. One call to a
        number per day, ten a day in all. Call business numbers only.
      </p>
      {!state.configured && <p className="small" style={{ margin: 0 }}>Not set up yet. {state.requires}</p>}
      {state.configured && state.problem && <p className="small" role="alert" style={{ margin: 0 }}>{state.problem}</p>}
      {state.configured && state.caller && <p className="tiny muted" style={{ margin: 0 }}>Calling from {state.caller.number || "your imported number"} ({state.caller.provider}).</p>}

      <label htmlFor="sofia-to" className="tiny">Business phone</label>
      <input id="sofia-to" inputMode="tel" value={form.to} placeholder="787-292-2050" onChange={set("to")} />
      <label htmlFor="sofia-place" className="tiny">Place</label>
      <input id="sofia-place" value={form.place} maxLength={80} placeholder="Walgreens Avenida La Sierra" onChange={set("place")} />
      <label htmlFor="sofia-item" className="tiny">What to ask about</label>
      <input id="sofia-item" value={form.item} maxLength={80} placeholder="insulina Lantus" onChange={set("item")} />
      <label htmlFor="sofia-lang" className="tiny">Language</label>
      <select id="sofia-lang" value={form.lang} onChange={(e) => setForm((f) => ({ ...f, lang: e.target.value === "en" ? "en" : "es" }))}>
        <option value="es">Spanish</option><option value="en">English</option>
      </select>
      <button className="btn btn-primary btn-block" disabled={busy || !ready} onClick={call}>{busy ? "Calling…" : "Call to check"}</button>
      {error && <p className="tiny" role="alert">{error}</p>}

      {state.calls.map((c) => (
        <div key={c.id} className="small" style={{ borderTop: "1px solid var(--line, #ddd)", paddingTop: 6 }}>
          <strong>{c.place}</strong> · {c.item}<br />
          <span className="tiny muted">{c.to}, {new Date(c.at).toLocaleString()} · {c.status}{c.status === "ended" ? ` · ${c.answer ? ANSWER[c.answer] : "no clear answer"}${c.notes ? ` · ${c.notes}` : ""}${c.checkId ? " · saved to Checked today" : ""}` : ""}</span>{" "}
          {c.status !== "ended" && <button className="btn btn-sm btn-ghost" onClick={() => refresh(c)}>Refresh</button>}
        </div>
      ))}
    </section>
  );
}
