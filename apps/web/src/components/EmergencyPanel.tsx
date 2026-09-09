import { useEffect, useState } from "react";
import { api, type Assessment, type EmergencyNumber, type RedFlag } from "../api.ts";

/**
 * Medical escalation.
 *
 * Explicitly not a ride option. Safehubby cannot dispatch an ambulance and does
 * not pretend to: a rideshare has no oxygen, no airway training and no
 * authority to treat, and the minutes lost waiting for one are the harm. What
 * this does instead is help someone recognise an emergency, reach a dispatcher,
 * and have something useful to say when they do.
 */
export function EmergencyPanel({ nightId, prompted }: { nightId: string; prompted: boolean }) {
  const [open, setOpen] = useState(prompted);
  const [flags, setFlags] = useState<RedFlag[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [emergency, setEmergency] = useState<EmergencyNumber | null>(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [result, setResult] = useState<{ assessment: Assessment; script: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  // Region comes from the device: an app that hardcodes 911 is useless, or
  // actively misleading, everywhere else.
  const region = (Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1] ?? "US").toUpperCase();

  useEffect(() => {
    api.emergencyInfo(region)
      .then((r) => { setFlags(r.redFlags); setEmergency(r.emergency); setDisclaimer(r.notAnAmbulanceService); })
      .catch(() => {});
  }, [region]);

  useEffect(() => { if (prompted) setOpen(true); }, [prompted]);

  const toggle = (id: string) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.assessEmergency(nightId, { flags: checked, region });
      setResult({ assessment: r.assessment, script: r.script });
      if (r.emergency) setEmergency(r.emergency);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-block btn-ghost" onClick={() => setOpen(true)}>
        Someone doesn&apos;t look right
      </button>
    );
  }

  const critical = result?.assessment.escalation === "call-emergency";

  return (
    <section className={critical ? "card emergency-critical" : "card"} aria-label="Medical help">
      <div className="row-between">
        <h3 style={{ color: "var(--text)", fontSize: 17 }}>Is this an emergency?</h3>
        {!result && <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>Close</button>}
      </div>

      {prompted && !result && (
        <div className="banner banner-danger">
          The estimate is in the danger range. Check the list — it takes ten seconds.
        </div>
      )}

      {!result ? (
        <>
          <p className="small muted">Tick anything that&apos;s true right now.</p>
          <ul className="flags">
            {flags.map((f) => (
              <li key={f.id}>
                <label>
                  <input type="checkbox" checked={checked.includes(f.id)} onChange={() => toggle(f.id)} />
                  <span>
                    <strong className="small">{f.label}</strong>
                    <span className="tiny muted">{f.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={run}>
            {checked.length ? "Check these symptoms" : "Nothing on this list"}
          </button>
        </>
      ) : (
        <>
          <h2 className={critical ? "danger-headline" : undefined}>{result.assessment.headline}</h2>

          {critical && emergency && (
            <a className="btn btn-danger btn-block call" href={`tel:${emergency.number}`}>
              Call {emergency.number} now
            </a>
          )}

          <ol className="steps">
            {result.assessment.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>

          {critical && result.script.length > 0 && (
            <>
              <h3>Say this to the dispatcher</h3>
              <ul className="script">
                {result.script.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          )}

          {!critical && emergency?.poisonControl && (
            <a className="btn btn-block" href={`tel:${emergency.poisonControl}`}>
              Not sure? Call poison control on {emergency.poisonControl}
            </a>
          )}

          <button className="btn btn-block btn-ghost" onClick={() => { setResult(null); setChecked([]); }}>
            Check again
          </button>
        </>
      )}

      {!emergency && (
        <div className="banner banner-danger">
          Safehubby doesn&apos;t know the emergency number where you are. Look it up now, before you need it.
        </div>
      )}

      <p className="tiny muted">{disclaimer}</p>
    </section>
  );
}
