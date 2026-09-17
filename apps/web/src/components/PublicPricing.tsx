import { useEffect, useState } from "react";
import {
  CONCIERGE_CATEGORIES, DRIVER_RATE_CARD, ELITE_ONLY, PA_HOURLY_RATE_CENTS,
  QUICK_TASK_CATEGORIES, assistantPayoutFor, defaultHoursFor, driverEarningsCents, featureLabel,
  includedConciergeHours, isElitePlan, isHourlyCategory, minutesFor, serviceFeeFor,
  type Plan, type PlanId,
} from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { PlanComparison } from "./PlanComparison.tsx";

import { money } from "../money.ts";

/**
 * What everything costs, before anybody signs up.
 *
 * The gap this closes: a visitor could not find out what a plan cost, or what
 * sending somebody actually costs, without first creating an account and
 * navigating to the billing screen. That is a lot to ask of a stranger, and
 * it is the opposite of how the rest of this app treats prices — the plan
 * cards show the discount before you agree to it, the concierge form shows
 * the fee before you book. The landing page was the one place still asking
 * for a commitment before showing a number.
 *
 * It also draws the line the copy used to blur. "Grab something, check on a
 * friend, or just be there" described two different services as one: a short
 * errand, and somebody staying with a person who should not be alone. They
 * have different prices, different lengths, and — the part that matters —
 * different people, because only a personal assistant is dispatched to the
 * second (see roster.ts).
 */
export function PublicPricing({ onGetStarted }: { onGetStarted: () => void }) {
  const { t } = useLanguage();
  const [plans, setPlans] = useState<any[]>([]);
  const [eliteUnlock, setEliteUnlock] = useState<Awaited<ReturnType<typeof api.catalog>>["eliteUnlock"] | null>(null);

  useEffect(() => {
    api.catalog().then((c) => { setPlans(c.plans); setEliteUnlock(c.eliteUnlock); }).catch(() => {});
  }, []);

  const errands = CONCIERGE_CATEGORIES.filter((c) => QUICK_TASK_CATEGORIES.includes(c.id));
  const concierge = CONCIERGE_CATEGORIES.filter((c) => !QUICK_TASK_CATEGORIES.includes(c.id));

  return (
    <>
      <section className="card card-lead stack">
        <h2>{t("pricing.heading")}</h2>
        <p className="small muted" style={{ margin: 0 }}>{t("pricing.subtitle")}</p>

        <table className="pay-table">
          <thead>
            <tr><th>{t("pricing.plan")}</th><th>{t("pricing.perMonth")}</th><th>{t("pricing.people")}</th></tr>
          </thead>
          <tbody>
            {plans.filter((p) => !isElitePlan(p.id as PlanId)).map((p) => {
              const offer = p.monthlyOffer;
              const discounted = Boolean(offer?.discounted) && p.monthlyCents > 0;
              return (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {p.id === "premium-plus" && (
                      <div className="plan-tag" style={{ marginTop: 2 }}>Most picked</div>
                    )}
                  </td>
                  <td>
                    {p.monthlyCents === 0 ? t("pricing.free") : (
                      <>
                        {discounted && <s className="plan-was">{money(p.monthlyCents)}</s>}
                        {money(discounted ? offer.payCents : p.monthlyCents)}
                      </>
                    )}
                  </td>
                  <td>{p.seats}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="tiny muted" style={{ margin: 0 }}>{t("pricing.freeNote")}</p>
      </section>

      <PlanComparison plans={plans.filter((p) => !isElitePlan(p.id as PlanId))} />

      <EliteShowcase plans={plans.filter((p) => isElitePlan(p.id as PlanId))} eliteUnlock={eliteUnlock} />

      {/* The two services, priced and kept apart. */}
      <section className="card stack">
        <h2>{t("pricing.sendSomeone")}</h2>

        <div className="stack" style={{ gap: 4 }}>
          <strong className="small">{t("pricing.errandsTitle")}</strong>
          <p className="tiny muted" style={{ margin: 0 }}>{t("pricing.errandsBlurb")}</p>
        </div>
        <TaskPrices categories={errands} />

        <div className="stack" style={{ gap: 4, marginTop: 4 }}>
          <strong className="small">{t("pricing.conciergeTitle")}</strong>
          <p className="tiny muted" style={{ margin: 0 }}>{t("pricing.conciergeBlurb")}</p>
        </div>
        <TaskPrices categories={concierge} />

        <p className="tiny muted" style={{ margin: 0 }}>{t("pricing.capNote")}</p>
      </section>

      <button className="btn btn-primary btn-block" onClick={onGetStarted}>
        {t("landing.getStarted")}
      </button>
    </>
  );
}

/**
 * Elite's own "what's included" — kept out of `PlanComparison` on purpose.
 * That table compares the four everyday tiers on the handful of features
 * that actually *differ* between them; Elite already has every one of
 * those (`features: [...PLUS_FEATURES, ...ELITE_ONLY]`), so dropping it in
 * there would just paint a row of checkmarks that says nothing about what
 * Elite is actually for. What's worth showing instead is `ELITE_ONLY` —
 * the catalogue no everyday tier reaches at any price — and the ladder's
 * own shape: price and included hours scale with how many people the
 * membership covers, 1 → 2 → 6, not the everyday ladder's household size.
 */
function EliteShowcase({ plans, eliteUnlock }: {
  plans: Plan[];
  eliteUnlock: {
    thresholdCents: number; trailingRevenueCents: number; unlocked: boolean; percent: number;
    targetClientsLow: number; targetClientsHigh: number; safetyMultiple: number;
  } | null;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  if (plans.length === 0) return null;
  const rungs = [...plans].sort((a, b) => a.seats - b.seats);
  const locked = rungs.some((p) => (p as unknown as { locked?: boolean }).locked);

  return (
    <section className="card stack" aria-label="Elite">
      <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <h3 style={{ margin: 0 }}>
          Elite: what's included
          {locked && <span className="plan-tag" style={{ marginLeft: 8 }}>Coming soon</span>}
        </h3>
        <span className="chev">{open ? "︿" : "﹀"}</span>
      </button>
      <p className="tiny muted" style={{ margin: 0 }}>
        Every Elite rung gets the same desk, including a concierge physician's own retainer — paid by
        Safehubby, not billed to you separately. What changes rung to rung is how many people the
        membership covers and how many hours of a personal assistant's time come with it.
      </p>

      {open && (
        <>
          {locked && eliteUnlock && (
            <div className="card card-quiet stack" style={{ gap: 6 }}>
              <strong className="small">Not open yet — here's why, and what unlocks it</strong>
              <p className="tiny muted" style={{ margin: 0 }}>
                Elite includes a monthly spending allowance Safehubby funds itself (see below), so we're
                holding the tier until the business has revenue covering {eliteUnlock.safetyMultiple}× what that
                would cost if our first {eliteUnlock.targetClientsLow}-{eliteUnlock.targetClientsHigh} members per
                rung all drew their full allowance in the same month. That's the honest order: cover the
                commitment first, sell the tier second.
              </p>
              <div className="progress-track" role="progressbar" aria-valuenow={eliteUnlock.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-fill" style={{ width: `${eliteUnlock.percent}%` }} />
              </div>
              <p className="tiny muted" style={{ margin: 0 }}>
                {money(eliteUnlock.trailingRevenueCents)} of {money(eliteUnlock.thresholdCents)} needed ({eliteUnlock.percent}%).
              </p>
            </div>
          )}

          <table className="pay-table">
            <thead>
              <tr><th>{t("pricing.plan")}</th><th>{t("pricing.perMonth")}</th><th>{t("pricing.people")}</th><th>Concierge hours/mo</th></tr>
            </thead>
            <tbody>
              {rungs.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{money(p.monthlyCents)}</td>
                  <td>{p.seats}</td>
                  <td>{includedConciergeHours(p.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="tiny" style={{ margin: 0, paddingLeft: 18 }}>
            {ELITE_ONLY.map((f) => <li key={f}>{featureLabel(f)}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function TaskPrices({ categories }: { categories: typeof CONCIERGE_CATEGORIES }) {
  const { t } = useLanguage();
  return (
    <table className="pay-table">
      <thead>
        <tr><th>{t("pricing.task")}</th><th>{t("pricing.typical")}</th><th>{t("pricing.youPay")}</th></tr>
      </thead>
      <tbody>
        {categories.map((c) => (
          <tr key={c.id}>
            <td>{c.label}</td>
            <td className="tiny muted">
              {isHourlyCategory(c.id) ? `${defaultHoursFor(c.id)} hr` : `${minutesFor(c.id)} min`}
            </td>
            <td>
              {money(serviceFeeFor(c.id))}
              {isHourlyCategory(c.id) && <span className="tiny muted"> for that booking</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What Safehubby pays the people who do the work, shown to them before they
 * apply rather than inside the application form.
 *
 * The rate was already published — it was just one click too deep. Somebody
 * deciding whether to apply is exactly who the number is for.
 */
export function PublicWorkerPay() {
  const { t } = useLanguage();
  const standard = DRIVER_RATE_CARD.standard;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <strong className="small">{t("pay.heading")}</strong>
      <table className="pay-table">
        <tbody>
          {CONCIERGE_CATEGORIES.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td className="tiny muted">
                {isHourlyCategory(c.id) ? `${money(PA_HOURLY_RATE_CENTS)}/hr` : `${minutesFor(c.id)} min`}
              </td>
              <td>{money(assistantPayoutFor(c.id))}</td>
            </tr>
          ))}
          <tr>
            <td>{t("pay.driverRow")}</td>
            <td className="tiny muted">5 mi / 15 min</td>
            <td>{money(driverEarningsCents("standard", 5, 15))}</td>
          </tr>
        </tbody>
      </table>
      <p className="tiny muted" style={{ margin: 0 }}>
        {t("pay.driverNote")
          .replace("{base}", money(standard.baseCents))
          .replace("{mile}", money(standard.perMileCents))
          .replace("{minute}", money(standard.perMinuteCents))}
      </p>
      <p className="tiny muted" style={{ margin: 0 }}>{t("pay.note")}</p>
    </div>
  );
}
