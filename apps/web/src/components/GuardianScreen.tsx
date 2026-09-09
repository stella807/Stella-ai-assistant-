import { useEffect, useState } from "react";
import { api, type WatchView } from "../api.ts";

/**
 * The watching side. It shows only what the current grant allows, and says so
 * plainly when sharing is off — an empty map must never read as "he's fine".
 */
export function GuardianScreen() {
  const [grantId, setGrantId] = useState("");
  const [view, setView] = useState<WatchView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!view) return;
    const id = setInterval(() => {
      api.watch(view.grant.id).then(setView).catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [view?.grant.id]);

  const load = async (id: string) => {
    setError(null);
    try { setView(await api.watch(id.trim())); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load"); }
  };

  if (!view) {
    return (
      <section className="card stack">
        <h2>Watching someone tonight</h2>
        <p className="small muted">
          Paste the watch link id they shared with you. They can see that you are watching, and they can stop
          sharing at any time.
        </p>
        <div className="field">
          <label htmlFor="grant">Watch link id</label>
          <input id="grant" value={grantId} placeholder="grant_…" onChange={(e) => setGrantId(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={!grantId.trim()} onClick={() => load(grantId)}>
          Start watching
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </section>
    );
  }

  const { night, stats, alerts, bac, lastPing, sharingActive, traveler } = view;
  const urgent = alerts.filter((a) => a.severity === "urgent");
  const warnings = alerts.filter((a) => a.severity === "warn");

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h2>{traveler?.displayName ?? "Watching"}</h2>
          <p className="tiny muted">Started {new Date(night.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
        </div>
        <span className={night.status === "home-safe" ? "pill pill-safe" : "pill"}>{night.status}</span>
      </div>

      {!sharingActive && (
        <div className="banner">
          Sharing is off right now — either it expired or they turned it off. What you see below is the last
          thing shared, not where they are now.
        </div>
      )}

      {urgent.map((a) => <div key={a.id} className="alert alert-urgent"><p className="small">{a.message}</p></div>)}
      {warnings.slice(-3).map((a) => <div key={a.id} className="alert alert-warn"><p className="small">{a.message}</p></div>)}
      {urgent.length === 0 && warnings.length === 0 && (
        <div className="banner banner-safe">Nothing to worry about right now. Check-ins are being answered.</div>
      )}

      <section className="card stack">
        <h3>Tonight</h3>
        <div className="row wrap">
          <Stat label="Drinks" value={`${stats.alcoholicDrinks} / ${night.drinkLimit}`} />
          <Stat label="Standard" value={String(stats.standardDrinks)} />
          <Stat label="Missed check-ins" value={String(stats.missedCheckIns)} />
        </div>
        {bac && (
          <p className="small muted">
            Estimated {bac.low.toFixed(3)}–{bac.high.toFixed(3)} %BAC. This is a rough estimate from a typed log,
            not a breathalyzer. Whatever it says, they should not drive.
          </p>
        )}
      </section>

      {night.drinks.length > 0 && (
        <section className="card stack">
          <h3>Drink timeline</h3>
          <ul className="timeline">
            {night.drinks.map((d) => (
              <li key={d.id}>
                <time>{new Date(d.loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                <div className="grow">
                  <span className="small">{d.name}</span>
                  {d.venueName && <span className="tiny muted"> · {d.venueName}</span>}
                </div>
                <span className="tiny muted">{d.standardDrinks.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h3>Last known location</h3>
        {lastPing ? (
          <>
            <p className="small">{lastPing.venueName ?? "Shared location"}</p>
            <p className="tiny muted">
              {lastPing.lat.toFixed(4)}, {lastPing.lng.toFixed(4)} · ±{lastPing.accuracyMeters}m ·{" "}
              {new Date(lastPing.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          </>
        ) : (
          <p className="small muted">No location shared.</p>
        )}
      </section>

      <button className="btn btn-block btn-ghost" onClick={() => setView(null)}>Stop watching</button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grow">
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div className="tiny muted">{label}</div>
    </div>
  );
}
