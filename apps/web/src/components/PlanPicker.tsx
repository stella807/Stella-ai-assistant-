import { useEffect, useState } from "react";
import { api } from "../api.ts";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The plan list, and nothing else.
 *
 * It reports which plan was picked and at what cadence; what that costs, how it
 * is prorated and which rail settles it belong to the billing screen that owns
 * the account, not to a list of cards.
 */
export function PlanPicker({ currentPlanId, busy, onChoose }: {
  currentPlanId: string;
  busy: boolean;
  onChoose: (planId: string, cadence: "monthly" | "annual") => void;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [cadence, setCadence] = useState<"monthly" | "annual">("annual");

  useEffect(() => { api.catalog().then((c) => setPlans(c.plans)).catch(() => {}); }, []);

  return (
    <>
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
              onClick={() => onChoose(p.id, cadence)}>
              {current ? "Current plan" : p.monthlyCents === 0 ? "Switch to Free" : `Choose ${p.name}`}
            </button>
          </section>
        );
      })}

      <p className="tiny muted">
        SOS, location sharing, check-ins and drink count are free forever. Switching mid-month only bills the
        difference — the part of the period you already paid for is credited, never charged twice.
      </p>
    </>
  );
}
