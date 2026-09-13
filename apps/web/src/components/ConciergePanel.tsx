import { useEffect, useState } from "react";
import {
  CONCIERGE_CATEGORIES, QUICK_TASK_CATEGORIES, QUICK_TASK_MAX_CAP_CENTS,
  BOOKED_HOUR_STEP, MAX_BOOKED_HOURS, MIN_BOOKED_HOURS, PA_HOURLY_RATE_CENTS,
  assistantPayoutFor, capPresetsFor, capScaleFor, clampAmount, clampHours, defaultCapFor,
  defaultHoursFor, hasFeature, hourlyRateCentsFor, isAssistantAvailable, isHourlyCategory,
  isQuickTaskEligible, minutesFor, serviceFeeFor, totalChargeCents,
} from "@safehubby/core";
import type {
  AssistantProfile, ConciergeCategory, ConciergeTask, NearbyStore, ProviderStatus, PlanId,
} from "@safehubby/core";
import { api } from "../api.ts";
import { currentFix, type Fix } from "../native/location.ts";
import type { Account } from "../api.ts";
import { AmountStepper } from "./AmountStepper.tsx";
import { AssistantModal } from "./AssistantModal.tsx";

/** Exact, to the cent. Amounts here are prices somebody agrees to and
 *  charges that land on a statement — a fee of $13.13 shown as "$13" is a
 *  number the customer did not actually accept. */
const money = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Whole dollars, for the amounts the cap control deals in, which step in
 *  fives and so can never have cents to lose. */
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

/** One-tap durations, in hundredths of an hour to match the stepper's units:
 *  an hour, a couple, an evening, a working day. */
const HOUR_PRESETS = [100, 200, 400, 600, 800, 1200];



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
    locked: "🔒 Send someone for a quick pickup or errand, at a spend cap you set. Included on every paid plan.",
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

export function ConciergePanel({ account, kind = "concierge" }: { account: Account; kind?: HiringKind }) {
  const locked = !hasFeature(account.planId as PlanId, "personal-concierge");
  const allowed = CATEGORIES_FOR[kind];

  const [category, setCategory] = useState<ConciergeCategory>(allowed[0] ?? "grab-something");
  const [note, setNote] = useState("");
  const [capCents, setCapCents] = useState(() => defaultCapFor(allowed[0] ?? "grab-something"));
  const [hours, setHours] = useState(() => defaultHoursFor(allowed[0] ?? "grab-something"));
  const [quickTask, setQuickTask] = useState(false);
  const [tasks, setTasks] = useState<ConciergeTask[]>([]);
  const [roster, setRoster] = useState<AssistantProfile[] | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [selected, setSelected] = useState<AssistantProfile | null>(null);
  const [openTask, setOpenTask] = useState<ConciergeTask | null>(null);
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

  // Switching tabs must not leave the previous tab's category selected, which
  // would book a concierge job from the errands screen.
  useEffect(() => {
    setCategory((current) => {
      const next = allowed.includes(current) ? current : allowed[0] ?? "grab-something";
      if (next !== current) { setCapCents(defaultCapFor(next)); setHours(defaultHoursFor(next)); }
      return next;
    });
    setRoster(null);
  }, [kind]);

  if (locked) {
    return (
      <section className="card stack">
        <h3>{COPY_FOR[kind].heading}</h3>
        <p className="tiny muted">{COPY_FOR[kind].locked}</p>
      </section>
    );
  }

  const quickEligible = isQuickTaskEligible(category);
  const effectiveQuickTask = quickTask && quickEligible;
  // Ceiling, step and presets all come from core: a booking that buys concert
  // tickets is funded differently from one that fetches a burger, and that is
  // a pricing rule, not a form detail.
  const capScale = capScaleFor(category, effectiveQuickTask);
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

  const complete = (taskId: string) => api.completeConcierge(taskId)
    .then((r) => setTasks((ts) => ts.map((t) => (t.id === taskId ? r.task : t))))
    .catch((e) => setError(e instanceof Error ? e.message : "Could not mark that done"));

  const active = tasks.filter((t) => t.status === "in-progress");

  return (
    <section className="card stack">
      <h3>{COPY_FOR[kind].heading}</h3>
      <p className="small muted">{COPY_FOR[kind].blurb}</p>

      {active.length > 0 && (
        <ul className="timeline">
          {active.map((t) => (
            <li key={t.id}>
              <div className="row-between">
                <div>
                  <strong className="small">{t.note}</strong>
                  <div className="tiny muted">
                    {t.provider} · {money(t.spendCapCents + t.serviceFeeCents)} held
                    ({money(t.spendCapCents)} cap + {money(t.serviceFeeCents)} fee)
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
        {CONCIERGE_CATEGORIES.filter((c) => allowed.includes(c.id)).map((c) => (
          <button key={c.id} className={`chip${c.id === category ? " chip-on" : ""}`}
            onClick={() => {
              setCategory(c.id);
              // The cap follows the category rather than carrying over. A $100
              // ceiling means nothing on a hotel booking, and a $500 one is not
              // a number anybody meant to authorize for a coffee run.
              setCapCents(defaultCapFor(c.id));
              setHours(defaultHoursFor(c.id));
              setRoster(null);
              if (!isQuickTaskEligible(c.id)) setQuickTask(false);
            }}
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
            This is quick and simple — book at the discounted rate (capped at {dollars(QUICK_TASK_MAX_CAP_CENTS)} spend).
          </span>
        </label>
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
        presetsCents={capPresetsFor(category)}
        onChange={(cents) => { setCapCents(cents); setRoster(null); }}
      />

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
              a.age !== undefined ? `${a.age}` : null,
            ].filter(Boolean);
            return (
              <button key={a.id} role="listitem" className="assistant-tile" disabled={!available}
                aria-pressed={selected?.id === a.id} onClick={() => setSelected(a)}>
                <div className="assistant-avatar assistant-avatar-lg">
                  {a.photoUrl ? <img src={a.photoUrl} alt="" /> : a.name.slice(0, 1)}
                </div>
                <strong className="small">{a.name}</strong>
                {facts.length > 0 && <span className="tiny muted">{facts.join(" · ")}</span>}
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
