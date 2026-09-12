import { useEffect, useState } from "react";
import { CONCIERGE_CATEGORIES, CONCIERGE_MAX_CAP_CENTS, CONCIERGE_MIN_CAP_CENTS, hasFeature } from "@safehubby/core";
import type { ConciergeCategory, ConciergeTask, PlanId } from "@safehubby/core";
import { api } from "../api.ts";
import { currentFix } from "../native/location.ts";
import type { Account } from "../api.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

type Quote = { provider: string; etaMinutes: number; description: string };

/**
 * Personal concierge: request a vetted partner-network professional for one
 * bounded, in-person task, at a spend cap the subscriber sets and that is
 * never exceeded — see concierge.ts for why this is a booking layer on an
 * already-vetted partner rather than an open "hire a stranger" tab.
 */
export function ConciergePanel({ account }: { account: Account }) {
  const locked = !hasFeature(account.planId as PlanId, "personal-concierge");

  const [category, setCategory] = useState<ConciergeCategory>("grab-something");
  const [note, setNote] = useState("");
  const [capDollars, setCapDollars] = useState(25);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [disclosures, setDisclosures] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [tasks, setTasks] = useState<ConciergeTask[]>([]);
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
          or check on someone in person. Part of the Family plan.
        </p>
      </section>
    );
  }

  const spendCapCents = Math.round(capDollars * 100);

  const getQuote = async () => {
    setBusy(true);
    setError(null);
    setQuote(null);
    try {
      const fix = await currentFix();
      if (!fix) throw new Error("Turn on location to request a concierge — your assistant needs to know where to go.");
      const res = await api.conciergeQuote({ category, note, location: fix, spendCapCents });
      setQuote(res.quote);
      setDisclosures(res.disclosures);
      setAcknowledged(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a quote right now");
    } finally {
      setBusy(false);
    }
  };

  const book = async () => {
    setBusy(true);
    setError(null);
    try {
      const fix = await currentFix();
      if (!fix) throw new Error("Turn on location to request a concierge.");
      const res = await api.bookConcierge({ category, note, location: fix, spendCapCents });
      setTasks((t) => [res.task, ...t]);
      setQuote(null);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send anyone right now");
    } finally {
      setBusy(false);
    }
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
                  <div className="tiny muted">{t.provider} · capped at {money(t.spendCapCents)}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
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
            onClick={() => { setCategory(c.id); setQuote(null); }} aria-pressed={c.id === category}>
            <strong>{c.label}</strong>
            <span className="tiny">{c.description}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="concierge-note">What do you need?</label>
        <textarea id="concierge-note" maxLength={280} rows={2} value={note}
          onChange={(e) => { setNote(e.target.value); setQuote(null); }}
          placeholder="Grab a burger and fries from The Anchor Tavern" />
      </div>

      <div className="field">
        <label htmlFor="concierge-cap">Spend cap — never charged more than this</label>
        <input id="concierge-cap" type="range" min={CONCIERGE_MIN_CAP_CENTS / 100} max={CONCIERGE_MAX_CAP_CENTS / 100}
          step={5} value={capDollars}
          onChange={(e) => { setCapDollars(Number(e.target.value)); setQuote(null); }} />
        <span className="small">{money(spendCapCents)}</span>
      </div>

      {!quote && (
        <button className="btn btn-block" disabled={busy || !note.trim()} onClick={getQuote}>
          Get a quote
        </button>
      )}

      {quote && (
        <>
          <div className="row-between">
            <strong className="small">{quote.provider}</strong>
            <span className="tiny muted">~{quote.etaMinutes} min</span>
          </div>
          <p className="small muted">{quote.description}</p>
          <ul className="timeline">
            {disclosures.map((d) => <li key={d}><span className="tiny muted">{d}</span></li>)}
          </ul>
          <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span className="small">I understand what this means and want to send someone.</span>
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !acknowledged} onClick={book}>
            Send someone (capped at {money(spendCapCents)})
          </button>
        </>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </section>
  );
}
