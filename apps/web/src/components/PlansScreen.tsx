import { useEffect, useState } from "react";
import { api } from "../api.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Plan picker. No card form: billing is not connected in this build, and a
 * realistic-looking payment step would be a lie told to the user's face.
 * The switch is real; the charge does not exist, and the screen says so.
 */
export function PlansScreen({ currentPlanId, onChanged }: {
  currentPlanId: string;
  onChanged: (planId: string) => void;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [cadence, setCadence] = useState<"monthly" | "annual">("annual");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.catalog().then((c) => setPlans(c.plans)).catch(() => {}); }, []);

  const choose = async (planId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.subscribe(planId, cadence);
      setNote(res.note);
      onChanged(res.plan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div>
        <h2>Pick a plan</h2>
        <p className="small muted">
          SOS, location sharing, check-ins and drink count are free forever. Paying unlocks the rest.
        </p>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={cadence === "monthly"} onClick={() => setCadence("monthly")}>Monthly</button>
        <button role="tab" aria-selected={cadence === "annual"} onClick={() => setCadence("annual")}>Annual</button>
      </div>

      {plans.map((p) => {
        const price = cadence === "annual" ? p.annualCents : p.monthlyCents;
        const saving = p.monthlyCents > 0
          ? Math.round(((p.monthlyCents * 12 - p.annualCents) / (p.monthlyCents * 12)) * 100)
          : 0;
        const current = p.id === currentPlanId;

        return (
          <section key={p.id} className={`card plan${current ? " plan-on" : ""}`}>
            <div className="row-between">
              <h3 style={{ color: "var(--text)", fontSize: 17 }}>{p.name}</h3>
              {current && <span className="pill pill-safe">Your plan</span>}
            </div>

            <div className="plan-price">
              {price === 0 ? "Free" : money(price)}
              {price > 0 && <span className="plan-per">/{cadence === "annual" ? "year" : "month"}</span>}
            </div>
            {cadence === "annual" && saving > 0 && <span className="pill pill-safe">Save {saving}%</span>}

            <p className="small muted">{p.blurb}</p>

            <button className={`btn btn-block${current ? "" : " btn-primary"}`} disabled={busy || current}
              onClick={() => choose(p.id)}>
              {current ? "Current plan" : p.monthlyCents === 0 ? "Switch to Free" : `Choose ${p.name}`}
            </button>
          </section>
        );
      })}

      {note && <div className="banner">{note}</div>}
      {error && <div className="banner banner-danger">{error}</div>}

      <p className="tiny muted">
        Billing isn&apos;t connected in this build — no payment method is taken and nothing is charged.
        Plans switch immediately so you can try the features.
      </p>
    </div>
  );
}
