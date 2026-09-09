import { useState } from "react";
import type { DrinkDefinition, Venue } from "@safehubby/core";

interface Props {
  drinks: DrinkDefinition[];
  venues: Venue[];
  onLog: (drinkId: string, venueName?: string, servings?: number) => void;
  busy: boolean;
}

/**
 * Logging has to be faster than the impulse to skip it, so the venue's own menu
 * comes first and the full catalog is a fallback. Water sits in its own row
 * because logging it earns points and we want it to be the easiest tap.
 */
export function DrinkLogger({ drinks, venues, onLog, busy }: Props) {
  const [venueId, setVenueId] = useState<string>(venues[0]?.id ?? "");
  const [showAll, setShowAll] = useState(false);

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

      {venues.length > 0 && (
        <div className="field">
          <label htmlFor="venue">Where are you?</label>
          <select id="venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
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

      <button className="btn btn-safe btn-block" disabled={busy} onClick={() => onLog("na-water", venue?.name)}>
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
