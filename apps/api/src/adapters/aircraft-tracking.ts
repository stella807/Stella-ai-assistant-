import type { AircraftFix, AircraftTrackingPort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Private aircraft positions, behind `AircraftTrackingPort`, from adsb.lol: a
 * volunteer network of ADS-B receivers whose data is published under the Open
 * Database License (ODbL 1.0), which allows commercial use with attribution.
 * That is why the attribution travels with every answer and is shown on screen.
 *
 * Chosen over the alternatives for a company's use: OpenSky's free API is for
 * research and non-commercial use, ADS-B Exchange needs a commercial license,
 * and FlightAware's AeroAPI bills per call. adsb.lol needs no key today; its
 * maintainers say a key earned by feeding the network may be required later,
 * which is what `ADSB_API_BASE` is for (point it at another
 * ADSBExchange-compatible host without code changes).
 *
 * The response is the readsb "aircraft" format (`{ ac: [...], now }`); the
 * mapping is one function, `mapReadsbAircraft`, so a field that turns out to
 * differ is a small fix.
 */

const BASE = (process.env.ADSB_API_BASE ?? "https://api.adsb.lol").replace(/\/$/, "");
const TIMEOUT_MS = 6000;
/** Answers are reused this long: a jet does not move far in 10 s, and a family refreshing together should not cost the volunteers ten calls. */
const CACHE_MS = 10_000;
const CACHE_LIMIT = 500;
/** readsb's database flag for aircraft on the FAA's LADD ("limit aircraft data displayed") list. */
const LADD_FLAG = 8;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** One aircraft record from the readsb format, as an `AircraftFix`; null if it is not a usable record. */
export function mapReadsbAircraft(raw: any, nowMs: number): AircraftFix | null {
  if (!raw || typeof raw.hex !== "string") return null;
  const tailNumber = (str(raw.r) ?? raw.hex).toUpperCase();
  const seen = num(raw.seen) ?? 0;
  const privacyLimited = ((num(raw.dbFlags) ?? 0) & LADD_FLAG) !== 0;
  if (privacyLimited) return { tailNumber, typeCode: str(raw.t), onGround: false, seenSecondsAgo: Math.round(seen), privacyLimited: true };

  const onGround = raw.alt_baro === "ground";
  let lat = num(raw.lat), lng = num(raw.lon), seenPos = num(raw.seen_pos);
  // No fresh position: readsb keeps the last one it had, with its own age.
  if ((lat === undefined || lng === undefined) && raw.lastPosition) {
    lat = num(raw.lastPosition.lat); lng = num(raw.lastPosition.lon); seenPos = num(raw.lastPosition.seen_pos);
  }
  const age = seenPos ?? seen;
  return {
    tailNumber,
    typeCode: str(raw.t),
    callsign: str(raw.flight),
    onGround,
    position: lat !== undefined && lng !== undefined
      ? {
        lat, lng,
        altitudeFt: onGround ? 0 : num(raw.alt_baro) ?? num(raw.alt_geom),
        groundSpeedKts: num(raw.gs),
        headingDeg: num(raw.track) ?? num(raw.true_heading),
        updatedAt: new Date(nowMs - age * 1000).toISOString(),
      }
      : undefined,
    verticalRateFpm: num(raw.baro_rate) ?? num(raw.geom_rate),
    squawk: str(raw.squawk),
    emergency: str(raw.emergency) && raw.emergency !== "none" ? raw.emergency : undefined,
    seenSecondsAgo: Math.round(age),
    privacyLimited: false,
  };
}

export function createAdsbAircraftTracking(opts: {
  base?: string; fetchImpl?: typeof fetch; clock?: () => number;
} = {}): AircraftTrackingPort {
  const base = (opts.base ?? BASE).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const clock = opts.clock ?? Date.now;
  const cache = new Map<string, { at: number; fix: AircraftFix | null }>();

  return {
    status: statusFor("aircraft-tracking", "adsb.lol", true, "Nothing: adsb.lol needs no key today."),
    attribution: { name: "adsb.lol", url: "https://adsb.lol", license: "ODbL 1.0" },

    async findByTail(tailNumber: string): Promise<AircraftFix | null> {
      const key = tailNumber.toUpperCase();
      const hit = cache.get(key);
      if (hit && clock() - hit.at < CACHE_MS) return hit.fix;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let data: any;
      try {
        const res = await doFetch(`${base}/v2/reg/${encodeURIComponent(key)}`, {
          headers: { accept: "application/json", "user-agent": "safehubby-flight-tracker" },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`adsb.lol answered ${res.status}`);
        data = await res.json();
      } finally {
        clearTimeout(timer);
      }

      const now = num(data?.now) ?? clock();
      const fixes = (Array.isArray(data?.ac) ? data.ac : [])
        .map((a: unknown) => mapReadsbAircraft(a, now))
        .filter((f: AircraftFix | null): f is AircraftFix => f !== null)
        // The freshest, if the same registration somehow shows up twice.
        .sort((a: AircraftFix, b: AircraftFix) => a.seenSecondsAgo - b.seenSecondsAgo);
      const fix = fixes[0] ?? null;

      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: clock(), fix });
      return fix;
    },
  };
}

export const aircraftTracking = createAdsbAircraftTracking();
