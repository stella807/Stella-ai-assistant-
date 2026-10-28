import { useEffect, useMemo, useState } from "react";
import { CALCULATOR_PLANS, defaultPnlInputs, findPlan, monthlyProfit, setMonthlyFreebies, type CalculatorPlan, type PnlInputs } from "@safehubby/core";
import { api } from "../api.ts";

const STORE = "sh_pnl_scenarios";
type Saved = Record<string, PnlInputs>;

const readSaved = (): Saved => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return v && typeof v === "object" ? (v as Saved) : {};
  } catch { return {}; }
};
const writeSaved = (s: Saved) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private window: scenarios just will not persist */ } };

const money = (cents: number) => `${cents < 0 ? "-" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Where the month's profit comes from and whether it covers what has to be paid.
 * Uses the live free-each-month settings so the answer matches what the app charges.
 */
export function ProfitCalculatorSection() {
  const [inputs, setInputs] = useState<PnlInputs>(defaultPnlInputs);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [name, setName] = useState("");

  useEffect(() => {
    api.masterFreebies().then((r) => setMonthlyFreebies(r.freebies)).catch(() => undefined).finally(() => setReady(true));
  }, []);

  const result = useMemo(() => monthlyProfit(inputs), [inputs, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof PnlInputs>(k: K, v: PnlInputs[K]) => setInputs((p) => ({ ...p, [k]: v }));
  const pct = (k: "usage" | "clubLightAttendance" | "clubBigAttendance", label: string) => (
    <label className="row-between small">{label}
      <input type="number" min={0} max={100} step={5} style={{ width: 80 }} value={Math.round(inputs[k] * 100)} onChange={(e) => set(k, num(e.target.value) / 100)} />
    </label>
  );
  const dollars = (k: "payrollCents" | "otherFixedCents" | "cashCents" | "keptPerErrandCents", label: string) => (
    <label className="row-between small">{label}
      <input type="number" min={0} step={k === "keptPerErrandCents" ? 0.25 : 50} style={{ width: 100 }} value={inputs[k] / 100} onChange={(e) => set(k, Math.round(num(e.target.value) * 100))} />
    </label>
  );
  const count = (k: "extraAssistantHours" | "paidErrands" | "clubMembers" | "insuredPeople" | "deskMinutes", label: string) => (
    <label className="row-between small">{label}
      <input type="number" min={0} step={1} style={{ width: 80 }} value={inputs[k]} onChange={(e) => set(k, num(e.target.value))} />
    </label>
  );

  const save = () => {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    const next = { ...saved, [n]: inputs };
    setSaved(next); writeSaved(next); setName("");
  };
  const remove = (n: string) => { const { [n]: _gone, ...rest } = saved; setSaved(rest); writeSaved(rest); };

  return (
    <section className="card stack" aria-label="Monthly profit calculator">
      <h3 style={{ margin: 0 }}>Monthly profit calculator</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Uses today's prices and your free-each-month settings. Usage and attendance are guesses: change them and watch the bottom line. A planning tool, not a forecast.
      </p>

      <strong className="tiny muted">Members</strong>
      {CALCULATOR_PLANS.map((p: CalculatorPlan) => (
        <label key={p} className="row-between small">{findPlan(p).name} ({money(findPlan(p).monthlyCents)}/mo)
          <input type="number" min={0} step={1} style={{ width: 80 }} value={inputs.members[p]}
            onChange={(e) => set("members", { ...inputs.members, [p]: num(e.target.value) })} />
        </label>
      ))}
      {count("clubMembers", "Wingman Club members ($99)")}
      {count("extraAssistantHours", "Extra assistant hours sold")}
      {count("paidErrands", "Errands with a fee")}
      {dollars("keptPerErrandCents", "Kept per errand ($)")}

      <strong className="tiny muted">Assumptions</strong>
      {pct("usage", "% of included hours & pickups used")}
      {count("deskMinutes", "Minutes per desk task")}
      {pct("clubLightAttendance", "% going to light outings")}
      {pct("clubBigAttendance", "% going to bigger days")}

      <strong className="tiny muted">Fixed costs per month</strong>
      {dollars("payrollCents", "Payroll ($)")}
      {count("insuredPeople", "People insured ($75 each)")}
      {dollars("otherFixedCents", "Hosting, tools, marketing ($)")}
      {dollars("cashCents", "Cash in the bank ($)")}

      <strong className="tiny muted">Where profit comes from</strong>
      {result.lines.length === 0 && <p className="tiny muted" style={{ margin: 0 }}>Add members above.</p>}
      {result.lines.map((l) => (
        <div key={l.id} className="stack" style={{ gap: 2 }}>
          <div className="row-between"><span className="small">{l.label}</span><strong>{money(l.profitCents)}</strong></div>
          <span className="tiny muted">{l.note}</span>
        </div>
      ))}
      <div className="row-between"><span className="small">Profit before fixed costs</span><strong>{money(result.grossProfitCents)}</strong></div>
      {result.fixed.map((f) => (
        <div key={f.id} className="row-between"><span className="small muted">− {f.label}</span><span>{money(f.cents)}</span></div>
      ))}
      <div className="row-between"><strong>Net per month</strong><strong style={{ color: result.netCents < 0 ? "#e5484d" : undefined }}>{money(result.netCents)}</strong></div>
      {result.netCents < 0 ? (
        <p className="tiny" style={{ margin: 0 }}>
          Short by {money(-result.netCents)} a month: about {result.premiumToBreakEven} more Premium members at {money(result.perMemberCents["premium-basic"])} each would cover it.
          {result.runwayMonths !== null && ` Your cash lasts about ${result.runwayMonths} months at this pace.`}
        </p>
      ) : (
        <p className="tiny muted" style={{ margin: 0 }}>Covers every fixed cost with {money(result.netCents)} to spare.</p>
      )}

      <div className="row-between" style={{ gap: 8 }}>
        <input aria-label="Scenario name" placeholder="Name this scenario" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-sm" disabled={!name.trim()} onClick={save}>Save</button>
      </div>
      {Object.keys(saved).map((n) => (
        <div key={n} className="row-between">
          <button className="btn btn-sm" onClick={() => setInputs({ ...defaultPnlInputs(), ...saved[n]!, members: { ...defaultPnlInputs().members, ...saved[n]!.members } })}>{n}</button>
          <button className="btn btn-sm" aria-label={`Delete ${n}`} onClick={() => remove(n)}>Delete</button>
        </div>
      ))}
    </section>
  );
}
