import { useEffect, useState } from "react";
import { api, type BizAdminRow } from "../api.ts";

/** The owner's list of business customers, each with its own AI employee. A key is shown once, when it is made. */
export function BusinessesSection() {
  const [rows, setRows] = useState<BizAdminRow[] | null>(null);
  const [month, setMonth] = useState("");
  const [form, setForm] = useState({ name: "", contactEmail: "", messageLimit: "300" });
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<{ name: string; id: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.businessesList().then((r) => { setRows(r.businesses); setMonth(r.month); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  useEffect(() => { void load(); }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "That did not work"); }
  };

  if (!rows) return error ? <p className="tiny" role="alert">{error}</p> : <p className="tiny muted">Loading…</p>;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="card stack" aria-label="Business customers">
      <h3 style={{ margin: 0 }}>Business customers</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Other companies' own AI employee, on their own website. Each business signs in at {origin}/business with its own key and sees only its
        own assistant and conversations. Answers come only from what the business typed in.
      </p>

      {issued && (
        <div className="card card-quiet stack" style={{ gap: 6 }} role="status">
          <strong className="small">Sign-in key for {issued.name}</strong>
          <p className="tiny" style={{ margin: 0 }}>Copy it now and send it to the business privately. It is shown only once; only a scrambled copy is kept.</p>
          <input readOnly value={issued.key} aria-label="Sign-in key" onFocus={(e) => e.currentTarget.select()} />
          <p className="tiny muted" style={{ margin: 0 }}>Their chat box code: &lt;script src="{origin}/widget.js" data-business="{issued.id}" async&gt;&lt;/script&gt;</p>
          <button className="btn btn-sm" onClick={() => setIssued(null)}>I copied it</button>
        </div>
      )}

      {rows.length === 0 && <p className="tiny muted" style={{ margin: 0 }}>No business customers yet.</p>}
      {rows.map((b) => (
        <div key={b.id} className="vendor-row stack" style={{ gap: 6 }}>
          <div className="row-between">
            <span className="vendor-name"><strong>{b.name}</strong><span className="tiny muted">{b.contactEmail}</span></span>
            <span className={`pill${b.status === "active" ? " pill-safe" : ""}`}>{b.status === "active" ? "Active" : "Suspended"}</span>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            {b.assistantName} · {b.used} of {b.messageLimit} answers in {month} · {b.conversations} saved conversations
          </p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-sm" onClick={() => void run(async () => { await api.businessUpdate(b.id, { status: b.status === "active" ? "suspended" : "active" }); })}>
              {b.status === "active" ? "Suspend" : "Reactivate"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => void run(async () => { const r = await api.businessNewKey(b.id); setIssued({ name: b.name, id: b.id, key: r.key }); })}>New key</button>
            <button className="btn btn-sm btn-ghost" onClick={() => {
              const v = window.prompt(`Answers a month for ${b.name}`, String(b.messageLimit));
              const n = Math.floor(Number(v));
              if (v && Number.isFinite(n)) void run(async () => { await api.businessUpdate(b.id, { messageLimit: n }); });
            }}>Change limit</button>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="card card-quiet stack" style={{ gap: 8 }}>
          <div className="field"><label htmlFor="bz-name">Business name</label>
            <input id="bz-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="bz-email">Their email</label>
            <input id="bz-email" inputMode="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
          <div className="field"><label htmlFor="bz-limit">AI answers a month (the plan's limit)</label>
            <input id="bz-limit" inputMode="numeric" value={form.messageLimit} onChange={(e) => setForm({ ...form, messageLimit: e.target.value })} /></div>
          <div className="row">
            <button className="btn grow" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn btn-primary grow" disabled={!form.name.trim() || !form.contactEmail.trim()} onClick={() => void run(async () => {
              const r = await api.businessCreate({ name: form.name, contactEmail: form.contactEmail, messageLimit: Number(form.messageLimit) || undefined });
              setIssued({ name: r.business.name, id: r.business.id, key: r.key });
              setForm({ name: "", contactEmail: "", messageLimit: "300" });
              setAdding(false);
            })}>Create</button>
          </div>
        </div>
      ) : <button className="btn btn-block" onClick={() => setAdding(true)}>Add a business</button>}
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}
