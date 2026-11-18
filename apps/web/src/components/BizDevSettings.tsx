import { useState } from "react";
import type { BizAuditEntry, BizSettings, BizSuppression } from "@safehubby/core";
import { api } from "../api.ts";

/** The do-not-contact list, the owner's assumptions and the sending limits, and the record of every change. */
export function BizDevSettings({ settings, suppressions, audit, onSettings, onSuppressions }: {
  settings: BizSettings; suppressions: BizSuppression[]; audit: BizAuditEntry[];
  onSettings: (s: BizSettings) => void; onSuppressions: (s: BizSuppression[]) => void;
}) {
  const [optOut, setOptOut] = useState({ value: "", reason: "" });
  const [s, setS] = useState({
    askUsd: String(settings.askUsd), launchMinUsd: String(settings.launchMinUsd), launchMaxUsd: String(settings.launchMaxUsd),
    minDaysBetween: String(settings.minDaysBetween), maxFollowUps: String(settings.maxFollowUps),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That did not save"); }
  };

  const save = (change: Partial<Record<keyof BizSettings, unknown>>) => run(async () => {
    const { settings: next } = await api.bizSaveSettings(change as Partial<BizSettings>);
    onSettings(next);
    setS({
      askUsd: String(next.askUsd), launchMinUsd: String(next.launchMinUsd), launchMaxUsd: String(next.launchMaxUsd),
      minDaysBetween: String(next.minDaysBetween), maxFollowUps: String(next.maxFollowUps),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });

  return (
    <div className="stack" style={{ gap: 12 }}>
      <details className="card card-quiet" style={{ padding: "10px 14px" }}>
        <summary className="small"><strong>Do-not-contact list ({suppressions.length})</strong></summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <p className="tiny muted" style={{ margin: 0 }}>
            Anyone who says no, or asks not to be contacted, goes here. Nothing can be drafted for them or recorded as sent to them.
            Add a whole domain (example.com) to cover everyone at a company.
          </p>
          <div className="field"><label htmlFor="bo-value">Email or domain</label>
            <input id="bo-value" value={optOut.value} onChange={(e) => setOptOut({ ...optOut, value: e.target.value })} /></div>
          <div className="field"><label htmlFor="bo-reason">Why (optional)</label>
            <input id="bo-reason" value={optOut.reason} maxLength={200} onChange={(e) => setOptOut({ ...optOut, reason: e.target.value })} /></div>
          <button className="btn btn-sm" disabled={!optOut.value.trim()} onClick={() => void run(async () => {
            const { suppression } = await api.bizAddSuppression(optOut.value, optOut.reason || undefined);
            onSuppressions([...suppressions, suppression]);
            setOptOut({ value: "", reason: "" });
          })}>Add to the list</button>
          {suppressions.map((x) => (
            <div key={x.id ?? x.value} className="row-between tiny">
              <span>{x.value}{x.reason ? ` · ${x.reason}` : ""}</span>
              {x.id && <button className="btn btn-sm btn-ghost" onClick={() => void run(async () => {
                await api.bizRemoveSuppression(x.id!);
                onSuppressions(suppressions.filter((y) => y.id !== x.id));
              })}>Remove</button>}
            </div>
          ))}
        </div>
      </details>

      <details className="card card-quiet" style={{ padding: "10px 14px" }}>
        <summary className="small"><strong>Settings</strong></summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          <label className="row small" style={{ gap: 8, alignItems: "flex-start", textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={settings.securitiesReviewed} onChange={(e) => void save({ securitiesReviewed: e.target.checked })} />
            <span>
              A securities lawyer has reviewed how I approach investors.
              <span className="tiny muted" style={{ display: "block" }}>
                Until this is on, messages to investors can be drafted and approved, but not recorded as sent. Asking people to invest
                is regulated. Turn this on only after a lawyer has said how you may do it.
              </span>
            </span>
          </label>
          <div className="field"><label htmlFor="bz-ask">Full amount in the proposal (USD)</label>
            <input id="bz-ask" inputMode="numeric" value={s.askUsd} onChange={(e) => setS({ ...s, askUsd: e.target.value })} /></div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field grow"><label htmlFor="bz-lmin">Smaller launch, from</label>
              <input id="bz-lmin" inputMode="numeric" value={s.launchMinUsd} onChange={(e) => setS({ ...s, launchMinUsd: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="bz-lmax">to</label>
              <input id="bz-lmax" inputMode="numeric" value={s.launchMaxUsd} onChange={(e) => setS({ ...s, launchMaxUsd: e.target.value })} /></div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="field grow"><label htmlFor="bz-days">Days between messages (5 or more)</label>
              <input id="bz-days" inputMode="numeric" value={s.minDaysBetween} onChange={(e) => setS({ ...s, minDaysBetween: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="bz-fu">Follow-ups (2 at most)</label>
              <input id="bz-fu" inputMode="numeric" value={s.maxFollowUps} onChange={(e) => setS({ ...s, maxFollowUps: e.target.value })} /></div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => void save(s)}>{saved ? "Saved" : "Save settings"}</button>
        </div>
      </details>

      <details className="card card-quiet" style={{ padding: "10px 14px" }}>
        <summary className="small"><strong>Activity log</strong></summary>
        <ul className="timeline tiny" style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
          {audit.length === 0 && <li className="muted">Nothing yet.</li>}
          {audit.slice(0, 40).map((a) => (
            <li key={a.id}><span className="muted">{new Date(a.at).toLocaleString()}</span> · {a.action} · {a.detail}</li>
          ))}
        </ul>
      </details>
      {error && <p className="tiny" role="alert">{error}</p>}
    </div>
  );
}
