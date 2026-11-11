import type { FlightPosition } from "./flight-tracking.ts";
import type { ProviderStatus } from "./fulfillment.ts";

/**
 * Following one private aircraft by its registration ("tail number").
 *
 * The airline lookup in flight-tracking.ts works from a flight number and a
 * date, which is how airlines publish. A private jet has neither in any useful
 * sense: a charter may fly under the operator's callsign or none, on no
 * published schedule. What it always has is the registration painted on its
 * tail, and while it flies it broadcasts its position over ADS-B. So this asks
 * "where is that airframe right now", not "how is that flight doing".
 */
export interface AircraftFix {
  /** As the data reports it, which may differ in form from what was typed (a hyphen added, say). */
  tailNumber: string;
  /** ICAO type designator, e.g. "GLF6" for a Gulfstream G650. */
  typeCode?: string;
  /** The callsign it is flying under, when it sends one. */
  callsign?: string;
  onGround: boolean;
  /** Absent when it has been heard but has given no position. */
  position?: FlightPosition;
  verticalRateFpm?: number;
  squawk?: string;
  /** The emergency the aircraft itself is declaring, when it declares one. */
  emergency?: string;
  /** How long since the position (or, without one, any message) was heard. */
  seenSecondsAgo: number;
  /**
   * The owner has asked for the aircraft to be kept off public displays (the
   * FAA's LADD list). We honour that: no position or callsign is passed on,
   * only the fact that it is there.
   */
  privacyLimited: boolean;
}

export interface AircraftTrackingPort {
  readonly status: ProviderStatus;
  /** Who the positions come from and under what licence; shown wherever they are. */
  readonly attribution: { name: string; url: string; license: string };
  /** Null when nothing with that registration is being heard right now. Throws when the source itself fails. */
  findByTail(tailNumber: string): Promise<AircraftFix | null>;
}

/**
 * A typed registration, uppercased with spaces removed, or null when it cannot
 * be one: 2–10 characters of letters, digits and hyphens, at least one letter,
 * starting with a letter or digit. Hyphens are kept as typed, because "HB-JFN"
 * is how the Swiss register is written and the data matches on it.
 */
export function normalizeTailNumber(input: string): string | null {
  const t = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9][A-Z0-9-]{1,9}$/.test(t)) return null;
  if (!/[A-Z]/.test(t)) return null;
  return t;
}

/** Silent for longer than this, a position is "last seen", not "now". */
export const AIRCRAFT_STALE_SECONDS = 60;

export type AircraftState = "airborne" | "on-ground" | "last-seen" | "private";

export function aircraftState(fix: AircraftFix): AircraftState {
  if (fix.privacyLimited) return "private";
  if (fix.seenSecondsAgo > AIRCRAFT_STALE_SECONDS) return "last-seen";
  return fix.onGround ? "on-ground" : "airborne";
}

export function knotsToMph(knots: number): number {
  return Math.round(knots * 1.15078);
}
