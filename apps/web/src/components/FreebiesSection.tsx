import { useEffect, useState } from "react";
import { FREEBIE_PLANS, MAX_ERRAND_CREDIT_CENTS, MAX_FREE_PICKUPS_PER_MONTH, type FreebiePlanId, type MonthlyFreebies } from "@safehubby/core";
import { api } from "../api.ts";

const PLAN_LABEL: Record<FreebiePlanId, string> = {
  free: "Free", "premium-basic": "Premium", "premium-plus": "Premium Plus", family: "Family",
};

/**
 * The owner's switch for what customers get free each month, and how much.
 * Customers see the change on their next visit: the app takes these numbers
 * from the catalog, and the server charges by them.
 */
export function FreebiesSection() {
  const [saved, setSaved] = useState<MonthlyFreebies | null>(null);
  const [defaults, setDefaults] = useState<MonthlyFreebies | null>(null);
  const [draft, setDraft] = useState<MonthlyFreebies | null>(null);
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (r: { freebies: MonthlyFreebies; defaults: MonthlyFreebies }) => {
    setSaved(r.freebies); setDraft(r.freebies); setDefaults(r.defaults);
    setCredit(String(r.freebies.basicCreditCents / 100));
  };
  useEffect(() => {
    api.masterFreebies().then(show).catch((e) => setError(e instanceof Error ? e.message : "Could not load this"));
  }, []);

  if (!draft || !saved || !defaults) return error ? <p className="tiny" role="alert">{error}</p> : null;

  const creditCents = Math.round(Number(credit || 0) * 100);
  const next: MonthlyFreebies = { ...draft, basicCreditCents: Number.isFinite(creditCents) ? creditCents : 0 };
  const changed = JSON.stringify(next) !== JSON.stringify(saved);

  const save = async (value: MonthlyFreebies) => {
    setBusy(true); setError(null); setNote(null);
    try {
      show(await api.masterSetFreebies(value));
      setNote("Saved. Customers see it the next time they open the app.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-label="Free each month">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Free each month</h3>
        <button className={`btn btn-sm ${draft.enabled ? "btn-primary" : ""}`} role="switch" aria-checked={draft.enabled}
          disabled={busy} onClick={() => void save({ ...next, enabled: !draft.enabled })}>
          {draft.enabled ? "On" : "Off"}
        </button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {draft.enabled
          ? "Customers get the no-fee pickups and Basic's food credit below, and they start over on the 1st. Runners are paid in full either way; Safehubby covers the fee."
          : "Off: nobody gets a free pickup or a food credit, and the row disappears from the plan table. Customers pay the normal fee."}
      </p>

      <div className="stack" style={{ gap: 8, opacity: draft.enabled ? 1 : 0.5 }}>
        <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>No-fee pickups per month</strong>
        {FREEBIE_PLANS.map((id) => (
          <div key={id} className="row-between">
            <label className="small" htmlFor={`fb-${id}`}>{PLAN_LABEL[id]}</label>
            <input id={`fb-${id}`} type="number" min={0} max={MAX_FREE_PICKUPS_PER_MONTH} step={1} style={{ width: 80 }}
              disabled={!draft.enabled || busy} value={draft.pickupsPerMonth[id]}
              onChange={(e) => setDraft({ ...draft, pickupsPerMonth: { ...draft.pickupsPerMonth, [id]: Number(e.target.value) } })} />
          </div>
        ))}
        <div className="row-between">
          <label className="small" htmlFor="fb-credit">Basic: food credit ($ per month)</label>
          <input id="fb-credit" type="number" min={0} max={MAX_ERRAND_CREDIT_CENTS / 100} step={1} style={{ width: 80 }}
            disabled={!draft.enabled || busy} value={credit} onChange={(e) => setCredit(e.target.value)} />
        </div>
        <span className="tiny muted">
          Standard: {FREEBIE_PLANS.map((id) => `${PLAN_LABEL[id]} ${defaults.pickupsPerMonth[id]}`).join(", ")}; Basic ${defaults.basicCreditCents / 100}.
          Elite stays unlimited. Most is {MAX_FREE_PICKUPS_PER_MONTH} pickups and ${MAX_ERRAND_CREDIT_CENTS / 100}.
        </span>
      </div>

      <div className="row">
        <button className="btn btn-primary grow" disabled={busy || !changed} onClick={() => void save(next)}>Save</button>
        <button className="btn grow" disabled={busy || JSON.stringify(next) === JSON.stringify(defaults)}
          onClick={() => void save(defaults)}>Back to standard</button>
      </div>
      {note && <p className="tiny" role="status">{note}</p>}
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}
