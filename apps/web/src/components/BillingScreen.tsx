import { useCallback, useEffect, useState } from "react";
import { api, type Billing } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { PaymentMethodCard } from "./PaymentMethodCard.tsx";
import { PlanPicker } from "./PlanPicker.tsx";

import { money } from "../money.ts";

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * One place for everything Safehubby charges.
 *
 * The whole point: the plan, the card, the ride home and the pharmacy run are
 * one account, shown on one screen, adding up to one number. Which rail settled
 * a given line — the card, or Apple's or Google's billing, because a store
 * requires it for the subscription and forbids it for a delivery — is a
 * footnote under the line, not a second screen and not a second product.
 */
export function BillingScreen({ currentPlanId, onPlanChanged }: {
  currentPlanId: string;
  onPlanChanged: (planId: string) => void;
}) {
  const { t } = useLanguage();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  const load = useCallback(async () => {
    const state = await api.billing();
    setBilling(state);
    onPlanChanged(state.plan.id);
  }, [onPlanChanged]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : t("billing.couldNotLoad")));
  }, [load, t]);

  const run = async (fn: () => Promise<{ note: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setNote(res.note);
      await load();
      setShowPlans(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("billing.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  if (!billing) {
    return (
      <div className="stack">
        <h2>{t("billing.heading")}</h2>
        {error ? <div className="banner banner-danger">{error}</div> : <p className="small muted">{t("billing.loading")}</p>}
      </div>
    );
  }

  const { statement, subscription } = billing;
  const dueTotal = statement.settledCents + statement.pendingCents;

  return (
    <div className="stack">
      <div>
        <h2>{t("billing.heading")}</h2>
        <p className="small muted">{t("billing.subtitle")}</p>
      </div>

      {/* The single number the screen exists to answer. */}
      <section className="card stack">
        <div className="row-between">
          <span className="small muted">{t("billing.last30Days")}</span>
          <span className="pill">{billing.plan.name}</span>
        </div>
        <div className="plan-price">{money(dueTotal)}</div>
        {statement.pendingCents > 0 && (
          <p className="tiny muted">
            {t("billing.pendingNote").replace("{amount}", money(statement.pendingCents))}
          </p>
        )}

        {statement.lines.length === 0 ? (
          <p className="small muted">{t("billing.nothingCharged")}</p>
        ) : (
          <ul className="timeline">
            {statement.lines.map((l) => (
              <li key={l.kind}>
                <div className="row-between">
                  <div>
                    <strong className="small">{l.label}</strong>
                    <div className="tiny muted">{l.count} {t(l.count === 1 ? "billing.chargeSingular" : "billing.chargePlural")}</div>
                  </div>
                  <span className="small charge-amount">{money(l.cents)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack">
        <div className="row-between">
          <h3>{t("billing.yourPlan")}</h3>
          {subscription?.status === "trialing" && <span className="pill pill-safe">{t("billing.freeTrial")}</span>}
          {subscription?.status === "past-due" && <span className="pill">{t("billing.paymentFailed")}</span>}
        </div>
        <p className="small">{billing.planNote}</p>

        <div className="row">
          <button className="btn grow" disabled={busy} onClick={() => setShowPlans((v) => !v)}>
            {showPlans ? t("billing.close") : billing.plan.id === "free" ? t("billing.seePlans") : t("billing.changePlan")}
          </button>
          {subscription && subscription.status !== "canceled" && billing.plan.id !== "free" && (
            <button className="btn btn-ghost grow" disabled={busy}
              onClick={() => run(() => api.cancelSubscription())}>
              {t("billing.cancel")}
            </button>
          )}
        </div>

        {showPlans && (
          <PlanPicker currentPlanId={currentPlanId} busy={busy}
            onChoose={(planId, cadence) => run(() => api.subscribe(planId, cadence))} />
        )}
      </section>

      <PaymentMethodCard />

      <section className="card stack">
        <h3>{t("billing.everythingCharged")}</h3>
        {billing.charges.length === 0 ? (
          <p className="small muted">{t("billing.nothingYet")}</p>
        ) : (
          <ul className="timeline">
            {billing.charges.map((c) => (
              <li key={c.id}>
                <div className="row-between">
                  <div>
                    <strong className="small">{c.description}</strong>
                    <div className="tiny muted">
                      {c.kindLabel} · {dayOf(c.createdAt)}
                      {c.status === "pending" && ` · ${t("billing.heldNotYetTaken")}`}
                      {c.status === "failed" && ` · ${t("billing.didNotGoThrough")}${c.failureReason ? `: ${c.failureReason}` : ""}`}
                      {c.status === "refunded" && ` · ${t("billing.refunded")}`}
                    </div>
                  </div>
                  <span className={`small charge-amount${c.status === "failed" || c.status === "refunded" ? " charge-void" : ""}`}>
                    {money(c.amountCents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {billing.rails.length > 1 && (
        <section className="card stack">
          <h3>{t("billing.whereEachChargeGoes")}</h3>
          {/* Said out loud rather than hidden: if two statements will show
              these charges, the user should hear it from us first. */}
          <p className="small muted">{t("billing.railsNote")}</p>
          <ul className="timeline">
            {billing.rails.map((r) => <li key={r.rail}><span className="tiny muted">{r.note}</span></li>)}
          </ul>
        </section>
      )}

      {note && <div className="banner">{note}</div>}
      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
