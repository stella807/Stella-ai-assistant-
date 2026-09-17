import { useState } from "react";
import type { Feature, Plan } from "@safehubby/core";
import { useLanguage, type TranslationKey } from "../i18n.tsx";

/**
 * The actual answer to "what's different between the tiers" — a real
 * checklist, not the price ladder (which only answers "what does it cost")
 * or the carousel's own blurb (which only ever shows the one plan you're
 * looking at). Every row reads a real `Feature` off the plan's own
 * `features` array — nothing here is marketing copy invented for the table.
 *
 * A curated subset of `Feature`, not all of it: `ALL_FEATURES` runs to
 * safety basics that never differ (SOS, check-ins) and Elite-only entries
 * that belong on the Elite ladder's own card, not a table about the four
 * everyday tiers. Kept short enough to read at phone width without the
 * label column eating the plans it's supposed to compare.
 */
const COMPARE_ROWS: { feature: Feature; labelKey: TranslationKey }[] = [
  { feature: "personal-concierge", labelKey: "compare.concierge" },
  { feature: "desk-tasks", labelKey: "compare.deskTasks" },
  { feature: "venue-menus", labelKey: "compare.venueMenus" },
  { feature: "bac-estimate", labelKey: "compare.bacEstimate" },
  { feature: "recovery-plan", labelKey: "compare.recoveryPlan" },
  { feature: "automatic-rides", labelKey: "compare.automaticRides" },
  { feature: "automatic-delivery", labelKey: "compare.automaticDelivery" },
  { feature: "secure-transport", labelKey: "compare.secureTransport" },
  { feature: "extended-sos-contacts", labelKey: "compare.extendedSos" },
  { feature: "multi-profile", labelKey: "compare.multiProfile" },
];

export function PlanComparison({ plans }: { plans: Plan[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  if (plans.length === 0) return null;

  return (
    <section className="card stack">
      <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <h3 style={{ margin: 0 }}>{t("compare.heading")}</h3>
        <span className="chev">{open ? "︿" : "﹀"}</span>
      </button>

      {open && (
        <div style={{ overflowX: "auto" }}>
          <table className="pay-table compare-table">
            <thead>
              <tr>
                <th></th>
                {plans.map((p) => <th key={p.id}>{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("compare.seats")}</td>
                {plans.map((p) => <td key={p.id} className="compare-cell">{p.seats}</td>)}
              </tr>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td>{t(row.labelKey)}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="compare-cell">
                      {p.features.includes(row.feature)
                        ? <span className="compare-yes" aria-label={t("compare.included")}>✓</span>
                        : <span className="compare-no" aria-label={t("compare.notIncluded")}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
