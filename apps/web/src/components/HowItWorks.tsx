import { ScreenCover } from "./ScreenCover.tsx";
import { useEffect, useState } from "react";
import {
  ARRANGE_RIDE_FEE_CENTS, ERRAND_TIERS, deskTaskAllowanceFor, errandFeeCents, hasFeature,
  errandCreditFor, includedConciergeHours, includedGrabAllowanceFor, serviceFeeFor, type PlanId,
} from "@safehubby/core";
import { api } from "../api.ts";
import { money } from "../money.ts";
import { AssistantArt, DeskArt, ErrandArt, RideArt } from "./art/Art.tsx";
import { PlanArt } from "./art/PlanArt.tsx";
import { PlanName } from "../app/plan-name.tsx";
import { useLanguage } from "../i18n.tsx";
import { howWords } from "../app/how-copy.ts";
import { localized } from "../app/server-es.ts";

interface CatalogPlan { id: string; name: string; monthlyCents: number; annualCents: number; blurb: string; seats: number }

const STEP_ART = [<AssistantArt key="a" />, <ErrandArt key="e" />, <RideArt key="r" />, <DeskArt key="d" />];

/**
 * How the money works, plan by plan — the prices come from the same core
 * functions the server charges with, so nothing here can drift from what a
 * booking really costs.
 */
export function HowItWorks({ onOpenPlans }: { onOpenPlans: () => void }) {
  const w = howWords(useLanguage().language);
  const STEPS = w.steps.map((s, i) => ({ ...s, art: STEP_ART[i] }));
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
      <ScreenCover photo="hero" kicker="Safehubby" title={w.title}>{w.lead}</ScreenCover>

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
        <h3>{w.whatYouPay}</h3>
        <div className="how-chips" role="tablist" aria-label={w.plan}>
          {plans.map((p) => (
            <button key={p.id} role="tab" aria-selected={selected === p.id} className="how-chip" onClick={() => setSelected(p.id)}><PlanName id={p.id} name={p.name} /></button>
          ))}
        </div>

        {plan && <PlanPricing plan={plan} onOpenPlans={onOpenPlans} />}
      </section>

      <section className="stack">
        <h3>{w.behind}</h3>
        <div className="how-portals">
          <div className="card portal-card"><div className="how-art"><AssistantArt /></div>
            <strong>{w.workers}</strong>
            <p className="small muted">{w.workersBody}</p></div>
          <div className="card portal-card"><div className="how-art"><DeskArt /></div>
            <strong>{w.owners}</strong>
            <p className="small muted">{w.ownersBody}</p></div>
        </div>
      </section>
    </div>
  );
}

function PlanPricing({ plan, onOpenPlans }: { plan: CatalogPlan; onOpenPlans: () => void }) {
  const { language } = useLanguage();
  const w = howWords(language);
  const id = plan.id as PlanId;
  const hourlyFee = serviceFeeFor("wait-with-someone", false, 1, 1);
  const hours = includedConciergeHours(id);
  const desk = deskTaskAllowanceFor(id);
  const grabs = includedGrabAllowanceFor(id);
  const hasAssistant = hasFeature(id, "personal-concierge");
  const hasErrands = hasFeature(id, "quick-tasks");
  const hasRides = hasFeature(id, "ride-booking");

  const rows: { label: string; value: string; note?: string }[] = [
    { label: w.yourPlan, value: plan.monthlyCents === 0 ? w.free : w.perMonth(money(plan.monthlyCents)), note: plan.annualCents > 0 ? w.orYear(money(plan.annualCents)) : undefined },
  ];
  if (hasAssistant) rows.push({
    label: w.hourly,
    value: w.perHour(money(hourlyFee)),
    note: hours > 0 ? w.hoursPaid(hours) : w.plusCap,
  });
  const credit = errandCreditFor(id);
  if (credit > 0) rows.push({ label: w.foodTitle, value: w.foodValue(money(credit)), note: w.foodNote });
  // Free errands are paused on every plan but Basic's credit; nothing is shown for a 0.
  if (hasErrands && credit === 0 && grabs !== 0) {
    rows.push({
      label: w.freeErrand,
      value: grabs === null ? w.noLimit : grabs === 0 ? w.notOnPlan : w.perMonthCount(grabs),
      note: w.freeErrandNote,
    });
  }
  if (desk > 0) rows.push({ label: w.desk, value: w.perMonthCount(desk), note: w.deskNote });
  if (hasRides) rows.push({ label: w.rides, value: w.toArrange(money(ARRANGE_RIDE_FEE_CENTS)), note: w.ridesNote });

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
          <strong className="small">{w.errandsBySize}</strong>
          {ERRAND_TIERS.map((t) => (
            <div key={t.id} className="row-between small">
              <span>{localized(t.label, language)}<span className="tiny muted"> · {localized(t.example, language)}</span></span>
              <span className="charge-amount">{money(errandFeeCents(t.id, t.suggestedCapCents))}</span>
            </div>
          ))}
          <p className="tiny muted" style={{ margin: 0 }}>{w.feesNote}</p>
        </div>
      )}

      <button className="btn btn-block" onClick={onOpenPlans}>{w.seeAll}</button>
    </div>
  );
}
