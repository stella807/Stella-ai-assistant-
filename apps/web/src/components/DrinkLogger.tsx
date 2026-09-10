import { useEffect, useState } from "react";
import type { DrinkDefinition, Venue } from "@safehubby/core";

interface Props {
  drinks: DrinkDefinition[];
  venues: Venue[];
  onLog: (drinkId: string, venueName?: string, servings?: number) => void;
  busy: boolean;
  /** Whether the venue list came from the device's own fix or the fallback. */
  venueOrigin: "pending" | "device" | "fallback";
  onFindNearby: () => void;
}

/**
 * Logging has to be faster than the impulse to skip it, so the venue's own menu
 * comes first and the full catalog is a fallback. Water sits in its own row
 * because logging it earns points and we want it to be the easiest tap.
 */
export function DrinkLogger({ drinks, venues, onLog, busy, venueOrigin, onFindNearby }: Props) {
  const [venueId, setVenueId] = useState<string>(venues[0]?.id ?? "");
  const [showAll, setShowAll] = useState(false);

  /**
   * The list is re-fetched when someone changes bar, and the previous
   * selection will not be in the new one. Without this the menu silently falls
   * back to the whole catalogue at the exact moment they walked somewhere new
   * — the one moment the venue menu was worth having.
   */
  useEffect(() => {
    if (venues.length === 0) return;
    if (!venues.some((v) => v.id === venueId)) setVenueId(venues[0]!.id);
  }, [venues, venueId]);

  const venue = venues.find((v) => v.id === venueId);
  const byId = new Map(drinks.map((d) => [d.id, d]));
  const menu = venue
    ? venue.menuDrinkIds.map((id) => byId.get(id)).filter((d): d is DrinkDefinition => Boolean(d))
    : [];
  const shown = showAll || menu.length === 0 ? drinks.filter((d) => d.category !== "non-alcoholic") : menu.filter((d) => d.category !== "non-alcoholic");

  return (
    <section className="card stack" aria-label="Log a drink">
      <div className="row-between">
        <h3>Log a drink</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show menu" : "Show all"}
        </button>
      </div>

      {/* Whether these are really the bars around you is not a detail: a list
          from the fallback coordinates looks identical to a real one, and
          someone would log a whole night against the wrong place. */}
      {venueOrigin === "fallback" && (
        <div className="banner">
          These aren&apos;t places near you — your device didn&apos;t share a location, so this is a
          stand-in list.{" "}
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={onFindNearby}>
            Find bars near me
          </button>
        </div>
      )}

      {venues.length === 0 && venueOrigin === "device" && (
        <div className="banner">
          Nothing found within a few blocks. Pick from the full list below — the log still counts,
          it just won&apos;t be tied to a venue.
        </div>
      )}

      {venues.length > 0 && (
        <div className="field">
          <label htmlFor="venue">Where are you?</label>
          <select id="venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          {/* The menu is inferred from what the maps API says about this place —
              neither Places nor Yelp returns a real drink list. Saying so is the
              difference between a helpful shortcut and a quiet wrong number. */}
          {!showAll && venue?.menuReason && (
            <p className="tiny muted">{venue.menuReason} · tap Show all for the full list</p>
          )}
        </div>
      )}

      <div className="chip-grid">
        {shown.map((d) => (
          <button key={d.id} className="chip" disabled={busy} onClick={() => onLog(d.id, venue?.name)}>
            <strong>{d.name}</strong>
            <span className="tiny muted">{d.servingOz}oz · {(d.abv * 100).toFixed(1)}% · {d.calories} cal</span>
          </button>
        ))}
      </div>

      <button className="btn btn-water btn-block" disabled={busy} onClick={() => onLog("na-water", venue?.name)}>
        + Water &nbsp;<span style={{ fontWeight: 600, opacity: .8 }}>(earns points)</span>
      </button>

      {venue && venue.foodMenu.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3>Eat something here</h3>
          <p className="tiny muted">
            {venue.foodMenu.map((f) => `${f.name} $${(f.priceCents / 100).toFixed(0)}`).join(" · ")}
          </p>
          <p className="tiny muted">Food slows how fast the next drinks hit you. It does nothing for what you already drank.</p>
        </div>
      )}
    </section>
  );
}
