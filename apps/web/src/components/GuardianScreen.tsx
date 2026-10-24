import { useEffect, useState } from "react";
import { describeFixAge, isFixStale } from "@safehubby/core";
import { api, type WatchView } from "../api.ts";
import { PushArmPanel } from "./PushArmPanel.tsx";
import { ShareCard } from "./ShareCard.tsx";
import { useLanguage } from "../i18n.tsx";
import { watchWords } from "../app/watch-copy.ts";
import { localized } from "../app/server-es.ts";
import { timeOf } from "../app/dates.ts";

/**
 * The watching side. It shows only what the current grant allows, and says so
 * plainly when sharing is off — an empty map must never read as "he's fine".
 */
export function GuardianScreen() {
  const { language } = useLanguage();
  const w = watchWords(language);
  const [inviteCode, setInviteCode] = useState("");
  const [view, setView] = useState<WatchView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);

  /**
   * Polling that says when it stopped working.
   *
   * Swallowing the failure froze this screen on its last good read, and a
   * stale view of someone's night reads exactly like a current one — the same
   * failure this component's own rule warns about, arriving by a different
   * door. Counting from the first failure is what lets the UI say how old
   * what you are looking at actually is.
   */
  useEffect(() => {
    if (!view) return;
    const id = setInterval(() => {
      api.watch(view.grant.id)
        .then((fresh) => { setView(fresh); setStaleSince(null); })
        .catch(() => setStaleSince((since) => since ?? Date.now()));
    }, 10_000);
    return () => clearInterval(id);
  }, [view?.grant.id]);

  /**
   * The code binds the grant to this account once, then the grant id is what we
   * poll. A code that has already been claimed by someone else is refused, so a
   * shared code cannot quietly add a second watcher.
   */
  const claim = async (code: string) => {
    setError(null);
    try {
      const grant = await api.claimGrant(code.trim().toUpperCase());
      setView(await api.watch(grant.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : w.claimFailed);
    }
  };

  if (!view) {
    return (
      <div className="stack">
      <section className="card stack">
        <h2>{w.title}</h2>
        <p className="small muted">{w.intro}</p>
        <div className="field">
          <label htmlFor="code">{w.code}</label>
          <input id="code" value={inviteCode} placeholder="ABC-234" autoCapitalize="characters"
            onChange={(e) => setInviteCode(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={!inviteCode.trim()} onClick={() => claim(inviteCode)}>
          {w.start}
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </section>

      {/* The one screen where not having a friend on the app is the actual
          blocker, so the invite belongs here and not only in Account. The
          referral code below is a different code from the invite code above —
          that one is read out by the person being watched, for one night; this
          one is yours permanently. Hence the two distinct labels. */}
      <ShareCard />
      </div>
    );
  }

  const { night, stats, alerts, bac, lastPing, sharingActive, traveler } = view;
  const urgent = alerts.filter((a) => a.severity === "urgent");
  const warnings = alerts.filter((a) => a.severity === "warn");

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h2>{traveler?.displayName ?? w.watching}</h2>
          <p className="tiny muted">{w.started(timeOf(night.startedAt, language))}</p>
        </div>
        <span className={night.status === "home-safe" ? "pill pill-safe" : "pill"}>{w.status[night.status] ?? night.status}</span>
      </div>

      {staleSince !== null && (
        <div className="banner banner-danger" role="alert">
          <strong>{w.unreachable}</strong> {w.staleBody(Math.max(1, Math.round((Date.now() - staleSince) / 60_000)))}
        </div>
      )}

      {!sharingActive && (
        <div className="banner">{w.sharingOff}</div>
      )}

      <PushArmPanel />

      {/* Assertive: an SOS interrupts whatever a screen reader was saying.
          Warnings are polite — they wait for a pause rather than talking over. */}
      <div aria-live="assertive">
        {urgent.map((a) => <div key={a.id} className="alert alert-urgent"><p className="small">{a.message}</p></div>)}
      </div>
      <div aria-live="polite">
        {warnings.slice(-3).map((a) => <div key={a.id} className="alert alert-warn"><p className="small">{a.message}</p></div>)}
      </div>
      {urgent.length === 0 && warnings.length === 0 && (
        <div className="banner banner-safe">{w.allClear}</div>
      )}

      <section className="card stack">
        <h3>{w.tonight}</h3>
        <div className="row wrap">
          <Stat label={w.drinks} value={`${stats.alcoholicDrinks} / ${night.drinkLimit}`} />
          <Stat label={w.standard} value={String(stats.standardDrinks)} />
          <Stat label={w.missed} value={String(stats.missedCheckIns)} />
        </div>
        {bac && <p className="small muted">{w.bac(bac.low.toFixed(3), bac.high.toFixed(3))}</p>}
      </section>

      {night.drinks.length > 0 && (
        <section className="card stack">
          <h3>{w.timeline}</h3>
          <ul className="timeline">
            {night.drinks.map((d) => (
              <li key={d.id}>
                <time>{timeOf(d.loggedAt, language)}</time>
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
        <h3>{w.lastLocation}</h3>
        {lastPing ? (
          <>
            <div className="row-between">
              <p className="small">{lastPing.venueName ?? w.sharedLocation}</p>
              {/* Age first, and loud when it is old. A clock time reads like a
                  location; "3 hours ago" reads like what it actually is. */}
              <span className={isFixStale(lastPing.at, new Date()) ? "pill pill-warn" : "pill"}>
                {localized(describeFixAge(lastPing.at, new Date()), language)}
              </span>
            </div>
            {isFixStale(lastPing.at, new Date()) && night.status !== "home-safe" && (
              <p className="small">{w.wereNotAre[0]}<strong>{w.wereNotAre[1]}</strong>{w.wereNotAre[2]}</p>
            )}
            <p className="tiny muted">
              {lastPing.lat.toFixed(4)}, {lastPing.lng.toFixed(4)} · ±{lastPing.accuracyMeters}m ·{" "}
              {timeOf(lastPing.at, language)}
            </p>
          </>
        ) : (
          <p className="small muted">{w.noLocation}</p>
        )}
      </section>

      <button className="btn btn-block btn-ghost" onClick={() => setView(null)}>{w.stop}</button>
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
