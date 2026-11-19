/**
 * Live answers from free public sources, so nothing here needs a person: the National Weather Service's active alerts for
 * Puerto Rico, the GOES-East weather satellite's latest pictures of Puerto Rico and the National Hurricane Center's active storms
 * (both NOAA), and the FAA's airport status (delays, ground programs, closures). Every answer names its source and says when it
 * was read. An answer is never made up: a source that is down, or a question no source covers, gives no answer and no charge.
 * A copy is kept for five minutes so many agents asking at once do not hammer the sources; if a source is down, a copy up to
 * fifteen minutes old may still be served, and no older one.
 */
import { AIRPORTS } from "@safehubby/core";

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
async function read(url: string, headers: Record<string, string>, now: Date): Promise<string | null> {
  const hit = cache.get(url);
  if (hit && now.getTime() - hit.at < FRESH_MS) return hit.text;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

const NWS_URL = "https://api.weather.gov/alerts/active?area=PR";
const FAA_URL = "https://nasstatus.faa.gov/api/airport-status-information";
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
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

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
const AIRPORT_WORD = /\b(airports?|aeropuertos?|flights?|vuelos?|delays?|delayed|retrasos?|retrasado|ground (stop|delay)|closure|closed)\b/;

export type Route = { source: "weather" } | { source: "airport"; codes: string[] };

export function routeLive(q: string): Route | null {
  const text = plain(q.trim().slice(0, 100));
  if (!text) return null;
  const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
  const found = tokens.filter((t) => t.length === 3 && KNOWN.has(t)).map((t) => KNOWN.get(t)!);
  if (found.length) return { source: "airport", codes: [...new Set(found.filter((f) => f.us).map((f) => f.code))] };
  if (AIRPORT_WORD.test(text)) {
    const codes = [...new Set(CITY_CODES.filter(([city]) => text.includes(city)).flatMap(([, c]) => c))];
    if (codes.length) return { source: "airport", codes };
  }
  return WEATHER.test(text) ? { source: "weather" } : null;
}

export interface LiveAnswer { status: 200 | 404; body: unknown; results: number; summary: string; words: string }
const none = (q: string, error: string): LiveAnswer => ({ status: 404, body: { error: `${error} You are not charged.` }, results: 0, summary: "live/none", words: q.trim().toLowerCase().slice(0, 100) });

export async function answerLive(rawQ: string, now: Date): Promise<LiveAnswer> {
  const q = rawQ.trim().slice(0, 100);
  const route = routeLive(q);
  if (!route) return none(q, "No live source covers this. Live answers cover storm and flood alerts for Puerto Rico and US airport delays, such as SJU delays.");
  if (route.source === "weather") {
    // The weather service is the answer; the satellite and the hurricane center add to it when they can be reached.
    const [text, stormText, ...sats] = await Promise.all([
      read(NWS_URL, { "user-agent": "safehubby.com", accept: "application/geo+json" }, now),
      read(NHC_URL, { "user-agent": "safehubby.com" }, now),
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
    ].filter(Boolean);
    return {
      status: 200, results: alerts.length || 1, summary: "live/weather", words: q.toLowerCase(),
      body: {
        q, source: "National Weather Service", sourceNote: "Active alerts for Puerto Rico", asOf: now.toISOString(), alerts, satellite, tropical,
        summary: parts.join(" "),
        note: "Read from the National Weather Service, NOAA's GOES-East satellite and the National Hurricane Center when you asked. Alerts change quickly; for any storm follow the National Weather Service and local officials. Not a forecast. satellite or tropical is null when that source could not be reached.",
      },
    };
  }
  if (!route.codes.length) return none(q, "The FAA feed covers airports in the United States and Puerto Rico only.");
  const text = await read(FAA_URL, {}, now);
  const parsed = text === null ? null : route.codes.map((code) => ({ code, status: parseFaa(text, code) }));
  if (!parsed || parsed.some((p) => !p.status)) return none(q, "The FAA airport status could not be read just now.");
  const airports = parsed.map((p) => ({ code: p.code, updatedAt: p.status!.updatedAt, issues: p.status!.issues }));
  const listed = airports.filter((a) => a.issues.length);
  return {
    status: 200, results: airports.length, summary: "live/airport", words: q.toLowerCase(),
    body: {
      q, source: "FAA National Airspace System Status", asOf: now.toISOString(), airports,
      summary: listed.length ? `${listed.map((a) => `${a.code}: ${a.issues.map((i) => i.kind).join(", ")}`).join("; ")}.` : `No delay, ground program or closure is listed for ${airports.map((a) => a.code).join(", ")}.`,
      note: "The FAA lists only airports with something to report, so an airport that is not listed has no reported delay at the time shown. Conditions can change at any time. Not a forecast, and not a promise about any flight.",
    },
  };
}
