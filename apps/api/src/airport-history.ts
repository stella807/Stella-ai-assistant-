/**
 * How flights at Puerto Rico's airports have gone, by day of the week and hour, from a year of US DOT on-time data (public domain),
 * built by scripts/build-airport-history.mjs into data/pr-airport-history.json. Nothing is downloaded at run time.
 *
 * TSA's hourly checkpoint counts could not be read from here (its site refuses automated downloads), so the busy hours for security
 * lines use scheduled departures by hour as a stand-in, and say so. There is no free official cruise schedule, so cruise days are not
 * guessed; the busiest days of the week in the data stand in for them, and the answer says that too.
 */
import { readFileSync } from "node:fs";

type Cell = { perDay: number; delayedPct: number | null; cancelledPct: number | null; avgDelayMin: number | null; taxiOutMin?: number };
type AirportData = {
  departuresPerDay: number; delayedPct: number | null; cancelledPct: number | null; delayCausesPct: Record<string, number | null>;
  byMonth: { month: number; departuresPerDay: number; delayedPct: number | null; cancelledPct: number | null }[];
  departures: Cell[][]; arrivals: Cell[][];
};
type History = { source: string; from: string; to: string; days: number; airports: Record<string, AirportData> };

const data: History = JSON.parse(readFileSync(new URL("../data/pr-airport-history.json", import.meta.url), "utf8"));
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Puerto Rico keeps Atlantic Standard Time all year: UTC minus 4, no daylight saving. */
const PR_OFFSET_MS = -4 * 3_600_000;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** The two hours before each busy departure hour, joined where they overlap: 06:00 and 07:00 give one window, 04:00 to 07:00. */
function busyWindows(hours: number[]): string[] {
  const spans: [number, number][] = [];
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = spans[spans.length - 1];
    if (last && h - 2 <= last[1]) last[1] = h; else spans.push([h - 2, h]);
  }
  return spans.map(([a, b]) => `${hh((a + 24) % 24)} to ${hh(b)}`);
}

export function historyFor(code: string, now: Date) {
  const a = data.airports[code.toUpperCase()];
  if (!a) return null;
  const local = new Date(now.getTime() + PR_OFFSET_MS);
  const dow = (local.getUTCDay() + 6) % 7, hour = local.getUTCHours(), month = local.getUTCMonth();
  const nextHours = Array.from({ length: 6 }, (_, i) => {
    const h = (hour + i) % 24, d = (dow + Math.floor((hour + i) / 24)) % 7;
    const dep = a.departures[d]![h]!, arr = a.arrivals[d]![h]!;
    return { day: DAYS[d], hourLocal: hh(h), departuresPerDay: dep.perDay, departuresDelayedPct: dep.delayedPct, cancelledPct: dep.cancelledPct, avgDelayMin: dep.avgDelayMin, taxiOutMin: dep.taxiOutMin ?? null, arrivalsPerDay: arr.perDay, arrivalsDelayedPct: arr.delayedPct };
  });
  const today = a.departures[dow]!;
  const busiest = today.map((c, h) => ({ h, c })).filter((x) => x.c.perDay > 0).sort((x, y) => y.c.perDay - x.c.perDay).slice(0, 3).sort((x, y) => x.h - y.h);
  const busyDays = a.departures.map((hours, d) => ({ day: DAYS[d]!, departuresPerDay: Math.round(hours.reduce((n, c) => n + c.perDay, 0) * 10) / 10 })).sort((x, y) => y.departuresPerDay - x.departuresPerDay);
  const thisMonth = a.byMonth[month]!;
  return {
    source: data.source, period: { from: data.from, to: data.to },
    localTime: `${DAYS[dow]} ${hh(hour).slice(0, 2)}:${String(local.getUTCMinutes()).padStart(2, "0")} (Puerto Rico)`,
    overall: { departuresPerDay: a.departuresPerDay, delayedPct: a.delayedPct, cancelledPct: a.cancelledPct, delayCausesPct: a.delayCausesPct },
    nextHours,
    securityLines: {
      busiestDepartureHoursToday: busiest.map((x) => ({ hourLocal: hh(x.h), departuresPerDay: x.c.perDay, delayedPct: x.c.delayedPct })),
      likelyBusyFrom: busyWindows(busiest.map((x) => x.h)),
      note: "TSA's hourly checkpoint counts could not be read, so this uses scheduled departures by hour as a stand-in. Lines usually build in the 1 to 2 hours before the busiest departure hours.",
    },
    busiestDaysOfWeek: busyDays.slice(0, 3),
    thisMonthLastYear: { month: MONTHS[month], departuresPerDay: thisMonth.departuresPerDay, delayedPct: thisMonth.delayedPct, cancelledPct: thisMonth.cancelledPct },
    note: "From a year of flights by the carriers that report to the US DOT. It shows what usually happens at this hour and day, not what will happen to any flight. Cruise days are not included: there is no free official cruise schedule.",
  };
}

export type AirportHistory = NonNullable<ReturnType<typeof historyFor>>;

/** Plain lines for the outlook: an hour that is usually late, and a busy departure bank coming up. */
export function historySignals(h: AirportHistory): string[] {
  const out: string[] = [];
  const base = h.overall.delayedPct ?? 0;
  const worst = h.nextHours.slice(0, 3).filter((x) => (x.departuresDelayedPct ?? 0) >= Math.max(25, base * 1.25) && x.departuresPerDay >= 1).sort((x, y) => (y.departuresDelayedPct ?? 0) - (x.departuresDelayedPct ?? 0))[0];
  if (worst) out.push(`History: about ${worst.departuresDelayedPct}% of departures at ${worst.hourLocal} on ${worst.day}s left 15 or more minutes late over the past year (${base}% across all hours).`);
  const soon = h.securityLines.busiestDepartureHoursToday.find((b) => h.nextHours.slice(0, 3).some((n) => n.hourLocal === b.hourLocal));
  if (soon) out.push(`Busy departure hour at ${soon.hourLocal} (about ${soon.departuresPerDay} departures): security lines usually build 1 to 2 hours before.`);
  return out;
}
