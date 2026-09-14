import { useEffect, useState } from "react";
import { api } from "../api.ts";

import { money } from "../money.ts";

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
        // Premium Plus: everything the app does, for two, and the tier the
        // pricing is actually built around. A list of four equal options
        // makes the reader do the comparing.
        const featured = p.id === "premium-plus" && !current;
        // What joining today actually costs, computed by the server (see the
        // catalog route). The launch discount has to be visible on the price
        // somebody is agreeing to, not just on a banner above it.
        const offer = cadence === "annual" ? p.annualOffer : p.monthlyOffer;
        const discounted = Boolean(offer?.discounted) && price > 0;

        return (
          <section key={p.id} className={`card plan${current ? " plan-on" : ""}${featured ? " plan-featured" : ""}`}>
            {featured && <span className="plan-tag">Most people pick this</span>}
            <div className="row-between">
              <h3>{p.name}</h3>
              {current && <span className="pill pill-safe">Your plan</span>}
            </div>

            <div className="plan-price">
              {price === 0 ? "Free" : (
                <>
                  {discounted && <s className="plan-was">{money(price)}</s>}
                  {money(discounted ? offer.payCents : price)}
                </>
              )}
              {price > 0 && <span className="plan-per">/{cadence === "annual" ? "year" : "month"}</span>}
            </div>

            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {cadence === "annual" && saving > 0 && <span className="pill pill-safe">Save {saving}%</span>}
              {/* The amount, not just the percentage: 3% is a number nobody can
                  price in their head, and this is small enough that hiding it
                  behind a percentage would be the flattering version. */}
              {discounted && (
                <span className="pill pill-safe">
                  Launch party — {money(offer.discountCents)} off your first year
                </span>
              )}
            </div>

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
