/**
 * Distance between two fixes, and what counts as having moved.
 *
 * Shared because three places need it: the venue search (have you changed
 * bar?), the mock location provider, and anything later that asks how far
 * someone has drifted from where they said they were.
 */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function metersBetween(a: Point, b: Point): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * How far someone moves before the venue list is worth fetching again.
 *
 * 200m is roughly "you left and went somewhere else" rather than "you walked
 * to the other end of the bar". It is deliberately not smaller: Places bills
 * per search and rate-limits per hour, and a GPS fix jitters by tens of metres
 * while a phone sits still on a table. Re-searching on every tick would spend
 * the night's request budget standing in one place.
 */
export const VENUE_RESEARCH_METERS = 200;

export function hasMovedVenue(from: Point | null, to: Point): boolean {
  if (!from) return true;
  return metersBetween(from, to) >= VENUE_RESEARCH_METERS;
}
