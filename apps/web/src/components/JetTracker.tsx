import { useEffect, useRef, useState, type FormEvent } from "react";
import { aircraftState, normalizeTailNumber, type AircraftFix } from "@safehubby/core";
import { api } from "../api.ts";
import { useLanguage, type TranslationKey } from "../i18n.tsx";
import { JetMap } from "./JetMap.tsx";

type Result = Awaited<ReturnType<typeof api.aircraftTrack>>;
type SharedFlight = Awaited<ReturnType<typeof api.myFlights>>["flights"][number];

/** "Thu, Nov 12, 3:40 PM" in the reader's own time zone. */
const whenLabel = (iso: string, language: string) =>
  new Date(iso).toLocaleString(language === "es" ? "es-PR" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

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
  const [receivedAt, setReceivedAt] = useState(0);
  /** Where the jet has been seen while this screen has watched it, oldest first. */
  const [trail, setTrail] = useState<{ lat: number; lng: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Flights the client's assistant has put on this map, newest first. */
  const [shared, setShared] = useState<SharedFlight[]>([]);
  const latest = useRef(0);

  const load = async (which: string, quiet = false) => {
    const ticket = ++latest.current;
    if (!quiet) setBusy(true);
    try {
      const res = await api.aircraftTrack(which);
      if (ticket !== latest.current) return; // a newer lookup has started
      setResult(res);
      setReceivedAt(Date.now());
      const p = res.aircraft?.position;
      if (p) setTrail((tr) => {
        const lastPoint = tr.at(-1);
        if (lastPoint && lastPoint.lat === p.lat && lastPoint.lng === p.lng) return tr;
        return [...tr, { lat: p.lat, lng: p.lng }].slice(-240);
      });
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

  const follow = (clean: string) => {
    setInput(clean);
    save(clean);
    setTail(clean);
    setResult(null);
    setTrail([]);
    void load(clean);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = normalizeTailNumber(input);
    if (!clean) { setError(t("jet.badTail")); setResult(null); setTail(null); return; }
    follow(clean);
  };

  // A flight the assistant booked is already on the map: start following the
  // newest one straight away, so the client never has to type a tail number.
  useEffect(() => {
    let cancelled = false;
    api.myFlights().then(({ flights }) => {
      if (cancelled) return;
      setShared(flights);
      if (flights[0]) follow(flights[0].tailNumber);
    }).catch(() => { /* no shared flights is the normal case */ });
    return () => { cancelled = true; };
  }, []);

  const current = shared.find((s) => s.tailNumber === tail);
  const route = current?.from && current?.to ? `${current.from} → ${current.to}` : undefined;

  return (
    <section className="card stack jet-tracker">
      <h3>{t("jet.title")}</h3>
      <p className="small muted" style={{ margin: 0 }}>{t("jet.blurb")}</p>

      {shared.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="tiny muted">{t("jet.shared")}</span>
          <div className="jet-shared">
            {shared.map((s) => (
              <button key={s.taskId} type="button" className={`jet-chip${s.tailNumber === tail ? " on" : ""}`}
                aria-pressed={s.tailNumber === tail} onClick={() => follow(s.tailNumber)}>
                <strong>{s.tailNumber}</strong>
                {s.from && s.to && <span>{s.from} → {s.to}</span>}
                {s.departsAt && <span>{t("jet.leaves").replace("{time}", whenLabel(s.departsAt, language))}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

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
      {result && <JetStatus result={result} language={language} t={t} trail={trail} receivedAt={receivedAt} route={route} />}

      <p className="small" style={{ margin: 0 }}>
        {t("jet.charter")}{" "}
        <a href="https://jettly.com" target="_blank" rel="noopener noreferrer">Jettly</a>.
      </p>

      <details className="tiny muted">
        <summary>{t("jet.about")}</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>{t("jet.d1")}</li><li>{t("jet.d5")}</li><li>{t("jet.d2")}</li><li>{t("jet.d3")}</li><li>{t("jet.d4")}</li>
        </ul>
      </details>
    </section>
  );
}

function JetStatus({ result, language, t: tr, trail, receivedAt, route }: {
  result: Result; language: string; t: (k: TranslationKey) => string; trail: { lat: number; lng: number }[]; receivedAt: number;
  /** "SJU → TEB", when the assistant who shared this flight said where it goes. */
  route?: string;
}) {
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

  const label = state === "airborne" ? tr("jet.airborne")
    : state === "on-ground" ? tr("jet.onGround")
    : tr("jet.lastSeen").replace("{min}", String(Math.max(1, Math.round(fix.seenSecondsAgo / 60))));
  const locale = language === "es" ? "es-PR" : "en-US";

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row-between">
        <strong>{fix.tailNumber}</strong>
        <span className={state === "airborne" ? "pill pill-safe" : "pill"}>{label}</span>
      </div>
      {fix.emergency && <div className="banner banner-danger" role="alert">{tr("jet.emergency")} ({fix.emergency})</div>}
      {fix.position && (
        <JetMap fix={fix} trail={trail} receivedAt={receivedAt} language={locale} route={route}
          labels={{
            altitude: tr("jet.altitude"), speed: tr("jet.speed"), heading: tr("jet.heading"), climb: tr("jet.climb"),
            updated: tr("jet.updated"), zoomHint: tr("jet.zoomHint"), type: tr("jet.type"), callsign: tr("jet.callsign"),
            onGround: tr("jet.onGround"),
          }} />
      )}
      <p className="tiny muted" style={{ margin: 0 }}>{tr("jet.refresh")}</p>
      {source}
    </div>
  );
}

/**
 * On the home screen, only when the client's assistant has put a flight on
 * their map: says so, and opens the tracker under Help → Rides.
 */
export function SharedFlightBanner({ onOpen }: { onOpen: () => void }) {
  const { t, language } = useLanguage();
  const [flight, setFlight] = useState<SharedFlight | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.myFlights().then(({ flights }) => { if (!cancelled) setFlight(flights[0] ?? null); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!flight) return null;
  return (
    <section className="card stack jet-banner">
      <div className="row-between" style={{ gap: 12 }}>
        <div className="stack" style={{ gap: 2 }}>
          <strong>{t("jet.homeTitle")}</strong>
          <span className="small muted">
            {flight.tailNumber}{flight.from && flight.to ? ` · ${flight.from} → ${flight.to}` : ""}
            {flight.departsAt ? ` · ${t("jet.leaves").replace("{time}", whenLabel(flight.departsAt, language))}` : ""}
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onOpen}>{t("jet.homeOpen")}</button>
      </div>
    </section>
  );
}
