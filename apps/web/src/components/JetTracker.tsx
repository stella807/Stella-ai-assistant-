import { useEffect, useRef, useState, type FormEvent } from "react";
import { aircraftState, knotsToMph, normalizeTailNumber, type AircraftFix } from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage, type TranslationKey } from "../i18n.tsx";
import { LiveMap } from "./LiveMap.tsx";

type Result = Awaited<ReturnType<typeof api.aircraftTrack>>;

const REFRESH_MS = 20_000;
const SAVED_KEY = "sh_jet_tail";

const readSaved = () => { try { return localStorage.getItem(SAVED_KEY) ?? ""; } catch { return ""; } };
const save = (tail: string) => { try { localStorage.setItem(SAVED_KEY, tail); } catch { /* private mode: not remembered */ } };

/**
 * Follow a private jet by its tail number: where it is, how high, how fast,
 * refreshed while the screen is open. Charters themselves are booked by the
 * concierge through Jettly, which this card says plainly; the tracking works
 * for any aircraft that broadcasts its position, whoever booked it.
 */
export function JetTracker() {
  const { t, language } = useLanguage();
  const [input, setInput] = useState(readSaved);
  const [tail, setTail] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const load = async (which: string, quiet = false) => {
    const ticket = ++latest.current;
    if (!quiet) setBusy(true);
    try {
      const res = await api.aircraftTrack(which);
      if (ticket !== latest.current) return; // a newer lookup has started
      setResult(res);
      setError(null);
    } catch {
      if (ticket === latest.current && !quiet) setError(t("jet.error"));
    } finally {
      if (ticket === latest.current && !quiet) setBusy(false);
    }
  };

  // Refresh while it is on screen and the page is in front; a phone in a pocket does not poll.
  useEffect(() => {
    if (!tail) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(tail, true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [tail]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = normalizeTailNumber(input);
    if (!clean) { setError(t("jet.badTail")); setResult(null); setTail(null); return; }
    setInput(clean);
    save(clean);
    setTail(clean);
    setResult(null);
    void load(clean);
  };

  return (
    <section className="card stack jet-tracker">
      <h3>{t("jet.title")}</h3>
      <p className="small muted" style={{ margin: 0 }}>{t("jet.blurb")}</p>

      <form className="jet-form" onSubmit={submit}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor="jet-tail">{t("jet.tailLabel")}</label>
          <input id="jet-tail" value={input} placeholder="N123AB" autoComplete="off" autoCapitalize="characters"
            spellCheck={false} maxLength={12} onChange={(e) => setInput(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()}>
          {busy ? t("jet.tracking") : t("jet.track")}
        </button>
      </form>

      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {result && <JetStatus result={result} language={language} t={t} />}

      <p className="small" style={{ margin: 0 }}>
        {t("jet.charter")}{" "}
        <a href="https://jettly.com" target="_blank" rel="noopener noreferrer">Jettly</a>.
      </p>

      <details className="tiny muted">
        <summary>{t("jet.about")}</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>{t("jet.d1")}</li><li>{t("jet.d2")}</li><li>{t("jet.d3")}</li><li>{t("jet.d4")}</li>
        </ul>
      </details>
    </section>
  );
}

function JetStatus({ result, language, t: tr }: { result: Result; language: string; t: (k: TranslationKey) => string }) {
  const fix: AircraftFix | null = result.aircraft;
  const source = (
    <p className="tiny muted" style={{ margin: 0 }}>
      {tr("jet.source").replace("{name}", result.attribution.name).replace("{license}", result.attribution.license)}{" "}
      <a href={result.attribution.url} target="_blank" rel="noopener noreferrer">{result.attribution.url.replace(/^https?:\/\//, "")}</a>
    </p>
  );
  if (!fix) return <><p className="small" style={{ margin: 0 }}>{tr("jet.notHeard").replace("{tail}", result.tail)}</p>{source}</>;

  const state = aircraftState(fix);
  if (state === "private") return <><p className="small" style={{ margin: 0 }}>{tr("jet.private").replace("{tail}", fix.tailNumber)}</p>{source}</>;

  const n = (v: number) => v.toLocaleString(language === "es" ? "es-PR" : "en-US");
  const pos = fix.position;
  const label = state === "airborne" ? tr("jet.airborne")
    : state === "on-ground" ? tr("jet.onGround")
    : tr("jet.lastSeen").replace("{min}", String(Math.max(1, Math.round(fix.seenSecondsAgo / 60))));
  const stats: { label: string; value: string }[] = [];
  if (pos?.altitudeFt !== undefined && !fix.onGround) stats.push({ label: tr("jet.altitude"), value: `${n(pos.altitudeFt)} ft` });
  if (pos?.groundSpeedKts !== undefined) stats.push({ label: tr("jet.speed"), value: `${n(knotsToMph(pos.groundSpeedKts))} mph · ${n(Math.round(pos.groundSpeedKts))} kt` });
  if (pos?.headingDeg !== undefined) stats.push({ label: tr("jet.heading"), value: `${Math.round(pos.headingDeg)}°` });
  if (fix.verticalRateFpm !== undefined && !fix.onGround) stats.push({ label: tr("jet.climb"), value: `${fix.verticalRateFpm > 0 ? "+" : ""}${n(fix.verticalRateFpm)} ft/min` });
  if (fix.typeCode) stats.push({ label: tr("jet.type"), value: fix.typeCode });
  if (fix.callsign) stats.push({ label: tr("jet.callsign"), value: fix.callsign });

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-between">
        <strong>{fix.tailNumber}</strong>
        <span className={state === "airborne" ? "pill pill-safe" : "pill"}>{label}</span>
      </div>
      {fix.emergency && <div className="banner banner-danger" role="alert">{tr("jet.emergency")} ({fix.emergency})</div>}
      {pos && (
        <LiveMap height={240} zoom={fix.onGround ? 12 : 7} follow
          points={[{ lat: pos.lat, lng: pos.lng, label: fix.tailNumber, icon: "plane", headingDeg: pos.headingDeg ?? 0 }]} />
      )}
      {stats.length > 0 && (
        <div className="jet-stats">
          {stats.map((s) => <div key={s.label} className="jet-stat"><span className="tiny muted">{s.label}</span><strong>{s.value}</strong></div>)}
        </div>
      )}
      <p className="tiny muted" style={{ margin: 0 }}>{tr("jet.refresh")}</p>
      {source}
    </div>
  );
}
