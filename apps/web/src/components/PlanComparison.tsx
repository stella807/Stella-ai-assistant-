import { useState } from "react";
import { maxCapFor } from "@safehubby/core";
import type { ConciergeCategory, Feature, Plan, PlanId } from "@safehubby/core";
import { useLanguage, type TranslationKey } from "../i18n.tsx";
import { dollars } from "../money.ts";

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
 *
 * The two `quick-tasks` rows lead, and share one flag on purpose: grabbing
 * something and running an errand are one capability in `billing.ts` but two
 * different asks to the person reading this, and both are on Free. A single
 * "quick tasks" row would have left someone comparing tiers unable to see
 * that the free plan can have a coffee brought to them — which is the whole
 * reason that flag is on Free in the first place.
 */
const COMPARE_ROWS: { id: string; feature: Feature; labelKey: TranslationKey; capCategory?: ConciergeCategory }[] = [
  // Free's ceiling here is far lower than a paid plan's, so a bare ✓ in both
  // columns would read as parity that doesn't exist — hence `capCategory`,
  // which prints each plan's real `maxCapFor` — or "no limit" where there
  // isn't one — rather than a number retyped into the table and left to
  // drift.
  { id: "grab-something", feature: "quick-tasks", labelKey: "compare.grabSomething", capCategory: "grab-something" },
  { id: "run-errand", feature: "quick-tasks", labelKey: "compare.runErrand", capCategory: "run-errand" },
  { id: "personal-concierge", feature: "personal-concierge", labelKey: "compare.concierge" },
  { id: "desk-tasks", feature: "desk-tasks", labelKey: "compare.deskTasks" },
  { id: "venue-menus", feature: "venue-menus", labelKey: "compare.venueMenus" },
  { id: "bac-estimate", feature: "bac-estimate", labelKey: "compare.bacEstimate" },
  { id: "recovery-plan", feature: "recovery-plan", labelKey: "compare.recoveryPlan" },
  { id: "automatic-rides", feature: "automatic-rides", labelKey: "compare.automaticRides" },
  { id: "automatic-delivery", feature: "automatic-delivery", labelKey: "compare.automaticDelivery" },
  { id: "secure-transport", feature: "secure-transport", labelKey: "compare.secureTransport" },
  { id: "extended-sos-contacts", feature: "extended-sos-contacts", labelKey: "compare.extendedSos" },
  { id: "multi-profile", feature: "multi-profile", labelKey: "compare.multiProfile" },
];

export function PlanComparison({ plans }: { plans: Plan[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);

  const capNote = (category: ConciergeCategory, planId: PlanId) => {
    const cap = maxCapFor(category, planId);
    return cap === null ? t("compare.noCap") : t("compare.upToCap").replace("{amount}", dollars(cap));
  };

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
                <tr key={row.id}>
                  <td>{t(row.labelKey)}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="compare-cell">
                      {p.features.includes(row.feature) ? (
                        <>
                          <span className="compare-yes" aria-label={t("compare.included")}>✓</span>
                          {row.capCategory && (
                            <div className="tiny muted">{capNote(row.capCategory, p.id)}</div>
                          )}
                        </>
                      ) : (
                        <span className="compare-no" aria-label={t("compare.notIncluded")}>—</span>
                      )}
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
