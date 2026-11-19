import { afterEach, describe, expect, it } from "vitest";
import { answerLive, clearLiveCache, parseFaa, parseNws, routeLive, setLiveFetcher } from "../src/live-feeds.ts";

const NWS = JSON.stringify({ features: [
  { properties: { id: "a1", event: "Flash Flood Warning", severity: "Severe", headline: "Flash Flood Warning issued for Naguabo", areaDesc: "Naguabo, PR", sent: "2026-11-19T21:00:00+00:00", expires: "2026-11-19T22:00:00+00:00", senderName: "NWS San Juan PR", instruction: "Move to higher ground. Call 555-123-4567 or see https://x.example", description: "Heavy rain." } },
  { properties: { id: "a2", event: "Flood Advisory", severity: "Minor", headline: "Flood Advisory for Aguada", areaDesc: "Aguada, PR; Anasco, PR", sent: "2026-11-19T20:00:00+00:00", expires: "2026-11-19T21:00:00+00:00", senderName: "NWS San Juan PR" } },
] });
const FAA = `<AIRPORT_STATUS_INFORMATION><Update_Time>Thu Nov 19 19:42:39 2026 GMT</Update_Time>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>SJU</ARPT><Reason>thunderstorms</Reason><Avg>55 minutes</Avg><Max>2 hours and 15 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type>
<Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List><Delay><ARPT>LAS</ARPT><Reason>WX:Low Ceilings</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay></Arrival_Departure_Delay_List></Delay_type>
<Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>PSE</ARPT><Reason>runway work</Reason><Start>Nov 15 at 07:30 UTC.</Start><Reopen>Nov 21 at 14:15 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;
const now = new Date("2026-11-19T21:30:00Z");
const fake = (map: Record<string, string>, calls: string[] = []) => async (url: string) => { calls.push(url); const body = Object.entries(map).find(([k]) => url.includes(k))?.[1]; return body === undefined ? new Response("no", { status: 503 }) : new Response(body, { status: 200 }); };

afterEach(() => { setLiveFetcher(undefined); clearLiveCache(); });

describe("reading the two public sources", () => {
  it("keeps what the weather service said, who said it, and until when, with no links or phone numbers", () => {
    const a = parseNws(NWS);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ event: "Flash Flood Warning", severity: "Severe", area: "Naguabo, PR", expires: "2026-11-19T22:00:00.000Z", issuedBy: "NWS San Juan PR" });
    expect(JSON.stringify(a)).not.toMatch(/https?:|555-123/);
  });

  it("finds an airport's delays, ground programs and closures in the FAA feed, and says nothing when none is listed", () => {
    expect(parseFaa(FAA, "SJU")).toMatchObject({ updatedAt: "2026-11-19T19:42:39.000Z", issues: [{ kind: "ground delay program", reason: "thunderstorms", average: "55 minutes", max: "2 hours and 15 minutes" }] });
    expect(parseFaa(FAA, "PSE")!.issues[0]).toMatchObject({ kind: "closure", reopens: "Nov 21 at 14:15 UTC." });
    expect(parseFaa(FAA, "BQN")!.issues).toEqual([]);
    expect(parseFaa("<html>nope</html>", "SJU")).toBeNull();
  });
});

describe("working out what is being asked", () => {
  it("sends storm and flood words to the weather, in English or Spanish", () => {
    for (const q of ["any storm warnings in puerto rico", "alerta de inundacion", "hurricane", "flood"]) expect(routeLive(q), q).toEqual({ source: "weather" });
  });
  it("sends an airport code or a city's airport to the airport source, and says when it is not a US airport", () => {
    expect(routeLive("SJU delays")).toEqual({ source: "airport", codes: ["SJU"] });
    expect(routeLive("is the aeropuerto in san juan delayed")).toEqual({ source: "airport", codes: ["SJU"] });
    expect(routeLive("flight delay Ponce")).toEqual({ source: "airport", codes: ["PSE"] });
  });
  it("has no live source for what it does not cover", () => {
    expect(routeLive("is the pharmacy open")).toBeNull();
    expect(routeLive("")).toBeNull();
  });
});

describe("answering", () => {
  it("answers from the source, dated, naming who said it, and caches it for a few minutes", async () => {
    const calls: string[] = [];
    setLiveFetcher(fake({ "weather.gov": NWS, "nasstatus": FAA }, calls));
    const one = await answerLive("storm warnings puerto rico", now);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ source: "National Weather Service", asOf: now.toISOString() });
    expect((one.body as any).alerts[0].event).toBe("Flash Flood Warning");
    await answerLive("flood", new Date(now.getTime() + 60_000));
    expect(calls.filter((c) => c.includes("weather.gov"))).toHaveLength(1);
    await answerLive("flood", new Date(now.getTime() + 10 * 60_000));
    expect(calls.filter((c) => c.includes("weather.gov"))).toHaveLength(2);
  });

  it("says plainly when there is nothing active, which is itself an answer", async () => {
    setLiveFetcher(fake({ "weather.gov": JSON.stringify({ features: [] }) }));
    const r = await answerLive("flood", now);
    expect(r.status).toBe(200);
    expect((r.body as any).alerts).toEqual([]);
    expect((r.body as any).summary).toMatch(/no active/i);
  });

  it("reports an airport with no listed delay as exactly that, not as a promise", async () => {
    setLiveFetcher(fake({ "nasstatus": FAA }));
    const r = await answerLive("BQN delays", now);
    expect(r.status).toBe(200);
    expect((r.body as any).summary).toMatch(/no delay.*listed/i);
    expect((r.body as any).note).toMatch(/not a (forecast|promise)|can change/i);
  });

  it("refuses, and so does not charge, when the source is down or the question has no source", async () => {
    setLiveFetcher(fake({}));
    expect((await answerLive("flood", now)).status).toBe(404);
    expect((await answerLive("SJU delays", now)).status).toBe(404);
    setLiveFetcher(fake({ "weather.gov": NWS }));
    expect((await answerLive("is the pharmacy open", now)).status).toBe(404);
  });

  it("never serves a copy older than fifteen minutes when the source is down", async () => {
    let up = true;
    setLiveFetcher(async () => (up ? new Response(NWS) : new Response("no", { status: 503 })));
    expect((await answerLive("flood", now)).status).toBe(200);
    up = false;
    expect((await answerLive("flood", new Date(now.getTime() + 8 * 60_000))).status).toBe(200);
    expect((await answerLive("flood", new Date(now.getTime() + 20 * 60_000))).status).toBe(404);
  });
});
