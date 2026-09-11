import { useCallback, useEffect, useState } from "react";
import { api, type Billing } from "../api.ts";
import { PaymentMethodCard } from "./PaymentMethodCard.tsx";
import { PlanPicker } from "./PlanPicker.tsx";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load billing"));
  }, [load]);

  const run = async (fn: () => Promise<{ note: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      setNote(res.note);
      await load();
      setShowPlans(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!billing) {
    return (
      <div className="stack">
        <h2>Payments</h2>
        {error ? <div className="banner banner-danger">{error}</div> : <p className="small muted">Loading…</p>}
      </div>
    );
  }

  const { statement, subscription } = billing;
  const dueTotal = statement.settledCents + statement.pendingCents;

  return (
    <div className="stack">
      <div>
        <h2>Payments</h2>
        <p className="small muted">
          Your plan, your rides, your deliveries — one account, one card, one total.
        </p>
      </div>

      {/* The single number the screen exists to answer. */}
      <section className="card stack">
        <div className="row-between">
          <span className="small muted">Last 30 days</span>
          <span className="pill">{billing.plan.name}</span>
        </div>
        <div className="plan-price">{money(dueTotal)}</div>
        {statement.pendingCents > 0 && (
          <p className="tiny muted">
            {money(statement.pendingCents)} of that is still held and not yet taken — a trip that has not
            finished settling.
          </p>
        )}

        {statement.lines.length === 0 ? (
          <p className="small muted">Nothing charged yet.</p>
        ) : (
          <ul className="timeline">
            {statement.lines.map((l) => (
              <li key={l.kind}>
                <div className="row-between">
                  <div>
                    <strong className="small">{l.label}</strong>
                    <div className="tiny muted">{l.count} {l.count === 1 ? "charge" : "charges"}</div>
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
          <h3>Your plan</h3>
          {subscription?.status === "trialing" && <span className="pill pill-safe">Free trial</span>}
          {subscription?.status === "past-due" && <span className="pill">Payment failed</span>}
        </div>
        <p className="small">{billing.planNote}</p>

        <div className="row">
          <button className="btn grow" disabled={busy} onClick={() => setShowPlans((v) => !v)}>
            {showPlans ? "Close" : billing.plan.id === "free" ? "See plans" : "Change plan"}
          </button>
          {subscription && subscription.status !== "canceled" && billing.plan.id !== "free" && (
            <button className="btn btn-ghost grow" disabled={busy}
              onClick={() => run(() => api.cancelSubscription())}>
              Cancel
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
        <h3>Everything charged</h3>
        {billing.charges.length === 0 ? (
          <p className="small muted">
            Nothing yet. Rides and deliveries are only charged when one actually happens.
          </p>
        ) : (
          <ul className="timeline">
            {billing.charges.map((c) => (
              <li key={c.id}>
                <div className="row-between">
                  <div>
                    <strong className="small">{c.description}</strong>
                    <div className="tiny muted">
                      {c.kindLabel} · {dayOf(c.createdAt)}
                      {c.status === "pending" && " · held, not yet taken"}
                      {c.status === "failed" && ` · did not go through${c.failureReason ? `: ${c.failureReason}` : ""}`}
                      {c.status === "refunded" && " · refunded"}
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
          <h3>Where each charge goes</h3>
          {/* Said out loud rather than hidden: if two statements will show
              these charges, the user should hear it from us first. */}
          <p className="small muted">
            Your subscription and your trips settle through different companies, because the app stores
            require it. It is one account here either way.
          </p>
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
