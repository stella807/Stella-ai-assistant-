/**
 * Live answers from free public sources, so nothing here needs a person: the National Weather Service's active alerts for
 * Puerto Rico, the GOES-East weather satellite's latest pictures of Puerto Rico and the National Hurricane Center's active storms
 * (both NOAA), and the FAA's airport status (delays, ground programs, closures). For airports it also looks ahead: the airport's
 * forecast (TAF, from the Aviation Weather Center), the FAA's plan for the day (what it calls possible), big airports delayed now
 * (a flight from one can arrive late), and for Puerto Rico the hurricane center's chances of a storm forming. It also reads the airport's
 * latest observation (METAR): lightning near the field stops ground crews, which stalls departures before any delay is posted. And it
 * answers power questions for Puerto Rico from LUMA's public outage map, including load shedding (planned rolling cuts). Every answer names its source and says when it
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
const PLAN_URL = "https://nasstatus.faa.gov/api/operations-plan";
const TAF_URL = (ids: string[]) => `https://aviationweather.gov/api/data/taf?ids=${ids.join(",")}&format=json`;
const GTWO_URL = "https://www.nhc.noaa.gov/gtwo.xml";
/** Big US airports: a delay at one now can make a flight from there arrive late anywhere. */
const HUBS = ["ATL", "BOS", "BWI", "CLT", "DCA", "DEN", "DFW", "DTW", "EWR", "FLL", "IAD", "IAH", "JFK", "LAS", "LAX", "LGA", "MCO", "MIA", "MSP", "ORD", "PHL", "PHX", "SEA", "SFO", "TPA"];
const METAR_URL = (ids: string[]) => `https://aviationweather.gov/api/data/metar?ids=${ids.join(",")}&hours=2&format=json`;
const EVENTS_URL = "https://nasstatus.faa.gov/api/airport-events";
const LUMA_URL = "https://api.miluma.lumapr.com/miluma-outage-api/outage/regionsWithoutService";
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
const POWER = /\b(power|outages?|electricity|blackouts?|luma|luz|apagon(?:es)?|energia|electrica|sin servicio)\b/;
const AIRPORT_WORD = /\b(airports?|aeropuertos?|flights?|vuelos?|delays?|delayed|retrasos?|retrasado|ground (stop|delay)|closure|closed)\b/;

export type Route = { source: "weather" } | { source: "power" } | { source: "airport"; codes: string[] };

export function routeLive(q: string): Route | null {
  const text = plain(q.trim().slice(0, 100));
  if (!text) return null;
  if (POWER.test(text)) return { source: "power" };
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
  if (route.source === "power") {
    const text = await read(LUMA_URL, { "user-agent": "safehubby.com" }, now);
    const regions = text === null ? null : parseLuma(text);
    if (!regions) return none(q, "The power company's outage map could not be read just now.");
    const out = regions.reduce((n, r) => n + r.withoutPower, 0), all = regions.reduce((n, r) => n + r.customers, 0), shed = regions.reduce((n, r) => n + r.loadShed, 0);
    const worst = regions[0];
    return {
      status: 200, results: regions.length, summary: "live/power", words: q.toLowerCase(),
      body: {
        q, source: "LUMA Energy outage map", asOf: now.toISOString(), regions,
        island: { customers: all, withoutPower: out, percentWithoutPower: all ? Math.round((out / all) * 10000) / 100 : 0, loadShed: shed },
        summary: `${out.toLocaleString("en-US")} customers without power across Puerto Rico${all ? ` (${(Math.round((out / all) * 10000) / 100).toString()}%)` : ""}.${worst && worst.withoutPower ? ` Most affected: ${worst.name} (${worst.percentWithoutPower}%).` : ""}${shed ? ` ${shed.toLocaleString("en-US")} affected by load shedding (planned rolling cuts when there is not enough power).` : " No load shedding."}`,
        note: "Read from the power company's public outage map when you asked, by region. A shop or pharmacy in a region with many customers out may be closed or running on a generator; check before sending someone.",
      },
    };
  }
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
  const prCodes = route.codes.filter((c) => PR_NAMES[c.toLowerCase()]);
  // The current status is the answer; the look-ahead sources add to it when they can be reached.
  const [text, planText, tafText, gtwoText, metarText, eventsText] = await Promise.all([
    read(FAA_URL, {}, now),
    read(PLAN_URL, {}, now),
    read(TAF_URL(route.codes.map(icaoFor)), { "user-agent": "safehubby.com" }, now),
    prCodes.length ? read(GTWO_URL, { "user-agent": "safehubby.com" }, now) : Promise.resolve(null),
    read(METAR_URL(route.codes.map(icaoFor)), { "user-agent": "safehubby.com" }, now),
    read(EVENTS_URL, {}, now),
  ]);
  const parsed = text === null ? null : route.codes.map((code) => ({ code, status: parseFaa(text, code) }));
  if (!parsed || parsed.some((p) => !p.status)) return none(q, "The FAA airport status could not be read just now.");
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
    const signals = [
      ...(field?.lightning ? [`At the field now: lightning or thunderstorms (${field.ageMinutes} minutes ago). Ground crews usually stop work outside when lightning is close, so departures can stall before any delay is posted.`] : []),
      ...(field && /IFR/.test(field.flightCategory ?? "") ? [`At the field now: low cloud or poor visibility (${field.flightCategory}), which lowers how many flights can land each hour.`] : []),
      ...(field && field.specialReportsLastHour >= 2 ? [`At the field: ${field.specialReportsLastHour} special weather reports in the last hour, which means the weather is changing fast.`] : []),
      ...p.status!.issues.map((i) => `Now: ${i.kind}${i.reason ? ` (${i.reason})` : ""}.`),
      ...(forecast?.hazards ?? []).map((h) => `Forecast: ${h.what.join(", ")} ${hhmm(h.from)} to ${hhmm(h.to)}${h.chancePercent ? ` (${h.chancePercent}% chance)` : ""}.`),
      ...(faaPlan?.forThisAirport ?? []).map((e) => `FAA plan: ${e.what}${e.when ? ` ${e.when}Z` : ""}.`),
      ...(delayedHubsNow.length ? [`Delays now at ${delayedHubsNow.map((h) => h.code).join(", ")}: a flight from there may arrive late.`] : []),
      ...(tropicalOutlook?.systems ?? []).filter((x) => x.chance7dPercent >= 40).map((x) => `A storm may form within 7 days (${x.chance7dPercent}% chance): ${short(x.text, 90)}`),
    ];
    return { code: p.code, updatedAt: p.status!.updatedAt, issues: p.status!.issues, outlook: { signals, atTheField: field, faaRates: rates, forecast, faaPlan, delayedHubsNow, tropicalOutlook } };
  });
  const listed = airports.filter((a) => a.issues.length);
  const ahead = airports.reduce((n, a) => n + a.outlook.signals.length - a.issues.length, 0);
  return {
    status: 200, results: airports.length, summary: "live/airport", words: q.toLowerCase(),
    body: {
      q, source: "FAA National Airspace System Status", asOf: now.toISOString(), airports,
      summary: `${listed.length ? `${listed.map((a) => `${a.code}: ${a.issues.map((i) => i.kind).join(", ")}`).join("; ")}.` : `No delay, ground program or closure is listed for ${airports.map((a) => a.code).join(", ")}.`} ${ahead ? `${ahead} sign${ahead === 1 ? "" : "s"} of possible delays ahead; see outlook.signals.` : "No signs of delays ahead in the forecast or the FAA plan."}`,
      note: "The FAA lists only airports with something to report, so an airport that is not listed has no reported delay at the time shown. Conditions can change at any time. Not a forecast, and not a promise about any flight.",
      outlookNote: "The outlook reads the airport's latest observation and official forecast (Aviation Weather Center), the arrival rate the FAA has set, the FAA's plan for the day, big airports delayed now and, for Puerto Rico, the hurricane center's outlook. It shows signs that often come before delays. It is not a prediction about any flight. A part is null when its source could not be reached.",
    },
  };
}
