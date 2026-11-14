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
  /** Who the positions come from and under what license; shown wherever they are. */
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

/**
 * Where something moving on a steady heading and speed will be after a number
 * of seconds, along a great circle. Used to keep a plane moving on the map
 * between position reports, the way the moving maps on board do; the next
 * report always corrects it.
 */
export function projectPosition(lat: number, lng: number, headingDeg: number, speedKts: number, seconds: number): { lat: number; lng: number } {
  const rad = Math.PI / 180;
  const d = (speedKts * seconds) / 3600 / 3440.065; // nautical miles over the earth's radius in nautical miles
  const p1 = lat * rad, l1 = lng * rad, th = headingDeg * rad;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / rad, lng: ((l2 / rad + 540) % 360) - 180 };
}

/**
 * Plain names for the ICAO type designators of the aircraft most often seen on
 * private and charter flights, plus a few airliners. Anything not listed is
 * shown as its code.
 */
const TYPE_NAMES: Record<string, string> = {
  GLF4: "Gulfstream IV", GLF5: "Gulfstream V / G550", GLF6: "Gulfstream G650", GA5C: "Gulfstream G500", GA6C: "Gulfstream G600",
  GA7C: "Gulfstream G700", G280: "Gulfstream G280", GALX: "Gulfstream G200",
  CL30: "Challenger 300", CL35: "Challenger 350", CL60: "Challenger 600 series", GL5T: "Global 5000 / 5500",
  GLEX: "Global Express / 6000", GL7T: "Global 7500",
  F2TH: "Falcon 2000", FA50: "Falcon 50", F900: "Falcon 900", FA7X: "Falcon 7X", FA8X: "Falcon 8X", FA6X: "Falcon 6X",
  C510: "Citation Mustang", C525: "CitationJet", C25A: "Citation CJ2", C25B: "Citation CJ3", C25C: "Citation CJ4",
  C560: "Citation V / Ultra / Encore", C56X: "Citation Excel / XLS", C680: "Citation Sovereign", C68A: "Citation Latitude",
  C700: "Citation Longitude", C750: "Citation X",
  E50P: "Phenom 100", E55P: "Phenom 300", E545: "Praetor 500 / Legacy 450", E550: "Praetor 600 / Legacy 500", E35L: "Legacy 600 / 650",
  LJ45: "Learjet 45", LJ60: "Learjet 60", LJ75: "Learjet 75", HDJT: "HondaJet", PC12: "Pilatus PC-12", PC24: "Pilatus PC-24",
  BE40: "Beechjet 400 / Hawker 400", H25B: "Hawker 800 series", B350: "King Air 350",
  A320: "Airbus A320", A321: "Airbus A321", B738: "Boeing 737-800", B38M: "Boeing 737 MAX 8", E75L: "Embraer 175",
};

export function aircraftTypeName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return TYPE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * A private flight an assistant has put on a client's tracker map, once it is
 * booked: the jet's tail number, and where and when it goes, as the assistant
 * wrote them. Kept on the concierge task the booking belongs to.
 */
export interface TrackedAircraft {
  tailNumber: string;
  /** Where it leaves from and where it goes: an airport code ("SJU", "KTEB") or a short name. */
  from?: string;
  to?: string;
  /** When it is due to leave, ISO 8601. */
  departsAt?: string;
  sharedAt: string;
}

const PLACE = /^[\p{L}\p{N} .,'()/-]{2,40}$/u;

/** An assistant's form, checked and tidied into a `TrackedAircraft`, or what to fix. */
export function readTrackedAircraft(input: unknown, now: Date):
  | { ok: true; value: TrackedAircraft }
  | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const tailNumber = normalizeTailNumber(typeof raw.tailNumber === "string" ? raw.tailNumber : "");
  if (!tailNumber) return { ok: false, error: "Enter the jet's tail number, like N123AB." };
  const place = (key: "from" | "to"): string | undefined | null => {
    const v = typeof raw[key] === "string" ? (raw[key] as string).trim().replace(/\s+/g, " ") : "";
    if (!v) return undefined;
    if (!PLACE.test(v)) return null;
    // An airport code reads in capitals; a place name is left as written.
    return /^[A-Za-z]{3,4}$/.test(v) ? v.toUpperCase() : v;
  };
  const from = place("from");
  if (from === null) return { ok: false, error: "Write where it leaves from as an airport code or a short place name." };
  const to = place("to");
  if (to === null) return { ok: false, error: "Write where it lands as an airport code or a short place name." };
  let departsAt: string | undefined;
  if (typeof raw.departsAt === "string" && raw.departsAt.trim()) {
    const t = Date.parse(raw.departsAt);
    if (!Number.isFinite(t)) return { ok: false, error: "The departure time is not a date and time." };
    departsAt = new Date(t).toISOString();
  }
  return {
    ok: true,
    value: {
      tailNumber,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(departsAt ? { departsAt } : {}),
      sharedAt: now.toISOString(),
    },
  };
}

/** How long a shared flight stays on the client's map after its departure (or after it was shared, if later) once the task is finished. */
export const SHARED_FLIGHT_KEEP_HOURS = 48;

/** Whether a shared flight still belongs on the client's map: always while the task is open, never once it is cancelled, and for a while after it is done. */
export function isSharedFlightCurrent(shared: TrackedAircraft, taskStatus: string, now: Date): boolean {
  if (taskStatus === "canceled") return false;
  if (taskStatus === "in-progress") return true;
  const since = Math.max(Date.parse(shared.sharedAt), shared.departsAt ? Date.parse(shared.departsAt) : 0);
  return now.getTime() - since < SHARED_FLIGHT_KEEP_HOURS * 3_600_000;
}
