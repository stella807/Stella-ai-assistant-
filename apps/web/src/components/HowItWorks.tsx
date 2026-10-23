import { ScreenCover } from "./ScreenCover.tsx";
import { useEffect, useState } from "react";
import {
  ARRANGE_RIDE_FEE_CENTS, ERRAND_TIERS, deskTaskAllowanceFor, errandFeeCents, hasFeature,
  includedConciergeHours, includedGrabAllowanceFor, serviceFeeFor, type PlanId,
} from "@safehubby/core";
import { api } from "../api.ts";
import { money } from "../money.ts";
import { AssistantArt, DeskArt, ErrandArt, RideArt } from "./art/Art.tsx";
import { PlanArt } from "./art/PlanArt.tsx";
import { PlanName } from "../app/plan-name.tsx";

interface CatalogPlan { id: string; name: string; monthlyCents: number; annualCents: number; blurb: string; seats: number }

const STEPS = [
  { art: <AssistantArt />, title: "Tell us what you need", text: "Pick the kind of help and say it in your own words. You see the full price before anything is sent." },
  { art: <ErrandArt />, title: "Choose your assistant", text: "See who is available — their photo, how long they have been doing this, and their age — and pick the one you want." },
  { art: <RideArt />, title: "Follow it from your phone", text: "Chat with them, see where they are, and approve any purchase before it is made." },
  { art: <DeskArt />, title: "Pay only for what was used", text: "You set a spending limit up front and are never charged past it. What is not spent is not charged." },
];

/**
 * How the money works, plan by plan — the prices come from the same core
 * functions the server charges with, so nothing here can drift from what a
 * booking really costs.
 */
export function HowItWorks({ onOpenPlans }: { onOpenPlans: () => void }) {
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.catalog().then((c) => {
      const list = c.plans as CatalogPlan[];
      setPlans(list);
      setSelected((cur) => cur ?? list.find((p) => p.id === "premium-plus")?.id ?? list[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const plan = plans.find((p) => p.id === selected) ?? null;

  return (
    <div className="stack how">
      <ScreenCover photo="hero" kicker="Safehubby" title="How it works">A person you choose, doing one thing, at a limit you set.</ScreenCover>

      <ol className="how-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card how-step" style={{ ["--i" as string]: i }}>
            <div className="how-art">{s.art}</div>
            <div>
              <span className="how-num">{i + 1}</span>
              <strong>{s.title}</strong>
              <p className="small muted" style={{ margin: "4px 0 0" }}>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="stack">
        <h3>What you pay, on your plan</h3>
        <div className="how-chips" role="tablist" aria-label="Plan">
          {plans.map((p) => (
            <button key={p.id} role="tab" aria-selected={selected === p.id} className="how-chip" onClick={() => setSelected(p.id)}><PlanName id={p.id} name={p.name} /></button>
          ))}
        </div>

        {plan && <PlanPricing plan={plan} onOpenPlans={onOpenPlans} />}
      </section>

      <section className="stack">
        <h3>Behind the scenes</h3>
        <div className="how-portals">
          <div className="card portal-card"><div className="how-art"><AssistantArt /></div>
            <strong>The workers' portal</strong>
            <p className="small muted">Each assistant signs in to their own portal: their requests, the chat with you, receipts, and what they are paid. Pay rates are published before anyone applies.</p></div>
          <div className="card portal-card"><div className="how-art"><DeskArt /></div>
            <strong>The owner's and secretary's portal</strong>
            <p className="small muted">Hiring, payroll, prices and the access log. A secretary sees only the parts the owner opens to them, and everything done there is recorded.</p></div>
        </div>
      </section>
    </div>
  );
}

function PlanPricing({ plan, onOpenPlans }: { plan: CatalogPlan; onOpenPlans: () => void }) {
  const id = plan.id as PlanId;
  const hourlyFee = serviceFeeFor("wait-with-someone", false, 1, 1);
  const hours = includedConciergeHours(id);
  const desk = deskTaskAllowanceFor(id);
  const grabs = includedGrabAllowanceFor(id);
  const hasAssistant = hasFeature(id, "personal-concierge");
  const hasErrands = hasFeature(id, "quick-tasks");
  const hasRides = hasFeature(id, "ride-booking");

  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Your plan", value: plan.monthlyCents === 0 ? "Free" : `${money(plan.monthlyCents)} a month`, note: plan.annualCents > 0 ? `or ${money(plan.annualCents)} a year` : undefined },
  ];
  if (hasAssistant) rows.push({
    label: "An assistant by the hour",
    value: `${money(hourlyFee)} an hour`,
    note: hours === Number.POSITIVE_INFINITY ? "Every hour is already paid for by your plan — no monthly limit." : hours > 0 ? `${hours} hours a month are already paid for by your plan.` : "Plus the spending limit you load for what they buy.",
  });
  if (hasErrands) {
    rows.push({
      label: "A free errand every month",
      value: grabs === null ? "No limit" : grabs === 0 ? "Not on this plan" : `${grabs} a month`,
      note: "A small thing from inside the building — a soda, a snack — carries no fee.",
    });
  }
  if (desk > 0) rows.push({ label: "Handled-for-you tasks", value: `${desk} a month`, note: "Appointments, reminders, calls and emails." });
  if (hasRides) rows.push({ label: "Rides", value: `${money(ARRANGE_RIDE_FEE_CENTS)} to arrange`, note: "Plus the fare itself, shown before it is confirmed." });

  return (
    <div className="card stack how-plan">
      <div className="how-plan-head"><PlanArt planId={plan.id} /><div><strong><PlanName id={plan.id} name={plan.name} /></strong><p className="small muted" style={{ margin: "2px 0 0" }}>{plan.blurb}</p></div></div>

      <dl className="how-rows">
        {rows.map((r) => (
          <div key={r.label} className="how-row"><dt>{r.label}</dt><dd><strong>{r.value}</strong>{r.note && <span className="tiny muted">{r.note}</span>}</dd></div>
        ))}
      </dl>

      {hasErrands && (
        <div className="stack" style={{ gap: 6 }}>
          <strong className="small">Errands, by how big they are</strong>
          {ERRAND_TIERS.map((t) => (
            <div key={t.id} className="row-between small">
              <span>{t.label}<span className="tiny muted"> · {t.example}</span></span>
              <span className="charge-amount">{money(errandFeeCents(t.id, t.suggestedCapCents))}</span>
            </div>
          ))}
          <p className="tiny muted" style={{ margin: 0 }}>Fees shown with a typical spending limit for that size. On top of the fee, you pay what is actually bought.</p>
        </div>
      )}

      <button className="btn btn-block" onClick={onOpenPlans}>See all the plans</button>
    </div>
  );
}
