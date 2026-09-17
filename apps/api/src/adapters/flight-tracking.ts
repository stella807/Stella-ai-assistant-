import type { FlightInfo, FlightLookupInput, FlightStatus, FlightTrackingPort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Real flight lookup, behind `FlightTrackingPort`.
 *
 * Wired against AeroDataBox (reached via RapidAPI, https://rapidapi.com —
 * apply for a key there, no separate partner agreement needed, unlike
 * Uber for Business or the secure-transport port above it). Chosen over
 * FlightAware's own AeroAPI because it bundles schedule, status, gate/
 * terminal, aircraft registration, and a live position report in the one
 * response this needs — see `FlightInfo` in flight-tracking.ts for why
 * every one of those fields matters for an airport pickup, not just the
 * status.
 *
 * `AERODATABOX_API_BASE` defaults to RapidAPI's own host; set it to point
 * at a different reseller of the same API without code changes, the same
 * escape hatch `SECURE_TRANSPORT_API_BASE` gives the secure-transport port.
 *
 * The exact response shape below is built from AeroDataBox's published
 * docs, the same "verify against the real thing before going live" caveat
 * `adapters/fulfillment.ts` already carries for Uber's `POST /trips`: the
 * mapping lives in one function (`mapFlight`), so correcting a field name
 * once a real key is in hand is a few lines, not a rewrite.
 */

const AERODATABOX_KEY = process.env.AERODATABOX_API_KEY;
const AERODATABOX_HOST = process.env.AERODATABOX_API_HOST ?? "aerodatabox.p.rapidapi.com";
const AERODATABOX_BASE = process.env.AERODATABOX_API_BASE ?? `https://${AERODATABOX_HOST}`;
const TIMEOUT_MS = 6000;

async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "X-RapidAPI-Key": AERODATABOX_KEY!, "X-RapidAPI-Host": AERODATABOX_HOST },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const STATUS_MAP: Record<string, FlightStatus> = {
  scheduled: "scheduled",
  expected: "scheduled",
  boarding: "scheduled",
  departed: "active",
  enroute: "active",
  arrived: "landed",
  landed: "landed",
  canceled: "cancelled",
  cancelled: "cancelled",
  diverted: "diverted",
};

function mapAirportLeg(raw: any): {
  iata: string; name?: string; lat?: number; lng?: number; terminal?: string; gate?: string;
  scheduledTime: string; estimatedTime?: string; actualTime?: string;
} {
  return {
    iata: raw?.airport?.iata ?? "",
    name: raw?.airport?.name,
    lat: raw?.airport?.location?.lat,
    lng: raw?.airport?.location?.lon,
    terminal: raw?.terminal,
    gate: raw?.gate,
    scheduledTime: raw?.scheduledTime?.utc ?? raw?.scheduledTimeUtc,
    estimatedTime: raw?.revisedTime?.utc ?? raw?.predictedTime?.utc,
    actualTime: raw?.actualTime?.utc ?? raw?.runwayTime?.utc,
  };
}

function mapFlight(raw: any): FlightInfo {
  return {
    flightNumber: raw?.number ?? raw?.callSign ?? "",
    airlineName: raw?.airline?.name ?? "Unknown airline",
    airlineIata: raw?.airline?.iata ?? "",
    logoUrl: raw?.airline?.logoUrl,
    aircraftTailNumber: raw?.aircraft?.reg,
    aircraftType: raw?.aircraft?.model,
    status: STATUS_MAP[String(raw?.status ?? "").toLowerCase()] ?? "unknown",
    departure: mapAirportLeg(raw?.departure),
    arrival: mapAirportLeg(raw?.arrival),
    position: raw?.location
      ? {
        lat: raw.location.lat,
        lng: raw.location.lon,
        altitudeFt: raw.location.altitude?.feet,
        groundSpeedKts: raw.location.groundSpeed?.knots,
        headingDeg: raw.location.heading,
        updatedAt: raw.location.reportedAtUtc ?? new Date().toISOString(),
      }
      : undefined,
  };
}

export const flightTracking: FlightTrackingPort = {
  status: statusFor(
    "flight-tracking", "AeroDataBox", Boolean(AERODATABOX_KEY),
    "A RapidAPI account subscribed to AeroDataBox, then AERODATABOX_API_KEY.",
  ),

  async lookup(input: FlightLookupInput): Promise<FlightInfo | null> {
    if (!AERODATABOX_KEY) return null;
    const number = encodeURIComponent(input.flightNumber.trim().toUpperCase());
    const url = `${AERODATABOX_BASE.replace(/\/$/, "")}/flights/number/${number}/${input.date}`;
    try {
      const data = await getJson(url);
      const flights: any[] = Array.isArray(data) ? data : [data];
      if (flights.length === 0 || !flights[0]) return null;
      return mapFlight(flights[0]);
    } catch {
      // Unreachable or unrecognized means "we don't know", not a crash —
      // the same failure mode `secureTransport.quote` treats as no coverage.
      return null;
    }
  },
};
