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

/**
 * How old a location fix is, in plain words.
 *
 * A guardian was shown the clock time the fix was taken — "11:42 PM" — which
 * at 2am still reads like a location rather than like a three-hour-old one.
 * The arithmetic is left to a worried person in the middle of the night, and
 * they will not do it. The difference between "he is at the bar" and "he was
 * at the bar three hours ago" is the entire signal.
 */
export const FIX_STALE_AFTER_MINUTES = 20;

export function fixAgeMinutes(at: string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000));
}

export function describeFixAge(at: string, now: Date): string {
  const minutes = fixAgeMinutes(at, now);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "over an hour ago" : `${hours} hours ago`;
}

/** Old enough that the UI should say so rather than presenting it as current. */
export function isFixStale(at: string, now: Date): boolean {
  return fixAgeMinutes(at, now) >= FIX_STALE_AFTER_MINUTES;
}
