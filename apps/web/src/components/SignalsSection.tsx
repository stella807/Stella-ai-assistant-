import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { askedAndPaid, rows } from "../app/signals-view.ts";

type Signals = Awaited<ReturnType<typeof api.signals>>;

/**
 * What visitors actually do, counted quietly: how often each paid thing was shown a price and how often it was paid for,
 * which named crawlers come, what agents search for, and what nobody could answer. Counts only: no addresses, no names,
 * and nothing anyone typed in the chat box.
 */
export function SignalsSection() {
  const [s, setS] = useState<Signals | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.signals().then(setS).catch((e) => setError(e instanceof Error ? e.message : "Could not load")); }, []);
  if (!s) return error ? <p className="tiny" role="alert">{error}</p> : <p className="tiny muted">Loading…</p>;
  const month = rows(s.products);
  const week = new Map(rows(s.last7).map((r) => [r.id, r.text]));
  return (
    <section className="card stack" aria-label="Signals">
      <h3 style={{ margin: 0 }}>Signals</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        What visitors do, counted quietly over the last 30 days. Only counts and the words an AI agent searched for. No addresses,
        no names, and nothing typed in the chat box is saved.
      </p>
      {s.insights.map((t) => <p key={t} className="small" style={{ margin: 0 }}>{t}</p>)}

      <h4 style={{ margin: "8px 0 0" }}>Asked and paid</h4>
      {month.length === 0 && <p className="tiny muted" style={{ margin: 0 }}>Nothing counted yet.</p>}
      {month.map((r) => (
        <p key={r.id} className="small" style={{ margin: 0 }}>
          <strong>{r.name}:</strong> {r.text}
          {week.get(r.id) ? <span className="tiny muted"> · this week: {week.get(r.id)}</span> : null}
        </p>
      ))}

      {s.crawlers.length > 0 && <>
        <h4 style={{ margin: "8px 0 0" }}>Which crawlers hit the paywall</h4>
        {s.crawlers.map((c) => <p key={c.name} className="small" style={{ margin: 0 }}><strong>{c.name}:</strong> {askedAndPaid(c)}</p>)}
      </>}

      {s.queries.length > 0 && <>
        <h4 style={{ margin: "8px 0 0" }}>What agents search for</h4>
        {s.queries.map((q) => <p key={q.text} className="small" style={{ margin: 0 }}>{q.text} <span className="tiny muted">· {q.count}×</span></p>)}
      </>}

      {s.unanswered.length > 0 && <>
        <h4 style={{ margin: "8px 0 0" }}>Searches with no answer</h4>
        <p className="tiny muted" style={{ margin: 0 }}>Each one is a fact or a vendor we could add.</p>
        {s.unanswered.map((q) => <p key={q.text} className="small" style={{ margin: 0 }}>{q.text} <span className="tiny muted">· {q.count}×</span></p>)}
      </>}

      <h4 style={{ margin: "8px 0 0" }}>Chat box</h4>
      <p className="small" style={{ margin: 0 }}>
        {s.chat.asked === 0 ? "No questions yet." : `${s.chat.asked} question${s.chat.asked === 1 ? "" : "s"}, ${s.chat.handoff} sent to a person.`}
      </p>

      <h4 style={{ margin: "8px 0 0" }}>Buyers</h4>
      <p className="small" style={{ margin: 0 }}>
        {s.buyers.total === 0 ? "No buyers yet." : `${s.buyers.total} different buyer${s.buyers.total === 1 ? "" : "s"}, ${s.buyers.repeat} came back.`}
      </p>
    </section>
  );
}
