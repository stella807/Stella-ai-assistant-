import { useEffect, useState } from "react";
import {
  CONCIERGE_CATEGORIES, CONCIERGE_MIN_CAP_CENTS, QUICK_TASK_CATEGORIES, QUICK_TASK_MAX_CAP_CENTS,
  BOOKED_HOUR_STEP, MAX_BOOKED_HOURS, MIN_BOOKED_HOURS, PA_HOURLY_RATE_CENTS,
  assistantPayoutFor, capPresetsFor, capScaleFor, clampAmount, clampHours, conciergeCategoryLabel,
  defaultCapFor, defaultHoursFor, findRole, hasCapCeiling, hasFeature, hourlyRateCentsFor,
  isAssistantAvailable, isElitePlan, isHourlyCategory, isInLaunchMarket, isQuickTaskEligible,
  launchMarketNames, minutesFor, serviceFeeFor, totalChargeCents,
} from "@safehubby/core";
import type {
  AssistantProfile, ConciergeCategory, ConciergeTask, FlightInfo, NearbyStore, ProviderStatus, PlanId,
} from "@safehubby/core";
import { api } from "../api.ts";
import { currentFix, type Fix } from "../native/location.ts";
import type { Account } from "../api.ts";
import { AmountStepper } from "./AmountStepper.tsx";
import { AssistantModal } from "./AssistantModal.tsx";
import { CategoryIcon } from "./CategoryIcons.tsx";
import { FlightCard } from "./FlightCard.tsx";
import { LiveMap } from "./LiveMap.tsx";
import { RequestDetail } from "./RequestDetail.tsx";

/** Exact, to the cent. Amounts here are prices somebody agrees to and
 *  charges that land on a statement — a fee of $13.13 shown as "$13" is a
 *  number the customer did not actually accept. */
import { dollars, money } from "../money.ts";
/** Whole dollars, for the amounts the cap control deals in, which step in
 *  fives and so can never have cents to lose. */

/** One-tap durations, in hundredths of an hour to match the stepper's units:
 *  an hour, a couple, an evening, a working day. */
const HOUR_PRESETS = [100, 200, 400, 600, 800, 1200];

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
/**
 * Which half of the service this panel is booking.
 *
 * The split is not a UI invention: `QUICK_TASK_CATEGORIES` in core already
 * separates the short, single-purpose jobs (grab one named thing, run one
 * errand) from the ones that are open-ended time with a person. They have
 * different payouts, different spend caps, and different reasons to book, and
 * putting all four in one list meant the cheap five-minute errand and the
 * hour of sitting with a friend looked like the same product.
 */
export type HiringKind = "errand" | "concierge";

/** What the panel calls itself, per tab. A card headed "Personal concierge"
 *  sitting under a tab labelled "Small errands" is the two disagreeing about
 *  what you just picked. */
const COPY_FOR: Record<HiringKind, { heading: string; blurb: string; locked: string }> = {
  errand: {
    heading: "Small errand",
    blurb: "One short, specific job — grab a thing, run an errand — capped at exactly what you set below, never more.",
    locked: "🔒 Send someone for a quick pickup or errand, at a spend cap you set. Included on every plan, Free too.",
  },
  concierge: {
    heading: "Personal concierge",
    blurb: "Send someone for one bounded task, capped at exactly what you set below — never more, whatever it ends up costing.",
    locked: "🔒 Send a vetted personal assistant to wait with a friend, check on someone, or book and buy something for you. Included on every paid plan.",
  },
};

const CATEGORIES_FOR: Record<HiringKind, ConciergeCategory[]> = {
  errand: QUICK_TASK_CATEGORIES,
  concierge: CONCIERGE_CATEGORIES
    .map((c) => c.id)
    .filter((id) => !QUICK_TASK_CATEGORIES.includes(id)),
};

const STATUS_LABEL: Record<string, string> = {
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** One row, active or past — tap it to open the full detail screen. */
function TaskRow({ task, onOpen }: { task: ConciergeTask; onOpen: () => void }) {
  return (
    <button className="row-between" style={{
      width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
    }} onClick={onOpen}>
      <div className="row" style={{ gap: 10 }}>
        <span className="category-tile-icon"><CategoryIcon id={task.category} /></span>
        <div>
          <strong className="small">{task.note}</strong>
          <div className="tiny muted">
            {task.provider} · {money(task.spendCapCents + task.serviceFeeCents)} held
            {task.status !== "in-progress" && ` · ${STATUS_LABEL[task.status] ?? task.status}`}
          </div>
        </div>
      </div>
      <span className="chev">›</span>
    </button>
  );
}

export function ConciergePanel({ account, kind = "concierge" }: { account: Account; kind?: HiringKind }) {
  const planId = account.planId as PlanId;
  // Small errands (grab-something, run-errand) are gated on `quick-tasks`,
  // which is on every plan including Free — see `FREE_FEATURES` in
  // billing.ts and its own "a free user can send someone to grab a
  // specific thing" reasoning. Gating this tab on `personal-concierge`
  // instead, the way the rest of this panel is, would lock Free users out
  // of the one thing their plan already promises them.
  const locked = kind === "errand" ? !hasFeature(planId, "quick-tasks") : !hasFeature(planId, "personal-concierge");
  const allowed = CATEGORIES_FOR[kind];

  const [category, setCategory] = useState<ConciergeCategory>(allowed[0] ?? "grab-something");
  const [note, setNote] = useState("");
  const [capCents, setCapCents] = useState(() => defaultCapFor(allowed[0] ?? "grab-something", planId));
  const [hours, setHours] = useState(() => defaultHoursFor(allowed[0] ?? "grab-something"));
  /** The typed cap, kept as text so a half-entered "40" is not parsed as $40
   *  and snapped away while somebody is still typing "40000". */
  const [capEntry, setCapEntry] = useState("");
  const [quickTask, setQuickTask] = useState(false);
  const [tasks, setTasks] = useState<ConciergeTask[]>([]);
  const [roster, setRoster] = useState<AssistantProfile[] | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [selected, setSelected] = useState<AssistantProfile | null>(null);
  const [openTask, setOpenTask] = useState<ConciergeTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether this booking is one tap-through-a-notification away from being
  // sent, rather than a full "browse and pick someone" flow — see
  // `useConfirmFlow` below for who gets which.
  const [confirming, setConfirming] = useState(false);
  // Who a confirmed quick task actually goes to — picked automatically by
  // `startConfirm` below, never shown to the customer by name.
  const [autoAssistant, setAutoAssistant] = useState<AssistantProfile | null>(null);

  // Naming a real place for the task — see PlaceSearchPort in packages/core.
  // Picking one here sets the task's actual location, rather than leaving it
  // to however the free-text note happens to spell a place from memory.
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<NearbyStore[] | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<NearbyStore | null>(null);
  const [placeSearchStatus, setPlaceSearchStatus] = useState<ProviderStatus | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);

  // Which flight the assistant is meeting, for `airport-pickup` — looked up
  // for real before booking (see FlightTrackingPort) rather than trusted as
  // free text, so both sides see the same schedule the app will keep
  // tracking once the task exists.
  const [flightNumber, setFlightNumber] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [flightPreview, setFlightPreview] = useState<FlightInfo | null>(null);
  const [flightTrackingStatus, setFlightTrackingStatus] = useState<ProviderStatus | null>(null);
  const [flightBusy, setFlightBusy] = useState(false);
  const [flightError, setFlightError] = useState<string | null>(null);

  useEffect(() => {
    if (locked) return;
    api.conciergeTasks().then((r) => setTasks(r.tasks)).catch(() => {});
    api.fulfillmentStatus().then((r) => {
      setPlaceSearchStatus(r.placeSearch);
      setFlightTrackingStatus(r.flightTracking);
    }).catch(() => {});
    // Asked for on mount, not at submit. Whether we cover where somebody is
    // standing is knowable before they describe a task, pick an assistant and
    // choose an amount — and finding out afterwards, in a red banner under a
    // form they just filled in, is the version this used to ship.
    currentFix().then(setFix).catch(() => {});
  }, [locked]);

  // A flight the server is re-checking every few minutes (see `runFlightSweep`)
  // is only useful here if this screen actually re-reads it. Polled only while
  // a pickup is genuinely in progress, so an idle dashboard sits silent rather
  // than waking the radio every minute for tasks that cannot change.
  const watchingFlight = tasks.some((t) => t.status === "in-progress" && t.flightNumber);
  useEffect(() => {
    if (locked || !watchingFlight) return;
    const timer = setInterval(() => {
      api.conciergeTasks().then((r) => setTasks(r.tasks)).catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [locked, watchingFlight]);

  // Switching tabs must not leave the previous tab's category selected, which
  // would book a concierge job from the errands screen.
  useEffect(() => {
    setCategory((current) => {
      const next = allowed.includes(current) ? current : allowed[0] ?? "grab-something";
      if (next !== current) { setCapCents(defaultCapFor(next, planId)); setHours(defaultHoursFor(next)); }
      return next;
    });
    setRoster(null);
    setConfirming(false);
    setAutoAssistant(null);
  }, [kind]);

  if (locked) {
    return (
      <section className="card stack">
        <h3>{COPY_FOR[kind].heading}</h3>
        <p className="tiny muted">{COPY_FOR[kind].locked}</p>
      </section>
    );
  }

  // Null while the fix is still being fetched or was refused: unknown is not
  // the same as uncovered, and greying out the form on a permission prompt
  // that has not been answered yet would be its own bug.
  const covered = fix ? isInLaunchMarket(fix) : null;

  const quickEligible = isQuickTaskEligible(category);
  // Free can only ever book a quick task — `requireConciergeAccess` on the
  // server waives `personal-concierge` for this plan only when `quickTask`
  // is true, since Free never has that feature at all. Forced here rather
  // than left to the checkbox below, so there is no way to land on this
  // plan's own combination the server would refuse: pick a category this
  // plan can reach, and it books at the rate that comes with it.
  const effectiveQuickTask = (quickTask || planId === "free") && quickEligible;
  // A quick task ("grab something", "run an errand") is meant to be
  // low-friction: type what you need, confirm it with a tap, done — the
  // roster-browsing screen below is the wrong amount of ceremony for a
  // water bottle and some Advil. Elite members skip the tap-to-confirm
  // step instead and go straight into the full chat with their own PA,
  // voice messages, photos and all, the same screen every other concierge
  // category already opens into — a named team is the thing Elite is
  // actually paying for, so routing them around it here would be odd.
  const eliteMember = isElitePlan(planId);
  const useConfirmFlow = QUICK_TASK_CATEGORIES.includes(category) && !eliteMember;
  // Ceiling, step and presets all come from core: a booking that buys concert
  // tickets is funded differently from one that fetches a burger, and that is
  // a pricing rule, not a form detail.
  const base = capScaleFor(category, effectiveQuickTask, planId);
  // Where Safehubby sets no ceiling, the scale stretches to whatever was
  // typed. Its max is the top of the preset ladder, which the stepper needs
  // something finite to step along — but leaving it there would clamp a
  // typed $40,000 back down to the ladder, turning "no limit" into a limit
  // with extra steps.
  const capScale = hasCapCeiling(category, effectiveQuickTask)
    ? base
    : { ...base, maxCents: Math.max(base.maxCents, capCents) };
  // Clamped rather than stored clamped: switching a booking to a quick task
  // drops the ceiling, and the cap has to follow it down without losing the
  // customer's original number if they switch back.
  const spendCapCents = clampAmount(capCents, capScale);
  // Priced with the same functions the server charges with, so what is shown
  // here and what lands on the statement cannot drift apart. One person,
  // because that is what this form books — `peopleCountFor` on the server
  // defaults to 1 and this panel sends no count, so quoting plan seats here
  // would overstate the fee for a Family subscriber booking for themselves.
  // Hourly work is priced on the hours the customer booked; an errand is not
  // priced on hours at all, and passing them would be rejected by the server.
  const hourly = isHourlyCategory(category);
  const bookedHours = hourly ? clampHours(hours) : undefined;
  const serviceFee = serviceFeeFor(category, effectiveQuickTask, 1, bookedHours);
  const assistantPayout = assistantPayoutFor(category, effectiveQuickTask, 1, bookedHours);
  const totalHeld = totalChargeCents(category, spendCapCents, effectiveQuickTask, 1, bookedHours);

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

  // Looks up who is actually available before showing anything to confirm —
  // the same roster `browse` fetches, just not rendered as a rail of tiles.
  // If nobody is available, that has to surface honestly rather than
  // pretend a tap-to-confirm dispatches anyone.
  const startConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const at = await currentFix();
      if (!at) throw new Error("Turn on location to send this — the assistant needs to know where to go.");
      setFix(at);
      const res = await api.conciergeAssistants(category, selectedPlace ?? at);
      const available = res.assistants.find((a) => isAssistantAvailable(a));
      if (!available) throw new Error("No one is available for this right now — try again shortly.");
      setAutoAssistant(available);
      setConfirming(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that request");
    } finally {
      setBusy(false);
    }
  };

  const confirmAndSend = async () => {
    if (!taskLocation || !autoAssistant) { setError("Turn on location to send this."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await api.bookConcierge({
        category, note, location: taskLocation, spendCapCents, quickTask: effectiveQuickTask,
        assistantId: autoAssistant.id,
      });
      onBooked(res.task);
      setConfirming(false);
      setAutoAssistant(null);
      setNote("");
      setSelectedPlace(null);
      setPlaceResults(null);
      setPlaceQuery("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that request");
    } finally {
      setBusy(false);
    }
  };

  const isAirportPickup = category === "airport-pickup";

  const lookupFlight = async () => {
    setFlightBusy(true);
    setFlightError(null);
    setFlightPreview(null);
    try {
      const res = await api.flightLookup(flightNumber.trim(), flightDate);
      setFlightPreview(res.flight);
    } catch (e) {
      setFlightError(e instanceof Error ? e.message : "Could not look up that flight");
    } finally {
      setFlightBusy(false);
    }
  };

  // The modal stays open after booking — it transitions itself into the
  // voice-message thread for the new task, so it closes only when the
  // subscriber taps close, not the instant a request goes out.
  const onBooked = (task: ConciergeTask) => setTasks((t) => [task, ...t]);

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

  const dispute = (taskId: string, reason: string) => api.disputeConcierge(taskId, reason)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => { throw new Error(e instanceof Error ? e.message : "Could not send that"); });

  const complete = (taskId: string) => api.completeConcierge(taskId)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => setError(e instanceof Error ? e.message : "Could not mark that done"));

  const active = tasks.filter((t) => t.status === "in-progress");
  const past = tasks.filter((t) => t.status !== "in-progress");
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  // Shared between the detail view below and the booking form further down,
  // so reopening an existing task's thread works identically from either.
  const openTaskModal = openTask && (
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
  );

  if (selectedTask) {
    return (
      <>
        <RequestDetail
          task={selectedTask}
          onBack={() => setSelectedTaskId(null)}
          onMessage={() => setOpenTask(selectedTask)}
          onComplete={selectedTask.status === "in-progress" ? () => complete(selectedTask.id) : undefined}
          onCancel={selectedTask.status === "in-progress" ? () => cancel(selectedTask.id) : undefined}
          onDispute={selectedTask.status === "completed" ? (reason) => dispute(selectedTask.id, reason) : undefined}
          busy={busy}
        />
        {openTaskModal}
      </>
    );
  }

  return (
    <section className="card stack">
      <h3>{COPY_FOR[kind].heading}</h3>
      <p className="small muted">{COPY_FOR[kind].blurb}</p>

      {/* Said here, at the top, rather than in a red banner under a finished
          form. Not an error either: being outside the launch markets is not
          something the customer did wrong. */}
      {covered === false && (
        <div className="banner">
          <strong>We are not in your area yet.</strong>
          <span className="tiny">
            Assistants work {launchMarketNames()} for now. Everything else on your plan still works
            wherever you are — this is the one part that needs somebody local.
          </span>
        </div>
      )}

      {active.length > 0 && (
        <ul className="timeline">
          {active.map((t) => <li key={t.id}><TaskRow task={t} onOpen={() => setSelectedTaskId(t.id)} /></li>)}
        </ul>
      )}

      {past.length > 0 && (
        <>
          <span className="section-label">Past requests</span>
          <ul className="timeline">
            {past.map((t) => <li key={t.id}><TaskRow task={t} onOpen={() => setSelectedTaskId(t.id)} /></li>)}
          </ul>
        </>
      )}

      <div className="category-grid">
        {CONCIERGE_CATEGORIES.filter((c) => allowed.includes(c.id)).map((c) => (
          <button key={c.id} className="category-tile"
            onClick={() => {
              setCategory(c.id);
              // The cap follows the category rather than carrying over. A $100
              // ceiling means nothing on a hotel booking, and a $500 one is not
              // a number anybody meant to authorize for a coffee run.
              setCapCents(defaultCapFor(c.id, planId));
              setHours(defaultHoursFor(c.id));
              setCapEntry("");
              setRoster(null);
              setConfirming(false);
              setAutoAssistant(null);
              if (!isQuickTaskEligible(c.id)) setQuickTask(false);
              if (c.id !== "airport-pickup") {
                setFlightNumber(""); setFlightDate(""); setFlightPreview(null); setFlightError(null);
              }
            }}
            aria-pressed={c.id === category}>
            <span className="category-tile-icon"><CategoryIcon id={c.id} /></span>
            <span className="category-tile-label">{c.label}</span>
            {/* What it actually runs, on every tile at once — picking one to
                find out was the same "swipe to compare" problem the plan
                picker has, just for "what does a simple errand cost"
                instead of "what does a bigger plan cost". */}
            <span className="category-tile-price">
              from {money(serviceFeeFor(c.id, isQuickTaskEligible(c.id), 1, defaultHoursFor(c.id)))}
            </span>
          </button>
        ))}
      </div>
      {CONCIERGE_CATEGORIES.find((c) => c.id === category) && (
        <p className="tiny muted" style={{ margin: 0 }}>
          {CONCIERGE_CATEGORIES.find((c) => c.id === category)!.description}
        </p>
      )}

      {isAirportPickup && (
        <div className="field">
          <label htmlFor="concierge-flight-number">Which flight?</label>
          <div className="row" style={{ gap: 6 }}>
            <input id="concierge-flight-number" type="text" value={flightNumber}
              onChange={(e) => { setFlightNumber(e.target.value); setFlightPreview(null); }}
              placeholder="DL204" style={{ flex: 1 }} />
            <input id="concierge-flight-date" type="date" value={flightDate}
              onChange={(e) => { setFlightDate(e.target.value); setFlightPreview(null); }}
              aria-label="Flight date" />
            {/* Tracking is an enhancement, not a precondition — a flight
                number and date are all booking actually needs (see
                validateConciergeRequest); the lookup below only adds a
                preview when a real tracking key is configured. */}
            {flightTrackingStatus?.mode === "automatic" && (
              <button className="btn btn-sm" disabled={flightBusy || !flightNumber.trim() || !flightDate}
                onClick={lookupFlight}>
                {flightBusy ? "Looking up…" : "Look up"}
              </button>
            )}
          </div>
          {flightTrackingStatus && flightTrackingStatus.mode !== "automatic" && (
            <p className="tiny muted" style={{ margin: 0 }}>
              Flight tracking isn't set up on this server yet — your assistant will still be dispatched to meet
              this flight, just without a live status preview.
            </p>
          )}
          {flightError && <p className="tiny" style={{ color: "var(--danger)", margin: 0 }}>{flightError}</p>}
          {flightPreview && <FlightCard flight={flightPreview} />}
        </div>
      )}

      <div className="field">
        <label htmlFor="concierge-note">What do you need?</label>
        <textarea id="concierge-note" maxLength={280} rows={2} value={note}
          onChange={(e) => { setNote(e.target.value); setRoster(null); setConfirming(false); setAutoAssistant(null); }}
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
        {selectedPlace && (
          <LiveMap points={[{ lat: selectedPlace.lat, lng: selectedPlace.lng, label: selectedPlace.name }]} />
        )}
      </div>

      {quickEligible && planId !== "free" && (
        <label className="row" style={{ alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" checked={quickTask}
            onChange={(e) => { setQuickTask(e.target.checked); setRoster(null); }} />
          <span className="small">
            This is quick and simple — book at the discounted rate (capped at {dollars(QUICK_TASK_MAX_CAP_CENTS)} spend).
          </span>
        </label>
      )}
      {/* Free books at the quick-task rate always — the checkbox above
          would let someone switch to the plan they can't reach and hit a
          402, so it says so instead of offering the choice. */}
      {quickEligible && planId === "free" && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Booked at the discounted rate, free of charge on your plan — capped at {dollars(base.maxCents)} spend.
        </p>
      )}

      {/* Hours first, then the card. They are the two halves of an hourly
          booking and they are not the same kind of money — what you are
          paying the person, and what you are handing them to spend. */}
      {hourly && (
        <AmountStepper
          id="concierge-hours"
          label="How long do you need them?"
          unit="hours"
          hint={`Billed at ${money(PA_HOURLY_RATE_CENTS)}/hr. Book more or less any time before they start.`}
          valueCents={Math.round(clampHours(hours) * 100)}
          scale={{
            minCents: MIN_BOOKED_HOURS * 100,
            maxCents: MAX_BOOKED_HOURS * 100,
            stepCents: BOOKED_HOUR_STEP * 100,
          }}
          presetsCents={HOUR_PRESETS}
          onChange={(units) => { setHours(units / 100); setRoster(null); }}
        />
      )}

      <AmountStepper
        id="concierge-cap"
        label="Loaded on their card to spend"
        hint={`Goes onto a card that works for this task only — the hotel, the tickets, whatever it takes. A ceiling, not a price: you pay what is actually spent. Nudge it ${dollars(capScale.stepCents)} at a time.`}
        valueCents={spendCapCents}
        scale={capScale}
        presetsCents={capPresetsFor(category, planId)}
        onChange={(cents) => { setCapCents(cents); setRoster(null); setConfirming(false); setAutoAssistant(null); }}
      />

      {/* Where Safehubby sets no ceiling, the ladder cannot be the only way
          in: a forty-thousand-dollar hotel stay is a real booking and there
          is no sensible number of preset buttons that reaches it. Typed
          rather than nudged, so an amount this size is always deliberate. */}
      {!hasCapCeiling(category, effectiveQuickTask) && (
        <div className="field">
          <label htmlFor="concierge-cap-exact">Or load an exact amount</label>
          <input
            id="concierge-cap-exact"
            inputMode="decimal"
            value={capEntry}
            placeholder={dollars(spendCapCents).replace("$", "")}
            onChange={(e) => {
              setCapEntry(e.target.value);
              const parsed = Math.round(Number(e.target.value.replace(/[^0-9.]/g, "")) * 100);
              if (Number.isFinite(parsed) && parsed >= CONCIERGE_MIN_CAP_CENTS) {
                setCapCents(parsed);
                setRoster(null);
              }
            }}
          />
          <p className="tiny muted" style={{ margin: 0 }}>
            Whatever you fund it with. Safehubby sets no upper limit here — the card carries what you put on
            it, declines a cent over, and dies when the task ends.
          </p>
        </div>
      )}

      {/* What this costs, before agreeing to it rather than after.
          Everything here comes from the same core functions the server
          charges with, so the number shown is the number taken — the panel
          used to show the fee only once the task already existed, which
          meant picking a cap and finding out afterwards. */}
      <div className="price-breakdown">
        <div className="row-between">
          <span className="small">Service fee</span>
          <span className="small charge-amount">{money(serviceFee)}</span>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {hourly
            ? `${clampHours(hours)} ${clampHours(hours) === 1 ? "hour" : "hours"} of their time at ${money(PA_HOURLY_RATE_CENTS)}/hr.`
            : `Pays your assistant for about ${minutesFor(category, effectiveQuickTask)} minutes of their time.`}
        </p>
        {/* What the person doing the work actually takes home, said plainly to
            the customer paying for it. It is their money, and "service fee" on
            its own hides whether any of it reaches the assistant — the number
            here is the same `assistantPayoutFor` payroll pays out, not a
            share of the fee estimated for display. */}
        <div className="row-between" style={{ marginTop: 6 }}>
          <span className="small">Your assistant is paid</span>
          <span className="small charge-amount">{money(assistantPayout)}</span>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {money(hourlyRateCentsFor(category, effectiveQuickTask))}/hr{hourly ? "" : " for this kind of task"}. They
          keep all of it — Safehubby's {money(serviceFee - assistantPayout)} is added on top of their rate,
          never taken out of it.
        </p>
        <div className="row-between" style={{ marginTop: 6 }}>
          <span className="small"><strong>Held now</strong></span>
          <span className="small charge-amount"><strong>{money(totalHeld)}</strong></span>
        </div>
        {/* Which number is which. The two are easy to read as one total, and
            they are not the same kind of money at all: one is loaded onto a
            card a stranger carries, the other pays for their time and never
            touches that card. */}
        <p className="tiny muted" style={{ margin: 0 }}>
          {money(spendCapCents)} onto their card for the purchase, {money(serviceFee)} for their time. The
          card money is a ceiling, not a price — you are charged for what is actually spent, and never a cent
          over it. The fee is never on the card.
        </p>
      </div>

      {/* The low-friction path: type it, confirm it, done. No roster to
          browse — the same shape as tapping "Yes" on a push notification,
          just without waiting for the notification to actually land since
          the customer is already looking at the screen that would send it. */}
      {useConfirmFlow && !confirming && (
        <button className="btn btn-block" disabled={busy || !note.trim() || covered === false} onClick={startConfirm}>
          Send request
        </button>
      )}

      {useConfirmFlow && confirming && (
        <div className="card card-quiet stack" style={{ gap: 8 }}>
          <strong className="small">Confirm this request?</strong>
          <p className="small" style={{ margin: 0 }}>
            {conciergeCategoryLabel(category)}: "{note}" — up to {money(spendCapCents)} loaded on their card,
            {" "}{money(totalHeld)} held on yours now.
          </p>
          <div className="row">
            <button className="btn grow" disabled={busy} onClick={() => { setConfirming(false); setAutoAssistant(null); }}>
              No, edit it
            </button>
            <button className="btn btn-primary grow" disabled={busy} onClick={confirmAndSend}>Yes, send it</button>
          </div>
        </div>
      )}

      {!useConfirmFlow && roster === null && (
        <button className="btn btn-block"
          disabled={busy || !note.trim() || covered === false || (isAirportPickup && (!flightNumber.trim() || !flightDate))}
          onClick={browse}>
          Browse assistants
        </button>
      )}

      {!useConfirmFlow && roster !== null && roster.length === 0 && (
        <p className="small muted">
          No assistants to show right now. Try a different task type, or check back shortly.
        </p>
      )}

      {roster !== null && roster.length > 0 && (
        /*
         * A side-scrolling rail rather than a vertical list. Choosing who
         * comes to you is a comparison — you look across the options — and a
         * stacked list makes you scroll past four people to see the fifth,
         * with the booking form pushed off screen the whole time.
         *
         * Everything shown is self-reported by the assistant and optional.
         * There is deliberately no way to filter the rail by any of it: a
         * customer reading who somebody is while choosing is context, while
         * narrowing a workforce by age or sex is allocating work by
         * protected characteristic, which is a different thing with
         * employment law attached.
         */
        <div className="assistant-rail" role="list">
          {roster.map((a) => {
            const available = isAssistantAvailable(a);
            const facts = [
              a.yearsExperience !== undefined
                ? `${a.yearsExperience} ${a.yearsExperience === 1 ? "yr" : "yrs"} as a PA`
                : null,
              a.gender,
              a.age !== undefined ? `age ${a.age}` : null,
            ].filter(Boolean);
            return (
              <button key={a.id} role="listitem" className="assistant-tile" disabled={!available}
                aria-pressed={selected?.id === a.id} onClick={() => setSelected(a)}>
                <div className="assistant-avatar assistant-avatar-lg">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" /> : a.name.slice(0, 1)}
                </div>
                <strong className="small">{a.name}</strong>
                {/* The role, not just the person — an errand runner and a
                    personal assistant are different jobs with a different
                    duty of care (see ROLE_CATEGORIES in roster.ts), and a
                    subscriber picking who comes to them should see which
                    one this is, not just a name and a photo. Absent for a
                    partner-network professional, who carries no StaffRole. */}
                {a.role && <span className="pill">{findRole(a.role).label}</span>}
                {facts.length > 0 && <span className="tiny muted">{facts.join(" · ")}</span>}
                {/* Self-reported, same as the facts above — a couple of lines,
                    not the assistant's full application bio, since the tile
                    is a comparison at a glance and the modal opens onto the
                    rest once one is picked. */}
                {a.bio && <span className="tiny muted assistant-bio">{a.bio}</span>}
                <span className={`tiny ${available ? "muted" : "assistant-full"}`}>
                  {available ? `Up to ${a.maxConcurrentCustomers} at once` : "At capacity"}
                </span>
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
          hours={bookedHours}
          quickTask={effectiveQuickTask}
          location={taskLocation}
          flight={isAirportPickup ? { flightNumber: flightNumber.trim(), date: flightDate } : undefined}
          onBooked={onBooked}
          onClose={closeSelected}
        />
      )}

      {openTaskModal}
    </section>
  );
}
