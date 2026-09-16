import { useState } from "react";
import type { Feature, Plan } from "@safehubby/core";

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
const COMPARE_ROWS: { feature: Feature; label: string }[] = [
  { feature: "personal-concierge", label: "Personal concierge" },
  { feature: "desk-tasks", label: "Ask an assistant" },
  { feature: "venue-menus", label: "Venue menus" },
  { feature: "bac-estimate", label: "BAC estimate" },
  { feature: "recovery-plan", label: "Recovery plan" },
  { feature: "automatic-rides", label: "Safehubby books your ride" },
  { feature: "automatic-delivery", label: "Safehubby sends supplies" },
  { feature: "secure-transport", label: "Secure transport" },
  { feature: "extended-sos-contacts", label: "Extended SOS contacts" },
  { feature: "multi-profile", label: "Multiple people, one account" },
];

export function PlanComparison({ plans }: { plans: Plan[] }) {
  const [open, setOpen] = useState(true);
  if (plans.length === 0) return null;

  return (
    <section className="card stack">
      <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <h3 style={{ margin: 0 }}>Compare what's included</h3>
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
                <td>Seats</td>
                {plans.map((p) => <td key={p.id} className="compare-cell">{p.seats}</td>)}
              </tr>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td>{row.label}</td>
                  {plans.map((p) => (
                    <td key={p.id} className="compare-cell">
                      {p.features.includes(row.feature)
                        ? <span className="compare-yes" aria-label="Included">✓</span>
                        : <span className="compare-no" aria-label="Not included">—</span>}
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
