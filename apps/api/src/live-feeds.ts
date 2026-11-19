/**
 * Live answers from two free public sources, so nothing here needs a person: the National Weather Service's active alerts for
 * Puerto Rico, and the FAA's airport status (delays, ground programs, closures). Every answer names its source and says when it
 * was read. An answer is never made up: a source that is down, or a question no source covers, gives no answer and no charge.
 * A copy is kept for five minutes so many agents asking at once do not hammer the sources; if a source is down, a copy up to
 * fifteen minutes old may still be served, and no older one.
 */
import { AIRPORTS } from "@safehubby/core";

type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
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

const NWS_URL = "https://api.weather.gov/alerts/active?area=PR";
const FAA_URL = "https://nasstatus.faa.gov/api/airport-status-information";

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
const WEATHER = /\b(storms?|hurricanes?|tropical|weather|floods?|flooding|alerts?|warnings?|advisor(?:y|ies)|rain|tormentas?|huracan(?:es)?|inundacion(?:es)?|lluvia|alertas?|avisos?|clima)\b/;
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
    const text = await read(NWS_URL, { "user-agent": "safehubby.com", accept: "application/geo+json" }, now);
    if (text === null) return none(q, "The National Weather Service could not be reached just now.");
    const alerts = parseNws(text);
    return {
      status: 200, results: alerts.length || 1, summary: "live/weather", words: q.toLowerCase(),
      body: {
        q, source: "National Weather Service", sourceNote: "Active alerts for Puerto Rico", asOf: now.toISOString(), alerts,
        summary: alerts.length ? `${alerts.length} active alert${alerts.length === 1 ? "" : "s"} for Puerto Rico.` : "No active weather alerts for Puerto Rico were listed.",
        note: "Read from the National Weather Service when you asked. Alerts change quickly; for any storm follow the National Weather Service and local officials. Not a forecast.",
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
