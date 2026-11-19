import { describe, expect, it } from "vitest";
import { historyFor, historySignals } from "../src/airport-history.ts";
// @ts-expect-error a plain script, imported for its pure parts
import { aggregate, splitCsv } from "../scripts/build-airport-history.mjs";

describe("building the history from the DOT's on-time records", () => {
  it("splits CSV lines with commas inside quotes", () => {
    expect(splitCsv('2026,"Orlando, FL","SJU",,"1640"')).toEqual(["2026", "Orlando, FL", "SJU", "", "1640"]);
  });

  it("counts departures, delays, cancellations and taxi time by day of the week and hour", () => {
    const row = (o: Record<string, string>) => ({ Month: "11", DayOfWeek: "6", FlightDate: "2026-11-21", Origin: "SJU", Dest: "MIA", CRSDepTime: "1505", CRSArrTime: "1830", Cancelled: "0.00", DepDel15: "0.00", DepDelayMinutes: "0", TaxiOut: "10", ArrDel15: "0", ArrDelayMinutes: "0", ...o });
    const out = aggregate([row({}), row({ DepDel15: "1.00", DepDelayMinutes: "40", TaxiOut: "20", LateAircraftDelay: "40" }), row({ Cancelled: "1.00", TaxiOut: "" })]);
    const c = out.airports.SJU.departures[5][15];
    expect(c).toMatchObject({ perDay: 3, delayedPct: 50, cancelledPct: 33.3, avgDelayMin: 20, taxiOutMin: 15 });
    expect(out.airports.SJU.delayCausesPct.lateAircraft).toBe(100);
    expect(out.from).toBe("2026-11-21");
  });
});

describe("what usually happens at Puerto Rico's airports", () => {
  const saturday = new Date("2026-11-21T17:10:00Z"); // 13:10 in Puerto Rico

  it("uses Puerto Rico's time, and reads the next six hours for that day of the week", () => {
    const h = historyFor("SJU", saturday)!;
    expect(h.localTime).toBe("Saturday 13:10 (Puerto Rico)");
    expect(h.nextHours).toHaveLength(6);
    expect(h.nextHours[0]).toMatchObject({ day: "Saturday", hourLocal: "13:00" });
    expect(h.nextHours[0]!.departuresPerDay).toBeGreaterThan(0);
    expect(h.period.from < h.period.to).toBe(true);
  });

  it("names the busiest departure hours, says lines build before them, and says what it is standing in for", () => {
    const h = historyFor("SJU", saturday)!;
    expect(h.securityLines.busiestDepartureHoursToday).toHaveLength(3);
    expect(h.securityLines.note).toMatch(/TSA/);
    expect(h.securityLines.likelyBusyFrom.length).toBeLessThanOrEqual(3);
    for (const w of h.securityLines.likelyBusyFrom) expect(w).toMatch(/^\d\d:00 to \d\d:00$/);
    expect(h.note).toMatch(/cruise/i);
    expect(h.note).toMatch(/not what will happen/i);
  });

  it("turns a usually-late hour or a coming busy bank into a plain line", () => {
    const lines = historySignals(historyFor("SJU", saturday)!);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(" ")).toMatch(/History: about|Busy departure hour/);
  });

  it("crosses midnight into the next day, and has nothing for airports outside Puerto Rico", () => {
    const late = historyFor("SJU", new Date("2026-11-22T02:30:00Z"))!; // Saturday 22:30 in Puerto Rico
    expect(late.nextHours[2]).toMatchObject({ day: "Sunday", hourLocal: "00:00" });
    expect(historyFor("JFK", saturday)).toBeNull();
  });
});
