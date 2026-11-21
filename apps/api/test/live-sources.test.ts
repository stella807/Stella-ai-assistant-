import { afterEach, describe, expect, it } from "vitest";
import { answerLive, clearLiveCache, routeLive, setLiveFetcher } from "../src/live-feeds.ts";
import { noticesFor, parseBuoy, parseNotices, parseQuakes, parseRivers, parseTide } from "../src/live-sources.ts";

const now = new Date("2026-11-21T23:40:00Z");
const QUAKES = JSON.stringify({ features: [
  { properties: { mag: 3.1, place: "8 km W of Orocovis, Puerto Rico", time: Date.parse("2026-11-21T10:00:00Z"), tsunami: 0, felt: 4, status: "reviewed" }, geometry: { coordinates: [-66.4, 18.2, 12.5] } },
  { properties: { mag: 4.2, place: "Puerto Rico region", time: Date.parse("2026-11-01T10:00:00Z"), tsunami: 0, status: "reviewed" }, geometry: { coordinates: [-66, 19, 30] } },
] });
const TIDE = JSON.stringify({ metadata: { name: "San Juan, La Puntilla, San Juan Bay" }, data: [{ t: "2026-11-21 23:30", v: "1.68" }] });
const BUOY = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 11 21 23 00 170  3.0  4.0    MM    MM    MM  MM 1013.9  27.4    MM    MM   MM +0.8    MM
2026 11 21 22 40 160  3.5  4.5   1.6     9   6.1  70 1013.8  27.5  28.1    MM   MM    MM    MM`;
const series = (name: string, id: string, values: string[]) => ({ sourceInfo: { siteName: name, siteCode: [{ value: id }] }, variable: { noDataValue: -999999 }, values: [{ value: values.map((v, i) => ({ dateTime: `2026-11-21T1${6 + i}:00:00.000-04:00`, value: v })) }] });
const RIVERS = JSON.stringify({ value: { timeSeries: [series("RIO A, PR", "1", ["2.0", "2.1"]), series("RIO B, PR", "2", ["5.0", "6.2", "8.3"]), series("BROKEN, PR", "3", ["-999999"])] } });
const RSS = `<rss><channel><item><title>Dominican Republic - Level 2: Exercise Increased Caution</title><pubDate>Fri, 23 Oct 2026</pubDate><description><![CDATA[<p>Exercise <b>increased caution</b>. See https://x.example</p>]]></description></item>
<item><title>Iran - Level 4: Do Not Travel</title><pubDate>Fri, 23 Oct 2026</pubDate><description>Do not travel.</description></item></channel></rss>`;

afterEach(() => { setLiveFetcher(undefined); clearLiveCache(); });

describe("the extra official sources", () => {
  it("keeps only the last week's quakes, with depth, and nothing else", () => {
    const q = parseQuakes(QUAKES, now)!;
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ magnitude: 3.1, place: "8 km W of Orocovis, Puerto Rico", depthKm: 12.5, feltReports: 4, tsunamiFlag: false });
    expect(parseQuakes("nope", now)).toBeNull();
  });

  it("reads the tide in feet and the buoy in feet and knots, with the time each was measured", () => {
    expect(parseTide(TIDE)).toMatchObject({ waterLevelFeet: 1.68, observedAt: "2026-11-21T23:30:00.000Z" });
    const b = parseBuoy(BUOY)!;
    // Wind from the newest row; waves from the newest row that has them.
    expect(b).toMatchObject({ observedAt: "2026-11-21T23:00:00.000Z", windKnots: 5.8, gustKnots: 7.8, waveHeightFeet: 5.2, dominantPeriodSec: 9, airTempC: 27.4 });
    expect(parseBuoy("#only headers")).toBeNull();
  });

  it("puts the river rising fastest first and skips gauges with no reading", () => {
    const r = parseRivers(RIVERS)!;
    expect(r.map((g) => g.site)).toEqual(["RIO B, PR", "RIO A, PR"]);
    expect(r[0]).toMatchObject({ heightFeet: 8.3, changeFeet3h: 3.3 });
  });

  it("reads advisories with their level, without links, and finds a country by name", () => {
    const n = parseNotices(RSS)!;
    expect(n[0]).toMatchObject({ title: "Dominican Republic - Level 2: Exercise Increased Caution", level: 2 });
    expect(JSON.stringify(n)).not.toMatch(/https?:/);
    expect(noticesFor(n, "dominican republic")).toHaveLength(1);
    expect(noticesFor(n, "")).toHaveLength(2);
  });

  it("routes questions in English and Spanish to the right source, and keeps town names out of the river route", () => {
    expect(routeLive("earthquakes near Puerto Rico")?.source).toBe("quake");
    expect(routeLive("temblor hoy")?.source).toBe("quake");
    expect(routeLive("olas en San Juan")?.source).toBe("sea");
    expect(routeLive("river levels")?.source).toBe("river");
    expect(routeLive("weather in rio grande")?.source).toBe("weather");
    expect(routeLive("travel advisory Dominican Republic")).toEqual({ source: "advisory", place: "dominican republic" });
    expect(routeLive("flood advisory in Aguada")?.source).toBe("weather");
    expect(routeLive("cdc outbreak Senegal")).toEqual({ source: "health", place: "senegal" });
  });

  it("answers from the source, and charges nothing when the source cannot be read", async () => {
    setLiveFetcher(async (url) => (url.includes("travel.state.gov") ? new Response(RSS) : new Response("no", { status: 503 })));
    const a = await answerLive("travel advisory Dominican Republic", now);
    expect(a.status).toBe(200);
    expect((a.body as { summary: string }).summary).toBe("Dominican Republic - Level 2: Exercise Increased Caution");
    const all = await answerLive("travel advisory", now);
    expect((all.body as { notices: unknown[] }).notices).toHaveLength(1);
    const down = await answerLive("earthquakes", now);
    expect(down.status).toBe(404);
    expect(JSON.stringify(down.body)).toContain("not charged");
  });
});
