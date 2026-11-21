/**
 * Live answers from free public sources, so nothing here needs a person: the National Weather Service's active alerts for
 * Puerto Rico, the GOES-East weather satellite's latest pictures of Puerto Rico and the National Hurricane Center's active storms
 * (both NOAA), and the FAA's airport status (delays, ground programs, closures). For airports it also looks ahead: the airport's
 * forecast (TAF, from the Aviation Weather Center), the FAA's plan for the day (what it calls possible), big airports delayed now
 * (a flight from one can arrive late), and for Puerto Rico the hurricane center's chances of a storm forming. It also reads the airport's
 * latest observation (METAR): lightning near the field stops ground crews, which stalls departures before any delay is posted. And it
 * answers power questions for Puerto Rico from LUMA's public outage map, including load shedding (planned rolling cuts). Every answer names its source and says when it
 * was read. An answer is never made up: a source that is down, or a question no source covers, gives no answer and no charge.
 * A real search that finds nothing (no pharmacy on the map near a real place) is charged, and says so (found: false).
 * A copy is kept for five minutes so many agents asking at once do not hammer the sources; if a source is down, a copy up to
 * fifteen minutes old may still be served, and no older one.
 */
import { AIRPORTS } from "@safehubby/core";
import { historyFor, historySignals } from "./airport-history.ts";

type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
/** For tests: replace the network. Called with nothing, it goes back to the real one. */
export const setLiveFetcher = (f?: Fetcher) => { fetcher = f ?? ((url, init) => fetch(url, init)); };

const FRESH_MS = 5 * 60_000;
const STALE_OK_MS = 15 * 60_000;
const TIMEOUT_MS = 5000;
const cache = new Map<string, { at: number; text: string }>();
export const clearLiveCache = () => cache.clear();

/** The source's text: a copy under five minutes old, else a new read, else (source down) a copy under fifteen minutes old. */
async function read(url: string, headers: Record<string, string>, now: Date, timeoutMs = TIMEOUT_MS): Promise<string | null> {
  const hit = cache.get(url);
  if (hit && now.getTime() - hit.at < FRESH_MS) return hit.text;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    cache.set(url, { at: now.getTime(), text });
    return text;
  } catch {
    return hit && now.getTime() - hit.at < STALE_OK_MS ? hit.text : null;
  } finally { clearTimeout(timer); }
}

/** When a file was last made, from its Last-Modified header, cached like a read. Used for satellite pictures, which are not downloaded. */
async function madeAt(url: string, now: Date): Promise<string | null> {
  const key = `HEAD ${url}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < FRESH_MS) return hit.text || null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, { method: "HEAD", headers: { "user-agent": "safehubby.com" }, signal: controller.signal });
    if (!res.ok) throw new Error(String(res.status));
    const at = iso(res.headers.get("last-modified")) ?? "";
    cache.set(key, { at: now.getTime(), text: at });
    return at || null;
  } catch {
    return hit && now.getTime() - hit.at < STALE_OK_MS ? hit.text || null : null;
  } finally { clearTimeout(timer); }
}

/** OpenStreetMap's search (Nominatim): free, ODbL data, at most one request a second, so calls wait their turn. */
import { ADVISORY_URL, BUOY_URL, CDC_URL, QUAKE_URL, RIVER_URL, TIDE_URL, noticesFor, parseBuoy, parseNotices, parseQuakes, parseRivers, parseTide } from "./live-sources.ts";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
let nominatimGapMs = 1100;
let nominatimLast = 0;
/** For tests: no waiting between calls. */
export const setNominatimGap = (ms: number) => { nominatimGapMs = ms; };
async function nominatim(params: string, now: Date): Promise<string | null> {
  const url = `${NOMINATIM}?${params}&format=jsonv2`;
  const hit = cache.get(url);
  if (!hit || now.getTime() - hit.at >= FRESH_MS) {
    const wait = nominatimLast + nominatimGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nominatimLast = Date.now();
  }
  return read(url, { "user-agent": "safehubby.com", "accept-language": "es,en" }, now);
}

const NWS_URL = "https://api.weather.gov/alerts/active?area=PR";
const FAA_URL = "https://nasstatus.faa.gov/api/airport-status-information";
const PLAN_URL = "https://nasstatus.faa.gov/api/operations-plan";
const TAF_URL = (ids: string[]) => `https://aviationweather.gov/api/data/taf?ids=${ids.join(",")}&format=json`;
const GTWO_URL = "https://www.nhc.noaa.gov/gtwo.xml";
/** Big US airports: a delay at one now can make a flight from there arrive late anywhere. */
const HUBS = ["ATL", "BOS", "BWI", "CLT", "DCA", "DEN", "DFW", "DTW", "EWR", "FLL", "IAD", "IAH", "JFK", "LAS", "LAX", "LGA", "MCO", "MIA", "MSP", "ORD", "PHL", "PHX", "SEA", "SFO", "TPA"];
const METAR_URL = (ids: string[]) => `https://aviationweather.gov/api/data/metar?ids=${ids.join(",")}&hours=2&format=json`;
const EVENTS_URL = "https://nasstatus.faa.gov/api/airport-events";
const LUMA_URL = "https://api.miluma.lumapr.com/miluma-outage-api/outage/regionsWithoutService";
const CRUISE_URL = (from: string, to: string, start: number) => `https://sanjuancruiseport.com/wp-content/themes/mbcglobalports/includes/api/schedule.php?startIndex=${start}&site_id=40&lang=en&param2=${from}&param4=${to}`;
const NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
/** GOES-19 is the GOES-East satellite; NOAA publishes its latest pictures of the Puerto Rico sector at these fixed addresses. */
const SAT_BASE = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/pr";
const SAT_IMAGES = { geocolor: { band: "GEOCOLOR", what: "True color by day, clouds and city lights by night" }, infrared: { band: "13", what: "Clean infrared: cloud tops, day and night" } } as const;
const PUERTO_RICO = { lat: 18.22, lng: -66.5 };

/** No links or phone numbers from outside text: the house rule for everything sold here. */
const scrub = (t: unknown, max: number) => String(t ?? "").replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const iso = (v: unknown) => { const d = new Date(String(v ?? "")); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export interface WeatherAlert { id: string; event: string; severity: string; headline: string; area: string; issuedBy: string; sent: string | null; expires: string | null }

export function parseNws(text: string): WeatherAlert[] {
  let data: any;
  try { data = JSON.parse(text); } catch { return []; }
  return (Array.isArray(data?.features) ? data.features : []).slice(0, 25).map((f: any): WeatherAlert => {
    const p = f?.properties ?? {};
    return { id: scrub(p.id, 120), event: scrub(p.event, 80), severity: scrub(p.severity, 20), headline: scrub(p.headline, 200), area: scrub(p.areaDesc, 200), issuedBy: scrub(p.senderName, 80), sent: iso(p.sent), expires: iso(p.expires ?? p.ends) };
  });
}

const STORM_TYPES: Record<string, string> = { TD: "Tropical depression", STD: "Subtropical depression", TS: "Tropical storm", STS: "Subtropical storm", HU: "Hurricane", MH: "Major hurricane", PTC: "Potential tropical cyclone", PC: "Post-tropical cyclone" };
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(12_742 * Math.asin(Math.sqrt(h)));
};
const num = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export interface Storm { id: string; name: string; type: string; windKnots: number | null; pressureMb: number | null; latitude: number | null; longitude: number | null; kmFromPuertoRico: number | null; movementDegrees: number | null; movementSpeed: number | null; lastUpdate: string | null }

/** Active storms from the National Hurricane Center, each with how far it is from Puerto Rico. Its advisory links are left out. */
export function parseStorms(text: string): Storm[] | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(data?.activeStorms)) return null;
  return data.activeStorms.slice(0, 20).map((s: any): Storm => {
    const lat = num(s.latitudeNumeric), lng = num(s.longitudeNumeric);
    const code = scrub(s.classification, 10).toUpperCase();
    return {
      id: scrub(s.id, 20), name: scrub(s.name, 40), type: STORM_TYPES[code] ?? code, windKnots: num(s.intensity), pressureMb: num(s.pressure),
      latitude: lat, longitude: lng, kmFromPuertoRico: lat === null || lng === null ? null : km(PUERTO_RICO, { lat, lng }),
      movementDegrees: num(s.movementDir), movementSpeed: num(s.movementSpeed), lastUpdate: iso(s.lastUpdate),
    };
  });
}

/** The weather station code for an airport's forecast: K plus the code in the lower 48, and the island and Pacific ones by name. */
const ICAO: Record<string, string> = { SJU: "TJSJ", BQN: "TJBQ", PSE: "TJPS", VQS: "TJVQ", CPX: "TJCP", MAZ: "TJMZ", STT: "TIST", STX: "TISX", HNL: "PHNL", OGG: "PHOG", KOA: "PHKO", LIH: "PHLI", ANC: "PANC", FAI: "PAFA", JNU: "PAJN", GUM: "PGUM" };
export const icaoFor = (code: string) => ICAO[code.toUpperCase()] ?? `K${code.toUpperCase()}`;

export interface Hazard { from: string; to: string; chancePercent: number | null; what: string[] }

/** What in the next 24 hours of an airport's forecast tends to slow flights: storms, low cloud, poor visibility, strong wind. */
export function forecastHazards(text: string, icao: string, now: Date): { station: string; issuedAt: string | null; hazards: Hazard[] } | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  const taf = Array.isArray(data) ? data.find((t: any) => t?.icaoId === icao) : null;
  if (!taf || !Array.isArray(taf.fcsts)) return null;
  const end = now.getTime() + 24 * 3_600_000;
  const hazards: Hazard[] = [];
  for (const f of taf.fcsts) {
    const from = Number(f.timeFrom) * 1000, to = Number(f.timeTo) * 1000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= now.getTime() || from >= end) continue;
    const wx = String(f.wxString ?? "");
    const visib = typeof f.visib === "number" ? f.visib : Number.parseFloat(String(f.visib ?? "").replace("+", ""));
    const ceiling = Math.min(...(Array.isArray(f.clouds) ? f.clouds : []).filter((c: any) => /BKN|OVC|OVX/.test(c?.cover)).map((c: any) => Number(c.base)).filter(Number.isFinite), f.vertVis ? Number(f.vertVis) * 100 : Infinity);
    const what: string[] = [];
    if (/TS/.test(wx)) what.push("thunderstorms");
    if (ceiling < 1000) what.push("low clouds");
    if (Number.isFinite(visib) && visib < 3) what.push("low visibility");
    if (/SN|FZ|PL|GR/.test(wx)) what.push("snow, ice or hail");
    if (Number(f.wgst) >= 30) what.push(`gusts to ${Number(f.wgst)} knots`);
    else if (Number(f.wspd) >= 25) what.push(`wind ${Number(f.wspd)} knots`);
    if (what.length) hazards.push({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), chancePercent: num(f.probability), what });
  }
  return { station: icao, issuedAt: iso(taf.issueTime), hazards };
}

export interface AtTheField { station: string; observedAt: string | null; ageMinutes: number | null; flightCategory: string | null; lightning: boolean; thunderstorm: boolean; specialReportsLastHour: number; observation: string }

/**
 * The airport's latest observation. Lightning near the field matters most: ground crews stop work outside when it is close, so
 * departures stall before the FAA posts any delay. Special reports (SPECI) are issued when the weather changes fast.
 */
export function atTheField(text: string, icao: string, now: Date): AtTheField | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  const obs = (Array.isArray(data) ? data : []).filter((m: any) => m?.icaoId === icao).sort((a: any, b: any) => String(b.reportTime).localeCompare(String(a.reportTime)));
  const latest = obs[0];
  if (!latest) return null;
  // TSNO is a remark that the thunderstorm sensor is off, not a thunderstorm.
  const raw = scrub(latest.rawOb, 300).replace(/\bTSNO\b/g, "");
  const main = raw.split(" RMK ")[0]!;
  const at = iso(latest.reportTime);
  return {
    station: icao, observedAt: at, ageMinutes: at ? Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60_000)) : null,
    flightCategory: latest.fltCat ? scrub(latest.fltCat, 6) : null,
    lightning: /\bLTG|\bTS|VCTS|TSB\d/.test(raw), thunderstorm: /(^|\s)[+-]?(VC)?TS/.test(main) || /\bCB\b|\d{3}CB/.test(main),
    specialReportsLastHour: obs.filter((m: any) => m.metarType === "SPECI" && now.getTime() - new Date(m.reportTime).getTime() <= 3_600_000).length,
    observation: raw,
  };
}

/** The arrival rate and runways the FAA has set for an airport, when it publishes them (mostly for the larger ones). */
export function faaRates(text: string, code: string) {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  const c = (Array.isArray(data) ? data : []).find((e: any) => e?.airportId === code)?.airportConfig;
  if (!c) return null;
  return { arrivalsPerHour: num(c.arrivalRate), arrivalRunways: scrub(c.arrivalRunwayConfig, 40), departureRunways: scrub(c.departureRunwayConfig, 40), setAt: iso(c.sourceTimeStamp) };
}

export interface PowerRegion { name: string; customers: number; withoutPower: number; percentWithoutPower: number; plannedOutage: number; loadShed: number }

export function parseLuma(text: string): PowerRegion[] | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(data?.regions)) return null;
  return data.regions.slice(0, 20).map((r: any): PowerRegion => ({
    name: scrub(r.name, 40), customers: num(r.totalClients) ?? 0, withoutPower: num(r.totalClientsWithoutService) ?? 0,
    percentWithoutPower: num(r.percentageClientsWithoutService) ?? 0, plannedOutage: num(r.totalClientsAffectedByPlannedOutage) ?? 0, loadShed: num(r.totalClientsAffectedByLoadShed) ?? 0,
  })).sort((a: PowerRegion, b: PowerRegion) => b.withoutPower - a.withoutPower);
}

export interface CruiseCall { ship: string; line: string; berth: string; arrives: string | null; departs: string | null }
const MONTH_NUM: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** "21 Nov 2026 | 05:00" in Puerto Rico time (UTC minus 4, all year) to UTC. */
const prTime = (t: string) => {
  const m = /(\d{1,2})\s+(\w{3})\w*\s+(\d{4})\s*\|\s*(\d{1,2}):(\d{2})/.exec(t);
  const mon = m ? MONTH_NUM[m[2]!.toLowerCase()] : undefined;
  return m && mon !== undefined ? new Date(Date.UTC(Number(m[3]), mon, Number(m[1]), Number(m[4]) + 4, Number(m[5]))).toISOString() : null;
};

/** The port operator's schedule rows: ship, line, berth, arrival and departure. */
export function parseCruise(html: string): CruiseCall[] {
  const field = (row: string, cls: string) => scrub((new RegExp(`class="${cls}">([\\s\\S]*?)</div>(?=<div class=|</div>|$)`).exec(row)?.[1] ?? "").replace(/<div class="hide-mobile[^"]*">[^<]*<\/div>/g, "").replace(/<[^>]+>/g, " "), 80);
  return html.split('class="schedule-item-row"').slice(1, 60).map((row) => ({
    ship: field(row, "shipname"), line: field(row, "cruiseline"), berth: field(row, "berth"), arrives: prTime(field(row, "eta")), departs: prTime(field(row, "etd")),
  // The schedule also lists the ferry to the Dominican Republic; it is not a cruise ship.
  })).filter((c) => c.ship && !/ferr/i.test(c.line));
}

/** Puerto Rico's local date, n days from now, as YYYY-MM-DD. */
const prDate = (now: Date, n = 0) => new Date(now.getTime() - 4 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Cruise ships in San Juan today and the next two days, from San Juan Cruise Port's public schedule. Its terms do not allow
 * commercial reuse without written consent, so it stays off until CRUISE_SCHEDULE_ENABLED=1 is set after the port agrees.
 */
async function cruiseReport(now: Date) {
  if (process.env.CRUISE_SCHEDULE_ENABLED?.trim() !== "1") return { enabled: false as const, note: "Cruise ships in port are left out until San Juan Cruise Port gives written permission to use its schedule." };
  const from = prDate(now), to = prDate(now, 2);
  const calls: CruiseCall[] = [];
  for (let start = 0; start < 50; start += 10) {
    const page = await read(CRUISE_URL(from, to, start), { "user-agent": "safehubby.com" }, now);
    if (page === null) return null;
    const rows = parseCruise(page);
    calls.push(...rows);
    if (rows.length < 10) break;
  }
  const days = [0, 1, 2].map((n) => {
    const date = prDate(now, n);
    const dayStart = Date.parse(`${date}T04:00:00Z`), dayEnd = dayStart + 86_400_000;
    const ships = calls.filter((c) => c.arrives && c.departs && Date.parse(c.arrives) < dayEnd && Date.parse(c.departs) > dayStart);
    return { date, shipsInPort: ships.length, ships };
  });
  return { enabled: true as const, source: "San Juan Cruise Port schedule", days, note: "Ships in port each day, Puerto Rico time. On busy cruise days passengers fly in and out of SJU and the roads near the piers fill up." };
}

/** Puerto Rico's 78 towns, for finding the place in a question when the rest of it is not a place. */
const PR_TOWNS = ["adjuntas", "aguada", "aguadilla", "aguas buenas", "aibonito", "anasco", "arecibo", "arroyo", "barceloneta", "barranquitas", "bayamon", "cabo rojo", "caguas", "camuy", "canovanas", "carolina", "catano", "cayey", "ceiba", "ciales", "cidra", "coamo", "comerio", "corozal", "culebra", "dorado", "fajardo", "florida", "guanica", "guayama", "guayanilla", "guaynabo", "gurabo", "hatillo", "hormigueros", "humacao", "isabela", "jayuya", "juana diaz", "juncos", "lajas", "lares", "las marias", "las piedras", "loiza", "luquillo", "manati", "maricao", "maunabo", "mayaguez", "moca", "morovis", "naguabo", "naranjito", "orocovis", "patillas", "penuelas", "ponce", "quebradillas", "rincon", "rio grande", "sabana grande", "salinas", "san german", "san juan", "san lorenzo", "san sebastian", "santa isabel", "toa alta", "toa baja", "trujillo alto", "utuado", "vega alta", "vega baja", "vieques", "villalba", "yabucoa", "yauco"];
const inPR = (lat: number, lon: number) => lat > 17.8 && lat < 18.6 && lon > -67.4 && lon < -65.2;

/**
 * Whether an OpenStreetMap opening_hours value says open at this moment, in Puerto Rico time. Understands the common forms
 * ("24/7", "Mo-Fr 08:00-21:00; Sa 09:00-18:00; Su off", hours past midnight); anything else is null, never a guess.
 */
export function openNow(hours: string | undefined, now: Date): boolean | null {
  if (!hours) return null;
  const h = hours.trim();
  if (h === "24/7") return true;
  const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const local = new Date(now.getTime() - 4 * 3_600_000);
  const day = (local.getUTCDay() + 6) % 7, minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const rules: { days: Set<number>; spans: [number, number][] }[] = [];
  for (const part of h.split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = /^((?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su|PH))*)\s+(off|closed|(?:\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:,\s*)?)+)$/.exec(part);
    if (!m) return null;
    const days = new Set<number>();
    for (const piece of m[1]!.split(",")) {
      if (piece === "PH") continue;
      const [a, b] = piece.split("-");
      const from = DAYS.indexOf(a!), to = b ? DAYS.indexOf(b) : from;
      for (let d = from; ; d = (d + 1) % 7) { days.add(d); if (d === to) break; }
    }
    const spans: [number, number][] = /off|closed/.test(m[2]!) ? [] : m[2]!.split(",").map((r) => r.trim()).map((r) => {
      const [a, b] = r.split("-"); const t = (x: string) => Number(x.split(":")[0]) * 60 + Number(x.split(":")[1]);
      return [t(a!), t(b!)];
    });
    rules.push({ days, spans });
  }
  // A later rule for the same day replaces an earlier one, as in OpenStreetMap.
  const spansFor = (d: number) => rules.filter((r) => r.days.has(d)).pop()?.spans ?? [];
  if (spansFor(day).some(([a, b]) => (b > a ? minute >= a && minute < b : minute >= a))) return true;
  const yesterday = (day + 6) % 7;
  return spansFor(yesterday).some(([a, b]) => b <= a && minute < b);
}

export interface Pharmacy { name: string; address: string; distanceKm: number; phone: string | null; hours: string | null; openNow: boolean | null; map: string }

export interface PlanItem { when: string; what: string }

/** The FAA's operations plan for the day: what it expects or calls possible. Its link is left out. */
export function parsePlan(text: string): PlanItem[] | null {
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  return [...(data.terminalPlanned ?? []), ...(data.enRoutePlanned ?? [])].slice(0, 40).map((e: any): PlanItem => {
    const [when, what] = String(e?.event ?? "").split(/\t-?/);
    return what === undefined ? { when: "", what: scrub(when, 160) } : { when: scrub(when, 40), what: scrub(what, 160) };
  }).filter((e) => e.what);
}

/** The hurricane center's Atlantic outlook: each area it watches, with its chances of a storm forming in 2 and 7 days. */
export function parseOutlook(xml: string): { systems: { text: string; chance48hPercent: number; chance7dPercent: number }[]; note: string } | null {
  const item = /Atlantic Tropical Weather Outlook[\s\S]*?<description>([\s\S]*?)<\/description>/i.exec(xml)?.[1];
  if (!item) return null;
  const text = item.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").split("&&")[0]!;
  const body = text.split(/Gulf of America:|Caribbean Sea:/i).slice(1).join(" ") || text;
  const clean = (t: string) => scrub(t.replace(/\b[\w.-]+\.(gov|com|org|net)\S*/gi, ""), 400);
  const systems = [...body.matchAll(/([^*]*?)\*\s*Formation chance through 48 hours\.+\w+\.+(\d+) percent\.\s*\*\s*Formation chance through 7 days\.+\w+\.+(\d+) percent\./gi)]
    .map((m) => ({ text: clean(m[1]!), chance48hPercent: Number(m[2]), chance7dPercent: Number(m[3]) }));
  return { systems, note: systems.length ? "" : clean(body).slice(0, 200) };
}

export interface AirportIssue { kind: string; reason: string; average?: string; max?: string; trend?: string; reopens?: string; ends?: string }

const tag = (block: string, name: string) => scrub(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block)?.[1], 200);
const blocks = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "gi"))].map((m) => m[1]!);

/** The FAA lists only airports that have something to report, so an airport that is not in it has no listed delay. Null when the page is not the feed. */
export function parseFaa(xml: string, code: string): { updatedAt: string | null; issues: AirportIssue[] } | null {
  if (!/<AIRPORT_STATUS_INFORMATION/i.test(xml)) return null;
  const mine = (b: string) => tag(b, "ARPT").toUpperCase() === code.toUpperCase();
  const issues: AirportIssue[] = [];
  for (const b of blocks(xml, "Ground_Delay").filter(mine)) issues.push({ kind: "ground delay program", reason: tag(b, "Reason"), average: tag(b, "Avg"), max: tag(b, "Max") });
  for (const b of blocks(xml, "Delay").filter(mine)) issues.push({ kind: `${(/Type="(\w+)"/i.exec(b)?.[1] ?? "arrival/departure").toLowerCase()} delay`, reason: tag(b, "Reason"), average: tag(b, "Min"), max: tag(b, "Max"), trend: tag(b, "Trend") });
  for (const b of blocks(xml, "Program").filter(mine)) issues.push({ kind: "ground stop", reason: tag(b, "Reason"), ends: tag(b, "End_Time") });
  for (const b of blocks(xml, "Airport").filter(mine)) issues.push({ kind: "closure", reason: tag(b, "Reason"), reopens: tag(b, "Reopen") });
  return { updatedAt: iso(tag(xml, "Update_Time")), issues };
}

/** The airports the FAA feed can say anything about: those in the United States and Puerto Rico. */
const PR_NAMES: Record<string, string> = { sju: "san juan", bqn: "aguadilla", pse: "ponce", vqs: "vieques", cpx: "culebra", maz: "mayaguez" };
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const KNOWN = new Map<string, { code: string; us: boolean }>();
for (const e of AIRPORTS) for (const a of e.airports) KNOWN.set(a.code.toLowerCase(), { code: a.code.toUpperCase(), us: e.country === "United States" || e.country === "Puerto Rico" });
for (const code of Object.keys(PR_NAMES)) KNOWN.set(code, { code: code.toUpperCase(), us: true });
const CITY_CODES: [string, string[]][] = [
  ...Object.entries(PR_NAMES).map(([code, city]): [string, string[]] => [city, [code.toUpperCase()]]),
  ...AIRPORTS.filter((e) => e.country === "United States").map((e): [string, string[]] => [plain(e.city), e.airports.map((a) => a.code.toUpperCase())]),
];
const WEATHER = /\b(satellites?|satelites?|clouds?|nubes|cyclones?|ciclon(?:es)?|storms?|hurricanes?|tropical|weather|floods?|flooding|alerts?|warnings?|advisor(?:y|ies)|rain|tormentas?|huracan(?:es)?|inundacion(?:es)?|lluvia|alertas?|avisos?|clima)\b/;
const PHARMACY = /\b(pharmac(?:y|ies)|farmacias?|walgreens|cvs|drugstores?|boticas?)\b/;
const FILLER = new Set(["near", "nearest", "closest", "close", "in", "at", "by", "to", "the", "a", "an", "is", "are", "any", "open", "opened", "now", "today", "tonight", "right", "which", "what", "where", "around", "of", "cerca", "mas", "de", "del", "en", "la", "el", "los", "las", "un", "una", "abierta", "abiertas", "abierto", "abiertos", "hoy", "ahora", "hay", "esta", "estan", "que", "cual", "donde", "alrededor", "puerto", "rico", "pr"]);
const POWER = /\b(power|outages?|electricity|blackouts?|luma|luz|apagon(?:es)?|energia|electrica|sin servicio)\b/;
const AIRPORT_WORD = /\b(airports?|aeropuertos?|flights?|vuelos?|delays?|delayed|retrasos?|retrasado|ground (stop|delay)|closure|closed)\b/;

/** Power alone is one source, so it costs less than the weather bundle or an airport answer. */
export const isPowerOnly = (q: string) => routeLive(q)?.source === "power";

export type Route = { source: "weather"; place?: string } | { source: "power" } | { source: "pharmacy"; place: string } | { source: "airport"; codes: string[] }
  | { source: "quake" } | { source: "sea" } | { source: "river" } | { source: "advisory"; place: string } | { source: "health"; place: string };

const QUAKE = /\b(earthquakes?|quakes?|seismic|sismos?|temblor(?:es)?|terremotos?)\b/;
const SEA = /\b(tides?|mareas?|waves?|olas|oleaje|surf|swells?|marejadas?|buoys?|boyas?)\b/;
// No bare "rio": it is part of town names (Rio Grande).
const RIVER = /\b(rivers?|river levels?|streams?|stream gauges?|quebradas?|niveles? de (?:los )?rios?|rios? crecidos?)\b/;
const ADVISORY = /\b(travel advisor(?:y|ies)|state department|advertencias? de viaje|alertas? de viaje|safe to travel)\b/;
const HEALTH = /\b(cdc|travel health|health notices?|outbreaks?|brotes?|travel vaccines?|vacunas para viajar)\b/;
const NOTICE_FILLER = new Set([...FILLER, "travel", "advisory", "advisories", "state", "department", "safe", "it", "for", "cdc", "health", "notice", "notices", "outbreak", "outbreaks", "level", "viaje", "advertencia", "alerta", "brote", "brotes", "about", "going", "trip"]);
const placeAfter = (text: string, word: RegExp) => text.replace(new RegExp(word.source, "g"), " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !NOTICE_FILLER.has(w)).join(" ");

export function routeLive(q: string): Route | null {
  const text = plain(q.trim().slice(0, 100));
  if (!text) return null;
  if (PHARMACY.test(text)) {
    const place = text.replace(new RegExp(PHARMACY.source, "g"), " ").split(/[^a-z0-9]+/).filter((w) => w && !FILLER.has(w)).join(" ");
    return { source: "pharmacy", place };
  }
  if (POWER.test(text)) return { source: "power" };
  // Before weather, because "advisory" is also a weather word.
  if (ADVISORY.test(text)) return { source: "advisory", place: placeAfter(text, ADVISORY) };
  if (HEALTH.test(text)) return { source: "health", place: placeAfter(text, HEALTH) };
  if (QUAKE.test(text)) return { source: "quake" };
  if (SEA.test(text)) return { source: "sea" };
  if (RIVER.test(text)) return { source: "river" };
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  const found = tokens.filter((t) => t.length === 3 && KNOWN.has(t)).map((t) => KNOWN.get(t)!);
  if (found.length) return { source: "airport", codes: [...new Set(found.filter((f) => f.us).map((f) => f.code))] };
  if (AIRPORT_WORD.test(text)) {
    const codes = [...new Set(CITY_CODES.filter(([city]) => text.includes(city)).flatMap(([, c]) => c))];
    if (codes.length) return { source: "airport", codes };
  }
  if (!WEATHER.test(text)) return null;
  // A place is named after "in", "near", "at" or "for" ("flood warning in Houston"); other leftover words are not guessed at.
  const after = /\b(?:in|near|at|for|en|para|cerca de)\s+(.+)$/.exec(text)?.[1] ?? "";
  const place = after.replace(new RegExp(WEATHER.source, "g"), " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !FILLER.has(w) && !WEATHER_FILLER.has(w)).join(" ");
  return place ? { source: "weather", place } : { source: "weather" };
}

const WEATHER_FILLER = new Set(["will", "it", "there", "tomorrow", "this", "week", "weekend", "me", "for", "how", "show", "get", "check", "current", "latest", "active", "live", "report", "forecast", "severe", "national", "service", "nws", "us", "usa", "and", "or", "my", "area", "here", "be", "going", "do", "does", "have", "has", "news", "info", "status", "update", "updates", "pronostico", "tiempo", "para", "manana", "semana", "mi", "aqui", "va", "hacer", "island", "isla"]);

/** Active weather alerts for one point in the United States from the National Weather Service. */
async function usWeather(q: string, at: { name: string; lat: number; lon: number; state: string }, now: Date): Promise<LiveAnswer> {
  const text = await read(`https://api.weather.gov/alerts/active?point=${at.lat.toFixed(4)},${at.lon.toFixed(4)}`, { "user-agent": "safehubby.com", accept: "application/geo+json" }, now);
  if (text === null) return none(q, "The National Weather Service could not be reached just now.");
  const alerts = parseNws(text);
  return {
    status: 200, results: alerts.length || 1, summary: "live/weather-us", words: q.toLowerCase(),
    body: {
      q, place: { name: at.name, state: at.state, lat: at.lat, lon: at.lon }, source: "National Weather Service", asOf: now.toISOString(), alerts,
      summary: alerts.length ? `${alerts.length} active alert${alerts.length === 1 ? "" : "s"} for ${at.name}, ${at.state}.` : `No active weather alerts for ${at.name}, ${at.state}.`,
      note: "Active alerts for that exact point, read from the National Weather Service when you asked. Alerts change quickly; follow the weather service and local officials. Not a forecast.",
    },
  };
}

export interface LiveAnswer { status: 200 | 404; body: unknown; results: number; summary: string; words: string }
// The owner's choice (2026-11-20): a search that was really made is charged even when it finds nothing.
const searchedNothing = (q: string, message: string): LiveAnswer => ({ status: 200, body: { found: false, message: `${message} The search was made, so this answer is charged.`, asOf: new Date().toISOString() }, results: 0, summary: "live/none-found", words: q.trim().toLowerCase().slice(0, 100) });
const none = (q: string, error: string): LiveAnswer => ({ status: 404, body: { error: `${error} You are not charged.` }, results: 0, summary: "live/none", words: q.trim().toLowerCase().slice(0, 100) });

/** Power across Puerto Rico from LUMA's public outage map, or null when it cannot be read. */
async function powerReport(now: Date) {
  const text = await read(LUMA_URL, { "user-agent": "safehubby.com" }, now);
  const regions = text === null ? null : parseLuma(text);
  if (!regions) return null;
  const out = regions.reduce((n, r) => n + r.withoutPower, 0), all = regions.reduce((n, r) => n + r.customers, 0), shed = regions.reduce((n, r) => n + r.loadShed, 0);
  const pct = all ? Math.round((out / all) * 10000) / 100 : 0;
  const worst = regions[0];
  return {
    source: "LUMA Energy outage map", regions, island: { customers: all, withoutPower: out, percentWithoutPower: pct, loadShed: shed },
    summary: `${out.toLocaleString("en-US")} customers without power across Puerto Rico (${pct}%).${worst && worst.withoutPower ? ` Most affected: ${worst.name} (${worst.percentWithoutPower}%).` : ""}${shed ? ` ${shed.toLocaleString("en-US")} affected by load shedding (planned rolling cuts when there is not enough power).` : " No load shedding."}`,
  };
}

/** Current FAA status for each airport plus the look-ahead outlook, or null when the FAA status cannot be read. */
async function airportReport(codes: string[], now: Date) {
  const prCodes = codes.filter((c) => PR_NAMES[c.toLowerCase()]);
  // The current status is required; the look-ahead sources add to it when they can be reached.
  const [text, planText, tafText, gtwoText, metarText, eventsText, cruise] = await Promise.all([
    read(FAA_URL, {}, now),
    read(PLAN_URL, {}, now),
    read(TAF_URL(codes.map(icaoFor)), { "user-agent": "safehubby.com" }, now),
    prCodes.length ? read(GTWO_URL, { "user-agent": "safehubby.com" }, now) : Promise.resolve(null),
    read(METAR_URL(codes.map(icaoFor)), { "user-agent": "safehubby.com" }, now),
    read(EVENTS_URL, {}, now),
    codes.includes("SJU") ? cruiseReport(now) : Promise.resolve(null),
  ]);
  const parsed = text === null ? null : codes.map((code) => ({ code, status: parseFaa(text, code) }));
  if (!parsed || parsed.some((p) => !p.status)) return null;
  const plan = planText === null ? null : parsePlan(planText);
  const tropical = gtwoText === null ? null : parseOutlook(gtwoText);
  // Closures are left out here: the FAA's closure list includes notices that close an airport only to some flights.
  const hubsNow = HUBS.map((code) => ({ code, issues: (parseFaa(text!, code)?.issues ?? []).filter((i) => i.kind !== "closure") })).filter((h) => h.issues.length);
  const short = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, t.lastIndexOf(" ", n))}…`);
  const hhmm = (t: string) => `${t.slice(11, 16)}Z`;
  const airports = parsed.map((p) => {
    const forecast = tafText === null ? null : forecastHazards(tafText, icaoFor(p.code), now);
    const mine = (e: PlanItem) => new RegExp(`\\b${p.code}\\b`).test(e.what);
    const faaPlan = plan === null ? null : { forThisAirport: plan.filter(mine), elsewhere: plan.filter((e) => !mine(e)).slice(0, 15) };
    const delayedHubsNow = hubsNow.filter((h) => h.code !== p.code).map((h) => ({ code: h.code, issues: h.issues.map((i) => i.kind) }));
    const tropicalOutlook = PR_NAMES[p.code.toLowerCase()] && tropical ? { source: "National Hurricane Center", ...tropical } : null;
    const field = metarText === null ? null : atTheField(metarText, icaoFor(p.code), now);
    const rates = eventsText === null ? null : faaRates(eventsText, p.code);
    const history = historyFor(p.code, now);
    const cruiseHere = p.code === "SJU" ? cruise : null;
    const today = cruiseHere && cruiseHere.enabled ? cruiseHere.days[0] : null;
    const signals = [
      ...(field?.lightning ? [`At the field now: lightning or thunderstorms (${field.ageMinutes} minutes ago). Ground crews usually stop work outside when lightning is close, so departures can stall before any delay is posted.`] : []),
      ...(field && /IFR/.test(field.flightCategory ?? "") ? [`At the field now: low cloud or poor visibility (${field.flightCategory}), which lowers how many flights can land each hour.`] : []),
      ...(field && field.specialReportsLastHour >= 2 ? [`At the field: ${field.specialReportsLastHour} special weather reports in the last hour, which means the weather is changing fast.`] : []),
      ...p.status!.issues.map((i) => `Now: ${i.kind}${i.reason ? ` (${i.reason})` : ""}.`),
      ...(forecast?.hazards ?? []).map((h) => `Forecast: ${h.what.join(", ")} ${hhmm(h.from)} to ${hhmm(h.to)}${h.chancePercent ? ` (${h.chancePercent}% chance)` : ""}.`),
      ...(faaPlan?.forThisAirport ?? []).map((e) => `FAA plan: ${e.what}${e.when ? ` ${e.when}Z` : ""}.`),
      ...(delayedHubsNow.length ? [`Delays now at ${delayedHubsNow.map((h) => h.code).join(", ")}: a flight from there may arrive late.`] : []),
      ...(tropicalOutlook?.systems ?? []).filter((x) => x.chance7dPercent >= 40).map((x) => `A storm may form within 7 days (${x.chance7dPercent}% chance): ${short(x.text, 90)}`),
      ...(history ? historySignals(history) : []),
      ...(today && today.shipsInPort >= 3 ? [`${today.shipsInPort} cruise ships in San Juan today (${today.ships.map((c) => c.ship).join(", ")}): cruise passengers fly in and out, so SJU security lines and nearby roads get busier.`] : []),
    ];
    return { code: p.code, updatedAt: p.status!.updatedAt, issues: p.status!.issues, outlook: { signals, atTheField: field, faaRates: rates, forecast, faaPlan, delayedHubsNow, tropicalOutlook, history, cruise: cruiseHere } };
  });
  const listed = airports.filter((a) => a.issues.length);
  const ahead = airports.reduce((n, a) => n + a.outlook.signals.length - a.issues.length, 0);
  return {
    airports,
    summary: `${listed.length ? `${listed.map((a) => `${a.code}: ${a.issues.map((i) => i.kind).join(", ")}`).join("; ")}.` : `No delay, ground program or closure is listed for ${airports.map((a) => a.code).join(", ")}.`} ${ahead ? `${ahead} sign${ahead === 1 ? "" : "s"} of possible delays ahead; see outlook.signals.` : "No signs of delays ahead in the forecast or the FAA plan."}`,
  };
}

/**
 * Where a place is: Puerto Rico first (the whole phrase, then the town in it), then anywhere in the United States, because
 * the federal pharmacy registry and the weather service cover the whole country. Null when nothing found is in either.
 */
async function locate(place: string, now: Date): Promise<{ name: string; lat: number; lon: number; town?: string; state: string } | null> {
  const town = PR_TOWNS.find((t) => new RegExp(`\\b${t}\\b`).test(place));
  for (const query of [place, town].filter((x, i, a): x is string => !!x && a.indexOf(x) === i)) {
    const text = await nominatim(`q=${encodeURIComponent(`${query}, Puerto Rico`)}&limit=1&addressdetails=1`, now);
    let found: any;
    try { found = text ? JSON.parse(text)?.[0] : null; } catch { found = null; }
    const lat = Number(found?.lat), lon = Number(found?.lon);
    const a = found?.address ?? {};
    const townName = a.city || a.town || a.municipality || a.village || (town && query === town ? query : undefined);
    if (found && Number.isFinite(lat) && Number.isFinite(lon) && inPR(lat, lon)) return { name: scrub(found.name || query, 80), lat, lon, state: "PR", ...(townName ? { town: scrub(townName, 60) } : {}) };
  }
  if (town) return null;
  const text = await nominatim(`q=${encodeURIComponent(place)}&countrycodes=us&limit=1&addressdetails=1`, now);
  let found: any;
  try { found = text ? JSON.parse(text)?.[0] : null; } catch { found = null; }
  const lat = Number(found?.lat), lon = Number(found?.lon);
  const a = found?.address ?? {};
  const state = /^US-([A-Z]{2})$/.exec(String(a["ISO3166-2-lvl4"] ?? ""))?.[1];
  if (!found || a.country_code !== "us" || !state || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const townName = a.city || a.town || a.village || a.hamlet;
  return { name: scrub(found.name || place, 80), lat, lon, state, ...(townName ? { town: scrub(townName, 60) } : {}) };
}

export interface RegistryPharmacy { name: string; address: string; town: string; phone: string | null }

const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const titled = (v: string) => v.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_m, b: string, c: string) => b + c.toUpperCase());
// Store numbers and company suffixes are noise when matching a registry name to a map name.
const core = (v: string) => fold(v).replace(/#?\s*\d+$/, "").replace(/\b(INC|LLC|CORP|CORPORATION|CO|OF PUERTO RICO|PR|PSC)\b/g, "").replace(/\s+/g, " ").trim();
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-10);

/**
 * Licensed retail pharmacies in a town in Puerto Rico or any US state from the federal NPI registry (CMS, public domain): name, street and
 * phone, no hours and no position. Read at the same time as the map, so it costs no extra wait. Null when unreachable.
 */
export async function registryPharmacies(town: string, now: Date, state = "PR"): Promise<RegistryPharmacy[] | null> {
  const city = fold(town);
  const text = await read(`https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=pharmacy&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&enumeration_type=NPI-2&limit=200`, { "user-agent": "safehubby.com" }, now);
  if (text === null) return null;
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  const out: RegistryPharmacy[] = [];
  for (const r of Array.isArray(data?.results) ? data.results : []) {
    const loc = (r.addresses ?? []).find((a: any) => a.address_purpose === "LOCATION");
    const kind = String((r.taxonomies ?? []).find((t: any) => t.primary)?.desc ?? "");
    // Only pharmacies a person can walk into: not infusion, specialty, mail-order or nursing-home pharmacies.
    if (!loc || fold(loc.city ?? "") !== city || !/^Pharmacy(, Community\/Retail Pharmacy)?$/.test(kind)) continue;
    // A hospital's own pharmacy serves its patients, not someone walking in.
    if (/HOSPITAL|MEDICAL CENTER|CENTRO MEDICO/.test(fold(r.basic?.organization_name ?? ""))) continue;
    const dba = (r.other_names ?? []).find((n: any) => n.code === "3" || /doing business/i.test(n.type ?? ""))?.organization_name;
    out.push({
      name: scrub(titled(core(dba || r.basic?.organization_name || "Pharmacy")), 80),
      address: scrub(titled([loc.address_1, loc.city].filter(Boolean).join(", ")), 120),
      town: scrub(titled(loc.city), 60), phone: loc.telephone_number ? String(loc.telephone_number).slice(0, 40) : null,
    });
  }
  return out;
}

async function pharmacyAnswer(q: string, place: string, now: Date): Promise<LiveAnswer> {
  if (!place) return none(q, "Say where: a town, a city or a hospital in Puerto Rico or the United States, for example \"pharmacy near Hospital Auxilio Mutuo\" or \"farmacia en Bayamón\".");
  const at = await locate(place, now);
  if (!at) return none(q, "That place could not be found in Puerto Rico or the United States. Pharmacy answers cover those only.");
  const registry = at.town ? registryPharmacies(at.town, now, at.state) : Promise.resolve(null);
  let list: any[] = [];
  for (const d of [0.035, 0.08]) {
    const box = [at.lon - d, at.lat + d, at.lon + d, at.lat - d].map((n) => n.toFixed(4)).join(",");
    const text = await nominatim(`q=%5Bpharmacy%5D&limit=40&extratags=1&addressdetails=1&bounded=1&viewbox=${box}`, now);
    if (text === null) return none(q, "The map search could not be reached just now.");
    try { list = JSON.parse(text); } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    if (list.length >= 3) break;
  }
  const pharmacies: Pharmacy[] = list.map((e: any): Pharmacy => {
    const x = e.extratags ?? {}, a = e.address ?? {};
    const lat = Number(e.lat), lon = Number(e.lon);
    const hours = x.opening_hours ? scrub(x.opening_hours, 120) : null;
    return {
      name: scrub(e.name || x.brand || "Pharmacy", 80),
      address: [a.road, a.city || a.town || a.village || a.suburb || a.county].filter(Boolean).map((v: unknown) => scrub(v, 80)).join(", "),
      distanceKm: Math.round(km({ lat: at.lat, lng: at.lon }, { lat, lng: lon }) * 10) / 10 || Math.round(Math.hypot((lat - at.lat) * 111, (lon - at.lon) * 105) * 10) / 10,
      phone: x.phone || x["contact:phone"] ? String(x.phone || x["contact:phone"]).slice(0, 40) : null,
      hours, openNow: openNow(hours ?? undefined, now),
      map: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    };
  }).filter((p) => Number.isFinite(p.distanceKm)).sort((x, y) => x.distanceKm - y.distanceKm).slice(0, 8);
  const listed = (await registry) ?? [];
  // A map entry and a registry entry are the same pharmacy when the phone or the name matches; the registry then fills a
  // missing phone, and registry entries the map lacks are listed apart, without a distance (the registry gives none).
  const used = new Set<RegistryPharmacy>();
  for (const p of pharmacies) {
    const hit = listed.find((r) => !used.has(r) && ((digits(p.phone) && digits(p.phone) === digits(r.phone)) || (core(r.name).length > 3 && (core(p.name).includes(core(r.name)) || core(r.name).includes(core(p.name))))));
    if (!hit) continue;
    used.add(hit);
    if (!p.phone && hit.phone) p.phone = hit.phone;
  }
  const alsoInTown = listed.filter((r) => !used.has(r)).slice(0, 12);
  if (!pharmacies.length && !alsoInTown.length) return searchedNothing(q, `No pharmacy is listed on the map near ${at.name}${at.town ? ` or in the federal registry for ${at.town}` : ""}.`);
  const withPhone = pharmacies.filter((p) => p.phone).length + alsoInTown.filter((p) => p.phone).length, open = pharmacies.filter((p) => p.openNow === true).length, known = pharmacies.filter((p) => p.openNow !== null).length;
  return {
    status: 200, results: pharmacies.length + alsoInTown.length, summary: "live/pharmacy", words: q.toLowerCase(),
    body: {
      q, place: at, source: "OpenStreetMap contributors (ODbL), via Nominatim",
      sources: ["OpenStreetMap contributors (ODbL), via Nominatim", ...(listed.length ? ["NPI Registry, CMS (US Department of Health and Human Services)"] : [])],
      asOf: now.toISOString(), pharmacies, alsoInTown,
      alsoInTownNote: "Licensed retail pharmacies in the same town from the federal NPI registry that the map does not show. The registry gives no hours and no position, so there is no distance or open-now for these; call first.",
      stock: null,
      stockNote: "Whether an item is in stock is not published in a form we may read automatically. Call the pharmacy (numbers above, where the map has one), or ask Safehubby for a Checked today answer: a person goes and looks, and the answer says when and who.",
      summary: `${pharmacies.length ? `${pharmacies.length} pharmac${pharmacies.length === 1 ? "y" : "ies"} near ${at.name} on the map, the nearest ${pharmacies[0]!.distanceKm} km away` : `None on the map near ${at.name}`}${alsoInTown.length ? `, plus ${alsoInTown.length} more licensed in ${at.town} from the federal registry` : ""}. ${withPhone} list a phone number. ${known ? `${open} of the ${known} with published hours are open now.` : "None publishes its hours on the map."}`,
      note: "Map data from OpenStreetMap contributors, read when you asked. Names, phones and hours are what volunteers recorded and can be out of date; call before going.",
    },
  };
}

const UA = { "user-agent": "safehubby.com" };
type MoreRoute = Extract<Route, { source: "quake" | "sea" | "river" | "advisory" | "health" }>;

/** Earthquakes, the sea at San Juan, river gauges, travel advisories and travel health notices: one official source each. */
async function moreAnswer(q: string, route: MoreRoute, now: Date): Promise<LiveAnswer> {
  const words = q.toLowerCase();
  const asOf = now.toISOString();
  if (route.source === "quake") {
    const text = await read(QUAKE_URL, UA, now);
    const quakes = text === null ? null : parseQuakes(text, now);
    if (!quakes) return none(q, "The USGS earthquake feed could not be read just now.");
    const big = quakes.reduce<number | null>((m, x) => (x.magnitude !== null && (m === null || x.magnitude > m) ? x.magnitude : m), null);
    return {
      status: 200, results: quakes.length || 1, summary: "live/quake", words,
      body: { q, source: "USGS Earthquake Hazards Program (Puerto Rico Seismic Network)", area: "Puerto Rico and nearby waters", window: "last 7 days, magnitude 2.5 and up", asOf, quakes,
        summary: quakes.length ? `${quakes.length} earthquake${quakes.length === 1 ? "" : "s"} of magnitude 2.5 or more near Puerto Rico in the last 7 days; the largest was ${big}.` : "No earthquakes of magnitude 2.5 or more near Puerto Rico in the last 7 days.",
        note: "Each time is when the quake happened. Small quakes are common here and most are not felt. For tsunami warnings follow the National Tsunami Warning Center and local officials." },
    };
  }
  if (route.source === "sea") {
    const [tideText, buoyText] = await Promise.all([read(TIDE_URL, UA, now), read(BUOY_URL, UA, now)]);
    const tide = tideText === null ? null : parseTide(tideText);
    const buoy = buoyText === null ? null : parseBuoy(buoyText);
    if (!tide && !buoy) return none(q, "NOAA's San Juan tide station and buoy could not be read just now.");
    const parts = [
      tide?.waterLevelFeet != null ? `Water level at ${tide.station}: ${tide.waterLevelFeet} ft above mean lower low water.` : "",
      buoy?.waveHeightFeet != null ? `Waves offshore: ${buoy.waveHeightFeet} ft${buoy.dominantPeriodSec != null ? ` every ${buoy.dominantPeriodSec} s` : ""}.` : "",
      buoy?.windKnots != null ? `Wind offshore: ${buoy.windKnots} kt${buoy.gustKnots != null ? `, gusts ${buoy.gustKnots} kt` : ""}.` : "",
    ].filter(Boolean);
    return {
      status: 200, results: 1, summary: "live/sea", words,
      body: { q, source: "NOAA Tides and Currents and the National Data Buoy Center", asOf, tide, buoy, summary: parts.join(" ") || "The station answered with no reading.",
        note: "observedAt on each part is when NOAA measured it, which can be up to an hour before you asked. The buoy is a few miles off San Juan, so beaches can differ. Not a surf or marine forecast; for rip currents and small craft follow the National Weather Service. A part is null when its source could not be read." },
    };
  }
  if (route.source === "river") {
    // The statewide gauge file is large and USGS takes several seconds to build it.
    const text = await read(RIVER_URL, UA, now, 15_000);
    const gauges = text === null ? null : parseRivers(text);
    if (!gauges) return none(q, "The USGS river gauges could not be read just now.");
    const rising = gauges.filter((g) => (g.changeFeet3h ?? 0) >= 0.5);
    return {
      status: 200, results: gauges.length || 1, summary: "live/river", words,
      body: { q, source: "USGS Water Data, Puerto Rico", asOf, gauges: gauges.length, risingFast: rising, top: gauges.slice(0, 10),
        summary: rising.length ? `${rising.length} of ${gauges.length} river gauges in Puerto Rico rose half a foot or more in about three hours; the most was ${rising[0]!.site} (+${rising[0]!.changeFeet3h} ft).` : `None of ${gauges.length} river gauges in Puerto Rico rose half a foot or more in about three hours.`,
        note: "Height is the water level at each gauge in feet (its own scale, not depth), with how much it changed over about three hours. A fast rise can come before flooding downstream. Not a flood warning: for those follow the National Weather Service." },
    };
  }
  const isAdvisory = route.source === "advisory";
  const text = await read(isAdvisory ? ADVISORY_URL : CDC_URL, UA, now);
  const all = text === null ? null : parseNotices(text);
  const who = isAdvisory ? "The State Department's travel advisories" : "The CDC's travel health notices";
  if (!all) return none(q, `${who} could not be read just now.`);
  const match = noticesFor(all, route.place);
  const named = Boolean(route.place);
  // With no place named, the advisories are many: give the highest levels only.
  const notices = named ? match : isAdvisory ? all.filter((n) => (n.level ?? 0) >= 4) : all;
  const label = isAdvisory ? "advisory" : "notice";
  return {
    status: 200, results: notices.length || 1, summary: isAdvisory ? "live/advisory" : "live/health", words,
    body: { q, source: isAdvisory ? "U.S. Department of State, Travel Advisories" : "CDC Travelers' Health, Travel Notices", page: isAdvisory ? "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html" : "https://wwwnc.cdc.gov/travel/notices", asOf, place: route.place || null, notices,
      summary: named ? (notices.length ? notices.map((n) => n.title).join("; ") : `No ${label} names "${route.place}" right now.`) : isAdvisory ? `${notices.length} destinations at Level 4 (Do Not Travel), out of ${all.length} advisories listed.` : `${all.length} travel health notices listed.`,
      note: `Read from the official feed when you asked; published is when each was issued. ${isAdvisory ? "Level 1 is normal precautions, 4 is do not travel. Puerto Rico and US territories have no advisory." : "Level 1 is usual precautions, 4 is avoid nonessential travel."} Read the full ${label} on the official page before deciding.` },
  };
}

const AIRPORT_NOTE = "The FAA lists only airports with something to report, so an airport that is not listed has no reported delay at the time shown. Conditions can change at any time. Not a forecast, and not a promise about any flight.";
const OUTLOOK_NOTE = "The outlook reads the airport's latest observation and official forecast (Aviation Weather Center), the arrival rate the FAA has set, the FAA's plan for the day, big airports delayed now and, for Puerto Rico, the hurricane center's outlook and a year of on-time history by hour (US DOT) with the busy hours for security lines. It shows signs that often come before delays. It is not a prediction about any flight. A part is null when its source could not be reached.";
const PR_AIRPORTS = ["SJU", "BQN", "PSE"];

export async function answerLive(rawQ: string, now: Date): Promise<LiveAnswer> {
  const q = rawQ.trim().slice(0, 100);
  const route = routeLive(q);
  if (!route) return none(q, "No live source covers this. Live answers cover weather alerts for a place in the United States, the Puerto Rico weather bundle (alerts, satellite, storms, power, airports), power outages in Puerto Rico, pharmacies near a place in Puerto Rico or the United States, US airport delays, earthquakes near Puerto Rico, the tide and waves at San Juan, Puerto Rico river levels, State Department travel advisories and CDC travel health notices, such as 'SJU delays' or 'flood warning in Houston'.");
  if (route.source === "pharmacy") return pharmacyAnswer(q, route.place, now);
  if (route.source === "quake" || route.source === "sea" || route.source === "river" || route.source === "advisory" || route.source === "health") return moreAnswer(q, route, now);
  if (route.source === "power") {
    const power = await powerReport(now);
    if (!power) return none(q, "The power company's outage map could not be read just now.");
    return {
      status: 200, results: power.regions.length, summary: "live/power", words: q.toLowerCase(),
      body: { q, asOf: now.toISOString(), ...power, note: "Read from the power company's public outage map when you asked, by region. A shop or pharmacy in a region with many customers out may be closed or running on a generator; check before sending someone." },
    };
  }
  if (route.source === "weather" && route.place) {
    const at = await locate(route.place, now);
    if (!at) return none(q, "That place could not be found in Puerto Rico or the United States. Weather alerts cover those only.");
    if (at.state !== "PR") return usWeather(q, at, now);
  }
  if (route.source === "weather") {
    // The weather bundle: the weather service is the answer; the satellite, the hurricane center, power and Puerto Rico's airports
    // come with it when they can be reached, for the same price.
    const [text, stormText, power, airports, ...sats] = await Promise.all([
      read(NWS_URL, { "user-agent": "safehubby.com", accept: "application/geo+json" }, now),
      read(NHC_URL, { "user-agent": "safehubby.com" }, now),
      powerReport(now),
      airportReport(PR_AIRPORTS, now),
      ...Object.values(SAT_IMAGES).map((i) => madeAt(`${SAT_BASE}/${i.band}/latest.jpg`, now)),
    ]);
    if (text === null) return none(q, "The National Weather Service could not be reached just now.");
    const alerts = parseNws(text);
    const storms = stormText === null ? null : parseStorms(stormText);
    const images = Object.fromEntries(Object.entries(SAT_IMAGES).flatMap(([name, i], n) => {
      const made = sats[n];
      return made ? [[name, { what: i.what, madeAt: made, ageMinutes: Math.max(0, Math.round((now.getTime() - new Date(made).getTime()) / 60_000)), image: `${SAT_BASE}/${i.band}/latest.jpg` }]] : [];
    }));
    const satellite = Object.keys(images).length ? { satellite: "GOES-19 (GOES-East)", operator: "NOAA NESDIS", area: "Puerto Rico", images, note: "The picture at each address is replaced every few minutes; madeAt is when the one there was made at the time you asked." } : null;
    const tropical = storms === null ? null : { source: "National Hurricane Center", storms };
    const parts = [
      alerts.length ? `${alerts.length} active alert${alerts.length === 1 ? "" : "s"} for Puerto Rico.` : "No active weather alerts for Puerto Rico were listed.",
      storms === null ? "" : storms.length ? `${storms.length} active tropical storm${storms.length === 1 ? "" : "s"} in the hurricane center's list.` : "No active tropical storms in the hurricane center's list.",
      power ? `Power: ${power.summary}` : "",
      airports ? `Airports: ${airports.summary}` : "",
    ].filter(Boolean);
    return {
      status: 200, results: alerts.length || 1, summary: "live/weather", words: q.toLowerCase(),
      body: {
        q, bundle: ["weather alerts", "satellite", "tropical storms", "power outages", "Puerto Rico airports"],
        source: "National Weather Service", sourceNote: "Active alerts for Puerto Rico", asOf: now.toISOString(), alerts, satellite, tropical,
        power: power && { source: power.source, island: power.island, regions: power.regions, summary: power.summary },
        puertoRicoAirports: airports && { source: "FAA National Airspace System Status", airports: airports.airports, summary: airports.summary, note: AIRPORT_NOTE, outlookNote: OUTLOOK_NOTE },
        summary: parts.join(" "),
        note: "The Puerto Rico weather bundle, read when you asked: the National Weather Service's alerts, NOAA's GOES-East satellite, the National Hurricane Center, the power company's outage map and the FAA's status and outlook for SJU, BQN and PSE. Alerts change quickly; for any storm follow the National Weather Service and local officials. Not a forecast. A part is null when its source could not be reached.",
      },
    };
  }
  if (!route.codes.length) return none(q, "The FAA feed covers airports in the United States and Puerto Rico only.");
  const report = await airportReport(route.codes, now);
  if (!report) return none(q, "The FAA airport status could not be read just now.");
  return {
    status: 200, results: report.airports.length, summary: "live/airport", words: q.toLowerCase(),
    body: { q, source: "FAA National Airspace System Status", asOf: now.toISOString(), airports: report.airports, summary: report.summary, note: AIRPORT_NOTE, outlookNote: OUTLOOK_NOTE },
  };
}
