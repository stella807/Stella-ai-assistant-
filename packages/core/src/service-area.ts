/**
 * Where personal concierge actually operates right now: Puerto Rico, Texas,
 * and Los Angeles, and nowhere else — a deliberate, phased-rollout choice,
 * not a technical limitation the way an unconfigured provider is. Every
 * other feature in this app (rides, delivery, check-ins) stays available
 * everywhere; this gate is specific to dispatching a real person to someone
 * in person, which is exactly the feature that needs to start small.
 *
 * Bounds here are rectangular bounding boxes, not the real, irregular legal
 * boundaries of a state, territory, or city — said plainly because a box
 * around Texas includes a sliver of neighboring states, and a box around
 * Los Angeles is looser than the city's actual limits. That's an accepted
 * approximation for a v1 launch gate, not a claim of precision this doesn't
 * have. A real deployment should replace this with a proper geofencing or
 * reverse-geocoding service before launch numbers make the edges matter.
 */

export interface ServiceArea {
  id: string;
  label: string;
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export const LAUNCH_MARKETS: ServiceArea[] = [
  {
    id: "puerto-rico",
    label: "Puerto Rico",
    bounds: { minLat: 17.85, maxLat: 18.60, minLng: -67.95, maxLng: -65.20 },
  },
  {
    id: "texas",
    label: "Texas",
    bounds: { minLat: 25.84, maxLat: 36.50, minLng: -106.65, maxLng: -93.50 },
  },
  {
    id: "los-angeles",
    label: "Los Angeles",
    bounds: { minLat: 33.70, maxLat: 34.34, minLng: -118.67, maxLng: -118.15 },
  },
];

/** The launch market a location falls inside, or `null` outside all of them. */
export function launchMarketFor(at: { lat: number; lng: number }): ServiceArea | null {
  return LAUNCH_MARKETS.find((m) =>
    at.lat >= m.bounds.minLat && at.lat <= m.bounds.maxLat
    && at.lng >= m.bounds.minLng && at.lng <= m.bounds.maxLng) ?? null;
}

export function isInLaunchMarket(at: { lat: number; lng: number }): boolean {
  return launchMarketFor(at) !== null;
}

/** For an honest "not here yet" message — always the same list, in the same
 *  order, rather than reconstructed ad hoc at each call site. */
export function launchMarketNames(): string {
  return LAUNCH_MARKETS.map((m) => m.label).join(", ");
}
