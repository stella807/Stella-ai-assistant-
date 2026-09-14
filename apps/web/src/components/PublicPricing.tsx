import { useEffect, useState } from "react";
import {
  CONCIERGE_CATEGORIES, DRIVER_RATE_CARD, PA_HOURLY_RATE_CENTS, QUICK_TASK_CATEGORIES, assistantPayoutFor,
  defaultHoursFor, driverEarningsCents, isHourlyCategory, minutesFor, serviceFeeFor,
} from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage } from "../i18n.tsx";

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

  useEffect(() => { api.catalog().then((c) => setPlans(c.plans)).catch(() => {}); }, []);

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
            {plans.map((p) => {
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
