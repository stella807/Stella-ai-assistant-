/**
 * Parsers for the extra official sources in live answers: USGS earthquakes and river gauges, NOAA's San Juan tide station and
 * offshore buoy, the State Department's travel advisories and the CDC's travel health notices. Pure functions over the text
 * each source returns, so they are tested without the network; live-feeds.ts reads the sources and routes questions here.
 */
const scrub = (t: unknown, max: number) => String(t ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v: unknown) => { if (v === null || v === undefined || v === "" || v === "MM") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const iso = (v: unknown) => { const d = new Date(typeof v === "number" ? v : String(v ?? "")); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

// Puerto Rico and the waters around it, where the Puerto Rico Seismic Network reports.
export const QUAKE_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=50&minlatitude=17&maxlatitude=19.5&minlongitude=-68.5&maxlongitude=-64.5&minmagnitude=2.5";
export const TIDE_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9755371&product=water_level&date=latest&datum=MLLW&units=english&time_zone=gmt&format=json";
export const BUOY_URL = "https://www.ndbc.noaa.gov/data/realtime2/41053.txt";
export const RIVER_URL = "https://waterservices.usgs.gov/nwis/iv/?format=json&stateCd=pr&parameterCd=00065&siteStatus=active&period=PT3H";
export const ADVISORY_URL = "https://travel.state.gov/_res/rss/TAsTWs.xml";
export const CDC_URL = "https://wwwnc.cdc.gov/travel/rss/notices.xml";

export interface Quake { magnitude: number | null; place: string; time: string | null; depthKm: number | null; tsunamiFlag: boolean; feltReports: number | null; status: string }

/** Earthquakes of magnitude 2.5 and up near Puerto Rico in the window asked for (USGS GeoJSON), newest first. */
export function parseQuakes(text: string, now: Date, days = 7): Quake[] | null {
  try {
    const d = JSON.parse(text) as { features?: { properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }[] };
    if (!Array.isArray(d.features)) return null;
    const since = now.getTime() - days * 86_400_000;
    return d.features.filter((f) => Number(f.properties?.time) >= since).map((f) => ({
      magnitude: num(f.properties?.mag), place: scrub(f.properties?.place, 120), time: iso(Number(f.properties?.time)),
      depthKm: num(f.geometry?.coordinates?.[2]), tsunamiFlag: Number(f.properties?.tsunami) === 1, feltReports: num(f.properties?.felt), status: scrub(f.properties?.status, 20),
    }));
  } catch { return null; }
}

export interface Tide { station: string; observedAt: string | null; waterLevelFeet: number | null; datum: string }

/** The latest water level at San Juan (La Puntilla), in feet above mean lower low water. */
export function parseTide(text: string): Tide | null {
  try {
    const d = JSON.parse(text) as { metadata?: { name?: string }; data?: { t?: string; v?: string }[] };
    const row = d.data?.[0];
    if (!row) return null;
    return { station: scrub(d.metadata?.name, 80) || "San Juan", observedAt: iso(`${row.t}Z`), waterLevelFeet: num(row.v), datum: "feet above mean lower low water (MLLW)" };
  } catch { return null; }
}

export interface Buoy { station: string; observedAt: string | null; waveHeightFeet: number | null; dominantPeriodSec: number | null; windKnots: number | null; gustKnots: number | null; windFromDegrees: number | null; waterTempC: number | null; airTempC: number | null }

/** The newest row of NOAA buoy 41053 (San Juan, a few miles offshore). Wave columns are often blank between readings. */
export function parseBuoy(text: string): Buoy | null {
  const rows = text.split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/));
  const r = rows[0];
  if (!r || r.length < 15) return null;
  const kt = (ms: string | undefined) => { const n = num(ms); return n === null ? null : Math.round(n * 1.94384 * 10) / 10; };
  const ft = (m: string | undefined) => { const n = num(m); return n === null ? null : Math.round(n * 3.28084 * 10) / 10; };
  // The newest row that has a wave reading, since waves are measured less often than wind.
  const waves = rows.find((x) => num(x[8]) !== null);
  return {
    station: "NOAA buoy 41053, San Juan", observedAt: iso(`${r[0]}-${r[1]}-${r[2]}T${r[3]}:${r[4]}:00Z`),
    waveHeightFeet: waves ? ft(waves[8]) : null, dominantPeriodSec: waves ? num(waves[9]) : null,
    windKnots: kt(r[6]), gustKnots: kt(r[7]), windFromDegrees: num(r[5]), waterTempC: num(r[14]), airTempC: num(r[13]),
  };
}

export interface RiverGauge { site: string; id: string; heightFeet: number; changeFeet3h: number | null; observedAt: string | null }

/** River and stream gauges in Puerto Rico: the latest height and how much it changed over about three hours, biggest rise first. */
export function parseRivers(text: string): RiverGauge[] | null {
  try {
    const d = JSON.parse(text) as { value?: { timeSeries?: { sourceInfo?: { siteName?: string; siteCode?: { value?: string }[] }; variable?: { noDataValue?: number }; values?: { value?: { dateTime?: string; value?: string }[] }[] }[] } };
    const series = d.value?.timeSeries;
    if (!Array.isArray(series)) return null;
    const out: RiverGauge[] = [];
    for (const s of series) {
      const missing = s.variable?.noDataValue ?? -999999;
      const pts = (s.values?.[0]?.value ?? []).map((v) => ({ at: v.dateTime, h: num(v.value) })).filter((p): p is { at: string; h: number } => p.h !== null && p.h !== missing && Boolean(p.at));
      const last = pts.at(-1);
      if (!last) continue;
      const first = pts[0]!;
      out.push({ site: scrub(s.sourceInfo?.siteName, 100), id: scrub(s.sourceInfo?.siteCode?.[0]?.value, 20), heightFeet: last.h, changeFeet3h: pts.length > 1 ? Math.round((last.h - first.h) * 100) / 100 : null, observedAt: iso(last.at) });
    }
    return out.sort((a, b) => (b.changeFeet3h ?? -Infinity) - (a.changeFeet3h ?? -Infinity));
  } catch { return null; }
}

export interface Notice { title: string; level: number | null; published: string | null; summary: string }

const items = (xml: string) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]!);
const field = (block: string, name: string) => {
  const raw = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block)?.[1] ?? "";
  return raw.replace(/^<!\[CDATA\[|\]\]>$/g, "");
};

/** Items of an RSS feed of notices whose title says "Level N" (State Department advisories, CDC travel notices). */
export function parseNotices(xml: string): Notice[] | null {
  if (!/<rss|<channel/i.test(xml)) return null;
  return items(xml).map((b) => {
    const title = scrub(field(b, "title"), 140);
    return { title, level: num(/Level\s*(\d)/i.exec(title)?.[1]), published: iso(scrub(field(b, "pubDate"), 60)), summary: scrub(field(b, "description"), 300) };
  });
}

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** The notices whose title names the place asked about (the whole phrase, accents ignored); every notice when none is named. */
export const noticesFor = (notices: Notice[], place: string) => {
  const p = plain(place).trim();
  if (!p) return notices;
  return notices.filter((n) => plain(n.title).includes(p));
};
