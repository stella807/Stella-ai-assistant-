import { useEffect, useMemo, useState } from "react";
import { CALCULATOR_PLANS, ERRAND_TIERS, defaultPnlInputs, findPlan, monthlyProfit, setMonthlyFreebies, type CalculatorPlan, type ErrandTierId, type PnlInputs } from "@safehubby/core";
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
    // Start from the driver pay you have set in Pricing Controls, so the calculator follows the app: the flat pay
    // when there are no per-mile or per-minute amounts, otherwise a typical 5-mile, 15-minute trip. You can still type over it.
    api.masterGetPricing().then((p) => {
      const d = p?.current?.driverStandard as { baseCents: number; perMileCents: number; perMinuteCents: number } | undefined;
      if (d && Number.isFinite(d.baseCents)) {
        const pay = Math.round(d.baseCents + d.perMileCents * 5 + d.perMinuteCents * 15);
        setInputs((i) => ({ ...i, driverPayPerTripCents: pay }));
      }
    }).catch(() => undefined);
  }, []);

  const result = useMemo(() => monthlyProfit(inputs), [inputs, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof PnlInputs>(k: K, v: PnlInputs[K]) => setInputs((p) => ({ ...p, [k]: v }));
  const pct = (k: "usage" | "clubLightAttendance" | "clubBigAttendance", label: string) => (
    <label className="row-between small">{label}
      <input type="number" min={0} max={100} step={5} style={{ width: 80 }} value={Math.round(inputs[k] * 100)} onChange={(e) => set(k, num(e.target.value) / 100)} />
    </label>
  );
  const dollars = (k: "payrollCents" | "otherFixedCents" | "cashCents" | "errandCapCents" | "driverFareCents" | "driverPayPerTripCents" | "armedRateCents" | "armedPayCents", label: string) => (
    <label className="row-between small">{label}
      <input type="number" min={0} step={k === "errandCapCents" || k === "driverFareCents" || k === "driverPayPerTripCents" || k === "armedRateCents" || k === "armedPayCents" ? 1 : 50} style={{ width: 100 }} value={inputs[k] / 100} onChange={(e) => set(k, Math.round(num(e.target.value) * 100))} />
    </label>
  );
  const count = (k: "extraAssistantHours" | "paidErrands" | "hospitalDays" | "armedHours" | "driverTrips" | "assistantCount" | "hoursPerAssistant" | "clubMembers" | "insuredPeople" | "deskMinutes", label: string) => (
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
      {count("assistantCount", "Personal assistants you have")}
      {count("hoursPerAssistant", "Hours each can work per month")}
      {count("clubMembers", "Wingman Club members ($99)")}
      {count("extraAssistantHours", "Extra assistant hours sold")}
      {count("hospitalDays", "Hospital caretaker days")}
      {count("armedHours", "Armed bodyguard hours")}
      {dollars("armedRateCents", "Client pays per armed hour ($)")}
      {dollars("armedPayCents", "Bodyguard is paid per hour ($)")}
      {count("paidErrands", "Errands with a fee")}
      {count("driverTrips", "Trips by your own drivers")}
      {dollars("driverPayPerTripCents", "Pay per trip to the driver ($)")}
      {dollars("driverFareCents", "What a client pays per trip ($, 0 if not set)")}
      <label className="row-between small">Typical errand size
        <select value={inputs.errandTier} style={{ width: 150 }} onChange={(e) => set("errandTier", e.target.value as ErrandTierId)}>
          {ERRAND_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      {dollars("errandCapCents", "Typical purchase per errand ($)")}

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

      <div className="card stack" style={{ gap: 4, background: "rgba(0,0,0,0.03)" }} aria-label="What you keep">
        <div className="row-between"><strong>What you keep each month</strong>
          <strong style={{ color: result.netCents < 0 ? "#e5484d" : undefined }}>{money(result.netCents)}</strong></div>
        <span className="tiny muted">
          After paying every assistant and errand runner, Stripe's fees and your fixed costs below. That is your profit, and what you can pay yourself.
        </span>
        <div className="row-between tiny"><span className="muted">Paid to assistants and caretakers</span><span>{money(result.payouts.assistantsCents)}</span></div>
        <div className="row-between tiny"><span className="muted">Paid to errand runners</span><span>{money(result.payouts.runnersCents)}</span></div>
        {result.payouts.driversCents > 0 && <div className="row-between tiny"><span className="muted">Paid to drivers</span><span>{money(result.payouts.driversCents)}</span></div>}
        <div className="row-between tiny"><span className="muted">Stripe fees and task cards</span><span>{money(result.payouts.cardFeesCents)}</span></div>
      </div>

      <div className="card stack" style={{ gap: 4, background: "rgba(0,0,0,0.03)" }} aria-label="Assistant hours">
        <strong className="small">Assistant hours this month</strong>
        <span className="tiny muted">
          What your members' plans call for, at the share used you entered, plus desk tasks and any extra hours sold. Each plan counts its own included hours. Assistants are paid $35 for each hour worked.
        </span>
        <div className="row-between tiny"><span className="muted">Hours the work needs</span><span>{result.assistants.neededHours.toLocaleString("en-US")}</span></div>
        <div className="row-between tiny"><span className="muted">Hours your {result.assistants.count} {result.assistants.count === 1 ? "assistant" : "assistants"} can work</span><span>{result.assistants.availableHours.toLocaleString("en-US")}</span></div>
        {result.assistants.count > 0 && (
          <div className="row-between tiny"><span className="muted">Share of their time used</span>
            <span style={{ color: result.assistants.utilization > 1 ? "#e5484d" : undefined }}>{Math.round(result.assistants.utilization * 100)}%</span></div>
        )}
        <div className="row-between tiny"><span className="muted">Assistants the work needs</span><span>{result.assistants.neededCount}</span></div>
        {result.assistants.count > 0 && (
          <div className="row-between tiny"><span className="muted">Each of yours earns about</span><span>{money(result.assistants.payEachCents)} a month</span></div>
        )}
        {result.assistants.count > 0 && result.assistants.neededCount > result.assistants.count && (
          <span className="tiny" style={{ color: "#e5484d" }}>You are short about {result.assistants.neededCount - result.assistants.count} {result.assistants.neededCount - result.assistants.count === 1 ? "assistant" : "assistants"} at this level of use.</span>
        )}
      </div>

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
