import { useCallback, useEffect, useState } from "react";
import type { DrinkDefinition, RecoveryPlan, ShareGrant, Venue } from "@safehubby/core";
import { api, type Account, type NightSummary } from "../api.ts";
import { BacCard } from "./BacCard.tsx";
import { CheckInPrompt } from "./CheckInPrompt.tsx";
import { DrinkLogger } from "./DrinkLogger.tsx";
import { GetHomePanel } from "./GetHomePanel.tsx";
import { SharingPanel } from "./SharingPanel.tsx";
import { SosButton } from "./SosButton.tsx";
import { CrewPanel } from "./CrewPanel.tsx";
import { PharmacyPanel } from "./PharmacyPanel.tsx";
import { EmergencyPanel } from "./EmergencyPanel.tsx";
import { currentFix, requestPermission, watchLocation, type StopWatching } from "../native/location.ts";
import { cancelCheckInReminder, requestNotifications, scheduleCheckInReminder } from "../native/notify.ts";

export function TravelerScreen({ drinks, account }: { drinks: DrinkDefinition[]; account: Account }) {
  const TRAVELER_ID = account.id;
  const HOME_LABEL = account.homeLabel || "Home";

  const [summary, setSummary] = useState<NightSummary | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [recovery, setRecovery] = useState<RecoveryPlan | null>(null);
  const [points, setPoints] = useState(0);
  const [weightKg, setWeightKg] = useState(82);
  const [drinkLimit, setDrinkLimit] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sos, setSos] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<"unknown" | "granted" | "denied" | "unavailable">("unknown");

  const refreshTraveler = useCallback(async () => {
    const t = await api.traveler(TRAVELER_ID);
    setPoints(t.points.balance);
    setGrants(t.grants);
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    api.venues(40.714, -74.003).then(setVenues).catch(() => setVenues([]));
    refreshTraveler().catch(() => {});
    // Pick up a night already in progress, so a reload does not offer to start
    // a second one on top of it.
    api.currentNight()
      .then((res) => { if ("night" in res && res.night) setSummary(res as NightSummary); })
      .catch(() => {});
  }, [refreshTraveler]);

  /**
   * Real device location, once a night is running. Sharing a stale fix is worse
   * than sharing none — someone reads it as where they are now — so the watch
   * runs for the life of the night and stops the moment it ends.
   */
  useEffect(() => {
    if (!summary || summary.night.status === "home-safe" || summary.night.status === "ended") return;
    const nightId = summary.night.id;
    let stop: StopWatching | null = null;
    let cancelled = false;

    (async () => {
      const permission = await requestPermission();
      setLocationState(permission);
      if (permission !== "granted") return;

      const first = await currentFix();
      if (first && !cancelled) await api.ping(nightId, first.lat, first.lng).catch(() => {});

      stop = await watchLocation((fix) => {
        api.ping(nightId, fix.lat, fix.lng).catch(() => {});
      });
      if (cancelled) stop();
    })();

    return () => { cancelled = true; stop?.(); };
  }, [summary?.night.id, summary?.night.status]);

  /** A reminder that fires with no signal, which is where a miss matters most. */
  useEffect(() => {
    const pending = summary?.pendingCheckIn;
    if (!pending) { void cancelCheckInReminder(); return; }
    void requestNotifications().then((ok) => { if (ok) void scheduleCheckInReminder(pending.dueAt); });
  }, [summary?.pendingCheckIn?.id, summary?.pendingCheckIn?.dueAt]);

  // Poll so alerts and missed check-ins surface without a manual refresh.
  useEffect(() => {
    if (!summary || summary.night.status === "ended") return;
    const id = setInterval(() => {
      api.night(summary.night.id).then(setSummary).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [summary?.night.id, summary?.night.status]);

  if (!summary) {
    return (
      <div className="stack">
        <CrewPanel travelerId={TRAVELER_ID} />
        <section className="card stack">
          <h2>Heading out tonight?</h2>
          <p className="small muted">
            Start a night and Safehubby will check in on you, keep a log, and make getting home the easy option.
          </p>

          <div className="field">
            <label htmlFor="weight">Your weight (kg)</label>
            <input id="weight" type="number" inputMode="numeric" value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))} />
          </div>

          <div className="field">
            <label htmlFor="limit">Drink limit you both agreed on</label>
            <input id="limit" type="number" inputMode="numeric" value={drinkLimit}
              onChange={(e) => setDrinkLimit(Number(e.target.value))} />
          </div>

          <button className="btn btn-primary btn-block" disabled={busy || !(weightKg > 0)}
            onClick={() => run(async () => {
              setSummary(await api.startNight({ weightKg, drinkLimit, homeAddressLabel: HOME_LABEL }));
            })}>
            Start the night
          </button>

          {error && <div className="banner banner-danger">{error}</div>}
          <p className="tiny muted">
            Weight is used for a rough alcohol estimate. It stays on your account and is never sold or shared with advertisers.
          </p>
        </section>
      </div>
    );
  }

  const { night, bac, stats, pendingCheckIn, alerts } = summary;
  const ended = night.status === "home-safe" || night.status === "ended";

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h2>{ended ? "Home safe" : "Out tonight"}</h2>
          <p className="tiny muted">
            {stats.alcoholicDrinks} drinks · {stats.standardDrinks} standard · {stats.calories} cal · {points} pts
          </p>
        </div>
        <span className={ended ? "pill pill-safe" : "pill"}>{night.status}</span>
      </div>

      {locationState === "denied" && (
        <div className="banner">
          Location is off, so nobody can see where you are — check-ins and SOS still work, but an alert
          will not carry a place. Turn it on in Settings if you want that.
        </div>
      )}

      {alerts.filter((a) => a.severity !== "info").slice(-3).map((a) => (
        <div key={a.id} className={`alert alert-${a.severity}`}>
          <p className="small">{a.message}</p>
        </div>
      ))}

      {!ended && <CheckInPrompt checkIn={pendingCheckIn} busy={busy}
        onAnswer={(rating) => run(async () => {
          setSummary(await api.answerCheckIn(night.id, pendingCheckIn!.id, rating));
          await refreshTraveler();
        })} />}

      <BacCard bac={bac} />

      {!ended && (
        <DrinkLogger drinks={drinks} venues={venues} busy={busy}
          onLog={(drinkId, venueName) => run(async () => {
            setSummary(await api.logDrink(night.id, drinkId, venueName));
            await refreshTraveler();
          })} />
      )}

      <CrewPanel travelerId={TRAVELER_ID} refreshKey={night.drinks.length} />

      {!ended && (
        <PharmacyPanel
          nightId={night.id}
          state={summary.carePackage}
          homeLabel={HOME_LABEL}
          band={bac.band}
          onChange={(carePackage) => setSummary({ ...summary, carePackage })}
        />
      )}

      {/* Sits directly above the SOS: the two things you reach for when it has
          gone wrong, in escalation order. */}
      {!ended && <EmergencyPanel nightId={night.id} prompted={summary.promptEmergencyCheck} />}

      {!ended && <SosButton onSend={(silent) => run(async () => {
        await api.sos(night.id, silent);
        setSos(silent ? "Silent SOS sent with your location." : "SOS sent with your location.");
      })} />}
      {sos && <div className="banner banner-danger">{sos}</div>}

      {!ended && <GetHomePanel pickup={summary.lastPing} homeLabel={HOME_LABEL} />}

      <SharingPanel grants={grants} busy={busy}
        onShare={() => run(async () => {
          await api.grant(["location", "drinks", "check-ins"], 8);
          await refreshTraveler();
        })}
        onRevoke={(id) => run(async () => {
          await api.revokeGrant(id);
          await refreshTraveler();
        })} />

      <section className="card stack">
        <h3>Take care of yourself</h3>
        {recovery ? (
          <>
            <p className="small">{recovery.soberEstimate}</p>
            <ul className="timeline">
              {recovery.tips.map((t) => (
                <li key={t.id}>
                  <div>
                    <strong className="small">{t.title}</strong>
                    <div className="tiny muted">{t.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
            <h3>Things that do not work</h3>
            <ul className="timeline">
              {recovery.myths.map((m) => <li key={m}><span className="tiny muted">{m}</span></li>)}
            </ul>
          </>
        ) : (
          <button className="btn btn-block" disabled={busy}
            onClick={() => run(async () => setRecovery(await api.recovery(night.id)))}>
            Show my plan
          </button>
        )}
      </section>

      {!ended && (
        <div className="row">
          <button className="btn grow" disabled={busy}
            onClick={() => run(async () => setSummary(await api.setStatus(night.id, "heading-home")))}>
            Heading home
          </button>
          <button className="btn btn-safe grow" disabled={busy}
            onClick={() => run(async () => {
              setSummary(await api.setStatus(night.id, "home-safe"));
              await refreshTraveler();
            })}>
            I'm home
          </button>
        </div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
