import { useEffect, useState } from "react";
import { payoutSheetCsv, type PayoutSheet } from "@safehubby/core";
import { api } from "../api.ts";
import { downloadBase64 } from "../files.ts";
import { money } from "../money.ts";

type Which = "previous" | "current";

/** UTF-8 with a byte-order mark, so a spreadsheet reads "Colón" as written. */
const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(`﻿${text}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Who is owed what for a payroll period, and for which jobs. It only looks:
 * sending the money is still a transfer from the business bank account, and
 * the sheet carries just the last four digits of anyone's account.
 */
export function PayoutSheetSection() {
  const [which, setWhich] = useState<Which>("previous");
  const [sheet, setSheet] = useState<PayoutSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setSheet(null);
    setError(null);
    api.masterPayoutSheet(which).then(setSheet)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the payout sheet"));
  }, [which]);

  const download = () => {
    if (!sheet) return;
    downloadBase64(`safehubby-payouts-${sheet.period.start.slice(0, 10)}.csv`, "text/csv", toBase64(payoutSheetCsv(sheet)));
  };

  return (
    <section className="card stack" aria-label="Payout sheet">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Who to pay</h3>
        <div className="tabs" role="tablist" aria-label="Pay period">
          <button role="tab" aria-selected={which === "previous"} onClick={() => setWhich("previous")}>Ready to pay</button>
          <button role="tab" aria-selected={which === "current"} onClick={() => setWhich("current")}>Building up</button>
        </div>
      </div>

      {error && <p className="tiny" role="alert">{error}</p>}
      {!sheet && !error && <p className="tiny muted">Loading…</p>}

      {sheet && (
        <>
          <p className="tiny muted">
            {day(sheet.period.start)} – {day(new Date(new Date(sheet.period.end).getTime() - 1).toISOString())}
            {which === "current" ? ". Still open: jobs finished before it closes are added." : ". Closed: this is what the next run sends."}
          </p>

          <div className="card card-quiet stack" style={{ gap: 2 }}>
            <div className="row-between"><span className="tiny muted">Earned by workers</span><span className="small">{money(sheet.totals.earnedCents)}</span></div>
            {sheet.totals.clawbackCents > 0 && (
              <div className="row-between"><span className="tiny muted">Owed back from disputes</span><span className="small">−{money(sheet.totals.clawbackCents)}</span></div>
            )}
            {sheet.totals.withheldCents > 0 && (
              <div className="row-between"><span className="tiny muted">Held for Hacienda</span><span className="small">−{money(sheet.totals.withheldCents)}</span></div>
            )}
            <div className="row-between"><strong className="small">To send</strong><strong className="small charge-amount">{money(sheet.totals.netCents)}</strong></div>
          </div>

          {sheet.lines.length === 0 && <p className="small muted">Nobody is owed anything for this period.</p>}

          {sheet.lines.map((l) => (
            <div key={l.assistantId} className="card card-quiet stack" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-block" aria-expanded={open === l.assistantId}
                onClick={() => setOpen(open === l.assistantId ? null : l.assistantId)}>
                <span className="row-between" style={{ width: "100%" }}>
                  <span className="small"><strong>{l.name}</strong> · {l.tasks.length} {l.tasks.length === 1 ? "job" : "jobs"}</span>
                  <strong className="charge-amount">{money(l.netCents)}</strong>
                </span>
              </button>
              <span className="tiny muted">
                {l.destination && `${l.destination.holderName}, account ending ${l.destination.last4}`}
                {l.withheldCents > 0 && `${l.destination ? " · " : ""}${money(l.withheldCents)} held for Hacienda`}
                {l.clawbackCents > 0 && ` · ${money(l.clawbackCents)} owed back`}
              </span>
              {l.blocker && <span className="tiny" role="alert">{l.blocker}</span>}
              {open === l.assistantId && (
                <ul className="timeline">
                  {l.tasks.map((t) => (
                    <li key={t.taskId}>
                      <div className="row-between">
                        <span className="small">{t.clientName}: {t.note.slice(0, 80)}</span>
                        <span className="small charge-amount">{money(t.payoutCents)}</span>
                      </div>
                      <span className="tiny muted">{t.category} · {day(t.completedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {sheet.sent.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>Already recorded for this period</strong>
              {sheet.sent.map((s) => (
                <div key={s.payoutId} className="row-between">
                  <span className="tiny muted">{s.name}: {s.status}{s.failureReason ? ` (${s.failureReason})` : ""}</span>
                  <span className="tiny">{money(s.totalCents)}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-block" disabled={sheet.lines.length === 0} onClick={download}>Download CSV for the bank or your accountant</button>
        </>
      )}
    </section>
  );
}
