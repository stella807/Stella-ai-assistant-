// Builds data/pr-airport-history.json: how flights at Puerto Rico's airports have gone, by day of the week and hour, from the
// US DOT Bureau of Transportation Statistics on-time data (public domain). Run by hand when a newer year is wanted:
//   node apps/api/scripts/build-airport-history.mjs /path/to/On_Time_..._2025_10.zip ... (one zip per month, from transtats.bts.gov/PREZIP)
// Only the large carriers that report to BTS are in this data. The JSON is committed so the server never downloads anything.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const AIRPORTS = ["SJU", "BQN", "PSE"];

/** One CSV line into fields, honoring quotes (city names carry commas). */
export function splitCsv(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const cell = () => ({ flights: 0, delayed: 0, cancelled: 0, delayMin: 0, operated: 0, taxiOut: 0, taxiN: 0 });
const grid = () => Array.from({ length: 7 }, () => Array.from({ length: 24 }, cell));

/** Adds up rows (objects keyed by the BTS column names) into counts per airport, day of the week and hour. */
export function aggregate(rows) {
  const acc = Object.fromEntries(AIRPORTS.map((a) => [a, { dep: grid(), arr: grid(), month: Array.from({ length: 12 }, cell), causes: { carrier: 0, weather: 0, nas: 0, security: 0, lateAircraft: 0 } }]));
  const dates = new Set(); const dowDates = Array.from({ length: 7 }, () => new Set()); const monthDates = Array.from({ length: 12 }, () => new Set());
  let first = "", last = "";
  for (const r of rows) {
    const date = r.FlightDate; const dow = Number(r.DayOfWeek) - 1; const month = Number(r.Month) - 1;
    if (!date || dow < 0 || dow > 6) continue;
    dates.add(date); dowDates[dow].add(date); monthDates[month].add(date);
    if (!first || date < first) first = date; if (!last || date > last) last = date;
    const cancelled = Number(r.Cancelled) === 1;
    const add = (c, delayed15, delayMin, taxi) => {
      c.flights++; if (cancelled) { c.cancelled++; return; }
      c.operated++; if (Number(delayed15) === 1) c.delayed++; c.delayMin += Number(delayMin) || 0;
      if (taxi !== undefined && taxi !== "") { c.taxiOut += Number(taxi) || 0; c.taxiN++; }
    };
    const hour = (t) => (Number(String(t).padStart(4, "0").slice(0, 2)) % 24);
    if (acc[r.Origin]) {
      const a = acc[r.Origin];
      add(a.dep[dow][hour(r.CRSDepTime)], r.DepDel15, r.DepDelayMinutes, r.TaxiOut);
      add(a.month[month], r.DepDel15, r.DepDelayMinutes);
      if (!cancelled && Number(r.DepDel15) === 1) {
        a.causes.carrier += Number(r.CarrierDelay) || 0; a.causes.weather += Number(r.WeatherDelay) || 0; a.causes.nas += Number(r.NASDelay) || 0;
        a.causes.security += Number(r.SecurityDelay) || 0; a.causes.lateAircraft += Number(r.LateAircraftDelay) || 0;
      }
    }
    if (acc[r.Dest]) add(acc[r.Dest].arr[dow][hour(r.CRSArrTime)], r.ArrDel15, r.ArrDelayMinutes);
  }
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
  const per = (n, d) => (d ? Math.round((n / d) * 10) / 10 : 0);
  const out = { source: "US DOT Bureau of Transportation Statistics, Reporting Carrier On-Time Performance (public domain). Only carriers that report to BTS.", from: first, to: last, days: dates.size, airports: {} };
  for (const [code, a] of Object.entries(acc)) {
    const shape = (g) => g.map((hours, d) => hours.map((c) => ({ perDay: per(c.flights, dowDates[d].size), delayedPct: pct(c.delayed, c.operated), cancelledPct: pct(c.cancelled, c.flights), avgDelayMin: c.operated ? Math.round(c.delayMin / c.operated) : null, ...(c.taxiN ? { taxiOutMin: Math.round(c.taxiOut / c.taxiN) } : {}) })));
    const total = a.month.reduce((t, c) => ({ flights: t.flights + c.flights, operated: t.operated + c.operated, delayed: t.delayed + c.delayed, cancelled: t.cancelled + c.cancelled }), { flights: 0, operated: 0, delayed: 0, cancelled: 0 });
    const causeSum = Object.values(a.causes).reduce((x, y) => x + y, 0);
    out.airports[code] = {
      departuresPerDay: per(total.flights, dates.size), delayedPct: pct(total.delayed, total.operated), cancelledPct: pct(total.cancelled, total.flights),
      delayCausesPct: Object.fromEntries(Object.entries(a.causes).map(([k, v]) => [k, pct(v, causeSum)])),
      byMonth: a.month.map((c, m) => ({ month: m + 1, departuresPerDay: per(c.flights, monthDates[m].size), delayedPct: pct(c.delayed, c.operated), cancelledPct: pct(c.cancelled, c.flights) })),
      departures: shape(a.dep), arrivals: shape(a.arr),
    };
  }
  return out;
}

async function* rowsFrom(zip) {
  const child = spawn("unzip", ["-p", zip, "*.csv"]);
  let header = null;
  for await (const line of createInterface({ input: child.stdout })) {
    if (!header) { header = splitCsv(line); continue; }
    if (!/"(SJU|BQN|PSE)"/.test(line)) continue;
    const f = splitCsv(line);
    yield Object.fromEntries(header.map((h, i) => [h, f[i]]));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const zips = process.argv.slice(2);
  if (!zips.length) { console.error("Give the monthly BTS zip files."); process.exit(1); }
  const rows = [];
  for (const z of zips) { let n = 0; for await (const r of rowsFrom(z)) { rows.push(r); n++; } console.log(z, n, "rows"); }
  const out = aggregate(rows);
  const target = fileURLToPath(new URL("../data/pr-airport-history.json", import.meta.url));
  writeFileSync(target, JSON.stringify(out) + "\n");
  console.log(`${out.from} to ${out.to}, ${out.days} days`, Object.fromEntries(Object.entries(out.airports).map(([k, v]) => [k, { perDay: v.departuresPerDay, delayedPct: v.delayedPct }])));
}
