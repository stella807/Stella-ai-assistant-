import { useEffect, useState } from "react";
import {
  CONCIERGE_CATEGORIES, CONCIERGE_MAX_CAP_CENTS, CONCIERGE_MIN_CAP_CENTS, QUICK_TASK_MAX_CAP_CENTS,
  hasFeature, isAssistantAvailable, isQuickTaskEligible,
} from "@safehubby/core";
import type {
  AssistantProfile, ConciergeCategory, NearbyStore, ProviderStatus, TravelerConciergeTask, PlanId,
} from "@safehubby/core";
import { api } from "../api.ts";
import { currentFix, type Fix } from "../native/location.ts";
import type { Account } from "../api.ts";
import { AssistantModal } from "./AssistantModal.tsx";

const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/**
 * A real embedded map for the chosen place, when a browser-safe Maps key is
 * configured — the Embed API takes a key scoped to HTTP referrers, unlike the
 * server-side Places key, so it's safe to ship in the client bundle. With no
 * key configured this renders nothing rather than a fake or placeholder map,
 * the same discipline as every other unconfigured provider in this app.
 */
const MAPS_BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;

function PlaceMap({ place }: { place: NearbyStore }) {
  if (!MAPS_BROWSER_KEY) return null;
  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(String(MAPS_BROWSER_KEY))}&q=${encodeURIComponent(`${place.name} ${place.address}`.trim())}&center=${place.lat},${place.lng}`;
  return (
    <iframe
      title={`Map of ${place.name}`}
      src={src}
      style={{ width: "100%", height: 160, border: 0, borderRadius: 8 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}

/**
 * Personal concierge: request a vetted partner-network professional for one
 * bounded, in-person task, at a spend cap the subscriber sets and that is
 * never exceeded — see concierge.ts for why this is a booking layer on an
 * already-vetted partner rather than an open "hire a stranger" tab.
 *
 * Browsing and picking a specific assistant, then a voice-message popup for
 * talking to them, both live here rather than as a separate step: the roster
 * only means anything in the context of the task it's being picked for.
 */
export function ConciergePanel({ account }: { account: Account }) {
  const locked = !hasFeature(account.planId as PlanId, "personal-concierge");

  const [category, setCategory] = useState<ConciergeCategory>("grab-something");
  const [note, setNote] = useState("");
  const [capDollars, setCapDollars] = useState(25);
  const [quickTask, setQuickTask] = useState(false);
  const [tasks, setTasks] = useState<TravelerConciergeTask[]>([]);
  const [roster, setRoster] = useState<AssistantProfile[] | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [selected, setSelected] = useState<AssistantProfile | null>(null);
  const [openTask, setOpenTask] = useState<TravelerConciergeTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Naming a real place for the task — see PlaceSearchPort in packages/core.
  // Picking one here sets the task's actual location, rather than leaving it
  // to however the free-text note happens to spell a place from memory.
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<NearbyStore[] | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NearbyStore | null>(null);
  const [placeSearchStatus, setPlaceSearchStatus] = useState<ProviderStatus | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);

  useEffect(() => {
    if (locked) return;
    api.conciergeTasks().then((r) => setTasks(r.tasks)).catch(() => {});
    api.fulfillmentStatus().then((r) => setPlaceSearchStatus(r.placeSearch)).catch(() => {});
  }, [locked]);

  if (locked) {
    return (
      <section className="card stack">
        <h3>Personal concierge</h3>
        <p className="tiny muted">
          🔒 Send a vetted assistant for a bounded, capped-spend task — grab something, sit with a friend,
          or check on someone in person. Included on every paid plan.
        </p>
      </section>
    );
  }

  const quickEligible = isQuickTaskEligible(category);
  const effectiveQuickTask = quickTask && quickEligible;
  const maxCapDollars = (effectiveQuickTask ? QUICK_TASK_MAX_CAP_CENTS : CONCIERGE_MAX_CAP_CENTS) / 100;
  const spendCapCents = Math.round(Math.min(capDollars, maxCapDollars) * 100);

  const browse = async () => {
    setBusy(true);
    setError(null);
    setRoster(null);
    try {
      const at = await currentFix();
      if (!at) throw new Error("Turn on location to browse assistants — they need to know where to go.");
      setFix(at);
      const res = await api.conciergeAssistants(category, at);
      setRoster(res.assistants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the roster right now");
    } finally {
      setBusy(false);
    }
  };

  // The modal stays open after booking — it transitions itself into the
  // voice-message thread for the new task, so it closes only when the
  // subscriber taps close, not the instant a request goes out.
  const onBooked = (task: TravelerConciergeTask) => setTasks((t) => [task, ...t]);

  const closeSelected = () => {
    setSelected(null);
    setRoster(null);
    setNote("");
    setSelectedPlace(null);
    setPlaceResults(null);
    setPlaceQuery("");
  };

  const searchPlaces = async () => {
    if (!placeQuery.trim()) return;
    setPlaceBusy(true);
    setError(null);
    try {
      const at = fix ?? (await currentFix());
      if (!at) throw new Error("Turn on location to search for a place.");
      if (!fix) setFix(at);
      const res = await api.placeSearch(placeQuery, at);
      setPlaceResults(res.places);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not search for that place");
    } finally {
      setPlaceBusy(false);
    }
  };

  const pickPlace = (place: NearbyStore) => {
    setSelectedPlace(place);
    setPlaceResults(null);
    setPlaceQuery("");
  };

  // Where the task actually happens: the named place once one is picked,
  // otherwise the subscriber's own location — the same default as before
  // place search existed.
  const taskLocation = selectedPlace
    ? { lat: selectedPlace.lat, lng: selectedPlace.lng, label: selectedPlace.name }
    : fix;

  const cancel = (taskId: string) => api.cancelConcierge(taskId)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => setError(e instanceof Error ? e.message : "Could not cancel"));

  const complete = (taskId: string) => api.completeConcierge(taskId)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => setError(e instanceof Error ? e.message : "Could not mark that done"));

  const active = tasks.filter((t) => t.status === "in-progress");

  return (
    <section className="card stack">
      <h3>Personal concierge</h3>
      <p className="small muted">
        Send someone for one bounded task, capped at exactly what you set below — never more, whatever it
        ends up costing.
      </p>

      {active.length > 0 && (
        <ul className="timeline">
          {active.map((t) => (
            <li key={t.id}>
              <div className="row-between">
                <div>
                  <strong className="small">{t.note}</strong>
                  <div className="tiny muted">
                    {t.provider} · {money(t.totalHeldCents)} held
                    {t.card && ` · paying on a card ending ${t.card.last4} — not yours`}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" disabled={busy} onClick={() => setOpenTask(t)}>Message</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => complete(t.id)}>Done</button>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => cancel(t.id)}>Cancel</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="chip-grid">
        {CONCIERGE_CATEGORIES.map((c) => (
          <button key={c.id} className={`chip${c.id === category ? " chip-on" : ""}`}
            onClick={() => { setCategory(c.id); setRoster(null); if (!isQuickTaskEligible(c.id)) setQuickTask(false); }}
            aria-pressed={c.id === category}>
            <strong>{c.label}</strong>
            <span className="tiny">{c.description}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label htmlFor="concierge-note">What do you need?</label>
        <textarea id="concierge-note" maxLength={280} rows={2} value={note}
          onChange={(e) => { setNote(e.target.value); setRoster(null); }}
          placeholder="Grab a burger and fries from The Anchor Tavern" />
      </div>

      <div className="field">
        <label htmlFor="concierge-place">Name a specific place (optional)</label>
        {selectedPlace ? (
          <div className="row-between card card-quiet" style={{ padding: 8 }}>
            <div className="stack" style={{ gap: 2 }}>
              <strong className="small">{selectedPlace.name}</strong>
              <span className="tiny muted">{selectedPlace.address}</span>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelectedPlace(null)}>Change</button>
          </div>
        ) : placeSearchStatus && placeSearchStatus.mode !== "automatic" ? (
          <p className="tiny muted">
            Place search isn't set up yet — describe where in the note above instead.
          </p>
        ) : (
          <>
            <div className="row" style={{ gap: 6 }}>
              <input id="concierge-place" type="text" value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchPlaces(); } }}
                placeholder="A pharmacy, a wine store, a restaurant by name…" />
              <button className="btn btn-sm" disabled={placeBusy || !placeQuery.trim()} onClick={searchPlaces}>
                Search
              </button>
            </div>
            {placeResults !== null && placeResults.length === 0 && (
              <p className="tiny muted">No matches nearby — try a different search, or just describe it in the note.</p>
            )}
            {placeResults !== null && placeResults.length > 0 && (
              <ul className="timeline">
                {placeResults.map((p) => (
                  <li key={p.id}>
                    <button className="card card-quiet btn-block" style={{ textAlign: "left", padding: 8 }}
                      onClick={() => pickPlace(p)}>
                      <strong className="small">{p.name}</strong>
                      <div className="tiny muted">{p.address}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {selectedPlace && <PlaceMap place={selectedPlace} />}
      </div>

      {quickEligible && (
        <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" checked={quickTask}
            onChange={(e) => { setQuickTask(e.target.checked); setRoster(null); }} />
          <span className="small">
            This is quick and simple — book at the discounted rate (capped at {money(QUICK_TASK_MAX_CAP_CENTS)} spend).
          </span>
        </label>
      )}

      <div className="field">
        <label htmlFor="concierge-cap">Spend cap — never charged more than this</label>
        <input id="concierge-cap" type="range" min={CONCIERGE_MIN_CAP_CENTS / 100} max={maxCapDollars}
          step={5} value={Math.min(capDollars, maxCapDollars)}
          onChange={(e) => { setCapDollars(Number(e.target.value)); setRoster(null); }} />
        <span className="small">{money(spendCapCents)}</span>
      </div>

      {roster === null && (
        <button className="btn btn-block" disabled={busy || !note.trim()} onClick={browse}>
          Browse assistants
        </button>
      )}

      {roster !== null && roster.length === 0 && (
        <p className="small muted">
          No assistants to show right now. Try a different task type, or check back shortly.
        </p>
      )}

      {roster !== null && roster.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {roster.map((a) => {
            const available = isAssistantAvailable(a);
            return (
              <button key={a.id} className="card card-quiet assistant-card" disabled={!available}
                style={{ boxShadow: "inset 0 0 0 1px var(--line)", opacity: available ? 1 : 0.5 }}
                onClick={() => setSelected(a)}>
                <div className="assistant-avatar">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" /> : a.name.slice(0, 1)}
                </div>
                <div className="stack" style={{ gap: 2 }}>
                  <strong className="small">{a.name}</strong>
                  <span className="tiny muted">
                    {available ? `Up to ${a.maxConcurrentCustomers} at once` : "At capacity right now"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}

      {selected && taskLocation && (
        <AssistantModal
          assistant={selected}
          category={category}
          note={note}
          spendCapCents={spendCapCents}
          quickTask={effectiveQuickTask}
          location={taskLocation}
          onBooked={onBooked}
          onClose={closeSelected}
        />
      )}

      {openTask && (
        <AssistantModal
          assistant={{
            id: openTask.assistantId ?? "assistant",
            name: openTask.assistantName ?? (openTask.assistantId ? "Your assistant" : openTask.provider),
            categories: [openTask.category],
            maxConcurrentCustomers: 1,
            currentCustomers: 0,
          }}
          category={openTask.category}
          note={openTask.note}
          spendCapCents={openTask.spendCapCents}
          quickTask={openTask.quickTask}
          location={openTask.location}
          existingTask={openTask}
          onBooked={() => {}}
          onClose={() => setOpenTask(null)}
        />
      )}
    </section>
  );
}
