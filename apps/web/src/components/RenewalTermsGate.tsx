import { useEffect, useState } from "react";
import { api, type RenewalTermsView } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { money } from "../money.ts";

/**
 * The automatic-renewal disclosure, and the agreement to it.
 *
 * California's Automatic Renewal Law wants the terms **clearly and
 * conspicuously** presented, in visual proximity to the control that accepts
 * them, with affirmative consent to those terms rather than to a general
 * terms-of-service checkbox. So this is a panel that replaces the plan list
 * rather than a line of small print beneath it, the checkbox sits directly
 * above the button it gates, and the button stays disabled until it is
 * ticked.
 *
 * The numbers come from the server, not from the plan card, because the
 * price shown here is the price the consent is checked against. See
 * auto-renewal.ts for the matching refusal on the other side — if the two
 * ever disagree, the subscription is refused rather than created at a price
 * nobody agreed to.
 */
export function RenewalTermsGate({ planId, cadence, onAgree, onCancel, busy }: {
  planId: string;
  cadence: "monthly" | "annual";
  /** Consent is undefined for a plan with nothing to renew into. */
  onAgree: (consent?: { priceCents: number }) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [terms, setTerms] = useState<RenewalTermsView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setTerms(null);
    setAgreed(false);
    setError(null);
    api.renewalTerms(planId, cadence)
      .then((next) => {
        if (!live) return;
        // A free plan renews into nothing, so there is nothing to disclose and
        // nothing to agree to. Stopping to ask would be theatre.
        if (!next.required) onAgree();
        else setTerms(next);
      })
      .catch(() => { if (live) setError("Those terms could not be loaded. Try again."); });
    return () => { live = false; };
    // onAgree is a fresh closure each render; re-running on it would re-fetch
    // forever. The offer is what this effect actually depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, cadence]);

  if (error) return <p className="small" style={{ color: "var(--danger)" }}>{error}</p>;
  if (!terms) return <p className="small muted">…</p>;

  const period = t(cadence === "annual" ? "renewal.annual" : "renewal.monthly");
  const date = new Date(terms.firstChargeAt).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <section className="card stack renewal-gate">
      <h3 style={{ margin: 0 }}>{t("renewal.heading")}</h3>

      <p className="renewal-what">
        {t("renewal.what")
          .replace("{name}", terms.planName)
          .replace("{period}", period)
          .replace("{price}", money(terms.priceCents))}
      </p>

      <p className="small">
        {terms.trialDays > 0
          ? t("renewal.trial").replace("{days}", String(terms.trialDays)).replace("{date}", date)
          : t("renewal.firstCharge").replace("{date}", date)}
      </p>

      <p className="small muted" style={{ margin: 0 }}>{t("renewal.cancelAnytime")}</p>

      <label className="renewal-agree">
        <input type="checkbox" id="renewal-agree" checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)} />
        <span>{t("renewal.agree")}</span>
      </label>

      <div className="row">
        <button className="btn btn-primary grow" disabled={!agreed || busy}
          onClick={() => onAgree({ priceCents: terms.priceCents })}>
          {t("renewal.confirm")}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          {t("renewal.back")}
        </button>
      </div>
    </section>
  );
}
