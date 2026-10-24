import { useState, type ReactNode } from "react";
import {
  PHARMACY_RUN_FEE_CENTS, errandCreditFor, includedConciergeHours, includedGrabAllowanceFor,
} from "@safehubby/core";
import type { Feature, Plan } from "@safehubby/core";
import { useLanguage, type TranslationKey } from "../i18n.tsx";
import { money } from "../money.ts";
import { PlanName } from "../app/plan-name.tsx";

/**
 * The answer to "what's different between the tiers", kept short: one row per
 * thing a member would choose a plan for, with related features folded into
 * one row and what every plan has said once underneath instead of as a column
 * of identical ticks. Every cell is read off the plan's own `features` and the
 * same allowance functions the server charges with — nothing typed in.
 */
type Cell = { kind: "yes" } | { kind: "no" } | { kind: "text"; text: string };

const has = (p: Plan, ...fs: Feature[]) => fs.every((f) => p.features.includes(f));
const yesNo = (ok: boolean): Cell => (ok ? { kind: "yes" } : { kind: "no" });

export function PlanComparison({ plans }: { plans: Plan[] }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  if (plans.length === 0) return null;

  const rows: { label: TranslationKey; cell: (p: Plan) => Cell }[] = [
    { label: "compare.seats", cell: (p) => ({ kind: "text", text: String(p.seats) }) },
    { label: "compare.errands", cell: (p) => yesNo(has(p, "quick-tasks")) },
    {
      label: "compare.freeErrands",
      cell: (p) => {
        const credit = errandCreditFor(p.id);
        if (credit > 0) return { kind: "text", text: t("compare.foodCredit").replace("{amount}", `$${Math.round(credit / 100)}`) };
        const grabs = includedGrabAllowanceFor(p.id);
        if (grabs === null) return { kind: "text", text: t("compare.noCap") };
        return grabs > 0 ? { kind: "text", text: String(grabs) } : { kind: "no" };
      },
    },
    { label: "compare.concierge", cell: (p) => yesNo(has(p, "personal-concierge")) },
    {
      label: "compare.hoursIncluded",
      cell: (p) => {
        const h = includedConciergeHours(p.id);
        return h > 0 ? { kind: "text", text: t("compare.hours").replace("{n}", String(h)) } : { kind: "no" };
      },
    },
    { label: "compare.bookAndPay", cell: (p) => yesNo(has(p, "automatic-rides", "automatic-delivery")) },
    { label: "compare.nightOut", cell: (p) => yesNo(has(p, "venue-menus", "bac-estimate", "recovery-plan")) },
    { label: "compare.extendedSos", cell: (p) => yesNo(has(p, "extended-sos-contacts")) },
  ];

  const render = (c: Cell): ReactNode =>
    c.kind === "yes" ? <span className="compare-yes" aria-label={t("compare.included")}>✓</span>
      : c.kind === "no" ? <span className="compare-no" aria-label={t("compare.notIncluded")}>—</span>
      : <span className="compare-text">{c.text}</span>;

  return (
    <section className="card stack">
      <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <h3 style={{ margin: 0 }}>{t("compare.heading")}</h3>
        <span className="chev">{open ? "︿" : "﹀"}</span>
      </button>

      {open && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="pay-table compare-table">
              <thead>
                <tr>
                  <th></th>
                  {plans.map((p) => <th key={p.id}><PlanName id={p.id} name={p.name} /></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td>{t(row.label)}</td>
                    {plans.map((p) => <td key={p.id} className="compare-cell">{render(row.cell(p))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            {t("compare.everyPlan").replace("{amount}", money(PHARMACY_RUN_FEE_CENTS))}
          </p>
          {/* What the "no-fee pickups" row counts, said once: a number and a
              dollar amount in one row otherwise read as the same thing. */}
          <p className="tiny muted" style={{ margin: 0 }}>
            {t("compare.freeErrandsNote").replace("{credit}", `$${Math.round(errandCreditFor("basic") / 100)}`)}
          </p>
        </>
      )}
    </section>
  );
}
