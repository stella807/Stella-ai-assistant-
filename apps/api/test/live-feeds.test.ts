import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { answerLive, clearLiveCache, icaoFor, openNow, parseCruise, parseFaa, parseNws, routeLive, setLiveFetcher, setNominatimGap } from "../src/live-feeds.ts";

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
    expect(routeLive("best pizza in town")).toBeNull();
    expect(routeLive("is the pharmacy open")).toEqual({ source: "pharmacy", place: "" });
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
    expect(calls.filter((c) => c.includes("api.weather.gov"))).toHaveLength(1);
    await answerLive("flood", new Date(now.getTime() + 10 * 60_000));
    expect(calls.filter((c) => c.includes("api.weather.gov"))).toHaveLength(2);
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
    expect((await answerLive("best pizza in town", now)).status).toBe(404);
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

describe("satellite pictures and tropical storms, read with the weather", () => {
  const STORMS = JSON.stringify({ activeStorms: [{ id: "al122026", name: "Kirk", classification: "HU", intensity: "85", pressure: "975", latitudeNumeric: 19.0, longitudeNumeric: -64.0, movementDir: 285, movementSpeed: 12, lastUpdate: "2026-11-19T21:00:00.000Z", publicAdvisory: { url: "https://x.example/a" } }] });
  const sat = (lastModified: string) => async (url: string, init?: { method?: string }) => {
    if (url.includes("weather.gov")) return new Response(NWS);
    if (url.includes("nhc.noaa.gov")) return new Response(STORMS);
    if (url.includes("cdn.star.nesdis.noaa.gov") && init?.method === "HEAD") return new Response(null, { status: 200, headers: { "last-modified": lastModified } });
    return new Response("no", { status: 503 });
  };

  it("names the satellite, when its last picture of Puerto Rico was made, and where the official picture is", async () => {
    setLiveFetcher(sat("Thu, 19 Nov 2026 21:20:00 GMT"));
    const body: any = (await answerLive("storm warnings", now)).body;
    expect(body.satellite).toMatchObject({ satellite: "GOES-19 (GOES-East)", operator: "NOAA NESDIS", area: "Puerto Rico" });
    expect(body.satellite.images.geocolor).toMatchObject({ madeAt: "2026-11-19T21:20:00.000Z", ageMinutes: 10, image: "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/pr/GEOCOLOR/latest.jpg" });
    expect(body.satellite.images.infrared.image).toContain("/pr/13/latest.jpg");
  });

  it("lists active tropical storms with how far each is from Puerto Rico, and no links from the source", async () => {
    setLiveFetcher(sat("Thu, 19 Nov 2026 21:20:00 GMT"));
    const body: any = (await answerLive("hurricane", now)).body;
    expect(body.tropical.source).toBe("National Hurricane Center");
    expect(body.tropical.storms[0]).toMatchObject({ name: "Kirk", type: "Hurricane", windKnots: 85, pressureMb: 975 });
    expect(body.tropical.storms[0].kmFromPuertoRico).toBeGreaterThan(200);
    expect(body.tropical.storms[0].kmFromPuertoRico).toBeLessThan(400);
    expect(JSON.stringify(body.tropical)).not.toContain("x.example");
    expect(body.summary).toMatch(/1 active tropical storm/i);
  });

  it("still answers from the weather service when the satellite and storm sources are down, and says so", async () => {
    setLiveFetcher(fake({ "weather.gov": NWS }));
    const r = await answerLive("flood", now);
    expect(r.status).toBe(200);
    expect((r.body as any).satellite).toBeNull();
    expect((r.body as any).tropical).toBeNull();
  });

  it("sends satellite and cloud questions to the weather, in English or Spanish", () => {
    for (const q of ["satellite picture puerto rico", "imagen de satelite", "nubes", "tropical cyclone"]) expect(routeLive(q), q).toEqual({ source: "weather" });
  });
});

describe("knowing airport delays before they happen", () => {
  const t = (iso: string) => Date.parse(iso) / 1000;
  const TAF = JSON.stringify([{ icaoId: "TJSJ", issueTime: "2026-11-19T17:30:00.000Z", rawTAF: "TAF TJSJ 191730Z ...", fcsts: [
    { timeFrom: t("2026-11-19T18:00:00Z"), timeTo: t("2026-11-19T22:00:00Z"), wspd: 16, visib: "6+", wxString: "VCSH", clouds: [{ cover: "FEW", base: 2500 }] },
    { timeFrom: t("2026-11-19T22:00:00Z"), timeTo: t("2026-11-20T04:00:00Z"), fcstChange: "PROB", probability: 30, wspd: 15, wgst: 32, visib: 2, wxString: "TSRA", clouds: [{ cover: "BKN", base: 800 }] },
    { timeFrom: t("2026-11-21T00:00:00Z"), timeTo: t("2026-11-21T06:00:00Z"), wspd: 40, visib: "6+", wxString: "TSRA", clouds: [] },
  ] }]);
  const PLAN = JSON.stringify({ link: "https://x.example", terminalPlanned: [{ time: "", event: "AFTER 2300\t-SJU GROUND STOP POSSIBLE" }, { time: "", event: "AFTER 0000\t-SAN GROUND DELAY PROGRAM POSSIBLE" }], enRoutePlanned: [{ time: "", event: "UNTIL 0000\t-MIA/FLL/DJT CDRS/SWAP POSSIBLE" }] });
  const FAA_HUBS = FAA.replace("<ARPT>LAS</ARPT>", "<ARPT>MIA</ARPT>");
  const GTWO = `<rss><channel><item><title>Atlantic Tropical Weather Outlook</title><description><![CDATA[<div>Tropical Weather Outlook<br>For the North Atlantic...Caribbean Sea and the Gulf of America:<br><br>Offshore of the Southeast U.S. Coast:<br>A low may form east of Florida. See ocean.weather.gov/x.php<br>* Formation chance through 48 hours...low...30 percent.<br>* Formation chance through 7 days...medium...60 percent.<br>&&<br>more</div>]]></description></item></channel></rss>`;
  const all = () => async (url: string) => {
    if (url.includes("aviationweather.gov")) return new Response(TAF);
    if (url.includes("operations-plan")) return new Response(PLAN);
    if (url.includes("airport-status-information")) return new Response(FAA_HUBS);
    if (url.includes("gtwo.xml")) return new Response(GTWO);
    return new Response("no", { status: 503 });
  };

  it("reads the airport's forecast for the next 24 hours and names what could delay flights, with its chance", async () => {
    setLiveFetcher(all());
    const body: any = (await answerLive("SJU delays", now)).body;
    const o = body.airports[0].outlook;
    expect(o.forecast.station).toBe("TJSJ");
    expect(o.forecast.hazards).toEqual([{ from: "2026-11-19T22:00:00.000Z", to: "2026-11-20T04:00:00.000Z", chancePercent: 30, what: ["thunderstorms", "low clouds", "low visibility", "gusts to 32 knots"] }]);
  });

  it("lists what the FAA plans or calls possible for this airport, and for the rest of the country", async () => {
    setLiveFetcher(all());
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.faaPlan.forThisAirport).toEqual([{ when: "AFTER 2300", what: "SJU GROUND STOP POSSIBLE" }]);
    expect(o.faaPlan.elsewhere.map((e: any) => e.what)).toContain("MIA/FLL/DJT CDRS/SWAP POSSIBLE");
    expect(JSON.stringify(o.faaPlan)).not.toContain("x.example");
  });

  it("names big US airports delayed right now, since a flight from one of them can arrive late", async () => {
    setLiveFetcher(all());
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.delayedHubsNow.map((h: any) => h.code)).toContain("MIA");
    expect(o.delayedHubsNow.map((h: any) => h.code)).not.toContain("SJU");
  });

  it("gives Puerto Rico airports the hurricane center's formation chances, without its links", async () => {
    setLiveFetcher(all());
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.tropicalOutlook.systems[0]).toMatchObject({ chance48hPercent: 30, chance7dPercent: 60 });
    expect(o.tropicalOutlook.systems[0].text).toMatch(/east of Florida/);
    expect(JSON.stringify(o.tropicalOutlook)).not.toMatch(/ocean\.weather\.gov|https?:/);
  });

  it("sums up the signals in one line, and calls it an outlook, not a prediction about any flight", async () => {
    setLiveFetcher(all());
    const body: any = (await answerLive("SJU delays", now)).body;
    expect(body.airports[0].outlook.signals.length).toBeGreaterThanOrEqual(3);
    expect(body.outlookNote).toMatch(/not a prediction/i);
  });

  it("still gives the current status when the forecast sources are down", async () => {
    setLiveFetcher(fake({ "airport-status-information": FAA }));
    const body: any = (await answerLive("SJU delays", now)).body;
    expect(body.airports[0].issues[0].kind).toBe("ground delay program");
    expect(body.airports[0].outlook).toMatchObject({ forecast: null, faaPlan: null });
  });

  it("knows the forecast station for each airport", () => {
    expect(icaoFor("SJU")).toBe("TJSJ");
    expect(icaoFor("BQN")).toBe("TJBQ");
    expect(icaoFor("JFK")).toBe("KJFK");
    expect(icaoFor("HNL")).toBe("PHNL");
  });
});

describe("small things the real sources showed", () => {
  it("leaves the chance empty when the forecast gives none, rather than saying zero", async () => {
    const t = (iso: string) => Date.parse(iso) / 1000;
    setLiveFetcher(fake({ "aviationweather.gov": JSON.stringify([{ icaoId: "TJSJ", fcsts: [{ timeFrom: t("2026-11-19T22:00:00Z"), timeTo: t("2026-11-20T02:00:00Z"), probability: null, wxString: "TSRA", clouds: [] }] }]), "airport-status-information": FAA }));
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.forecast.hazards[0].chancePercent).toBeNull();
  });

  it("does not call a big airport delayed because of a closure notice that may close it only to some flights", async () => {
    setLiveFetcher(fake({ "airport-status-information": FAA.replace("<ARPT>PSE</ARPT>", "<ARPT>LAX</ARPT>") }));
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.delayedHubsNow.map((h: any) => h.code)).not.toContain("LAX");
  });
});

describe("signs at the airport before the FAA posts anything, and power on the island", () => {
  const METAR = JSON.stringify([
    { icaoId: "TJSJ", reportTime: "2026-11-19T21:20:00.000Z", metarType: "SPECI", fltCat: "IFR", rawOb: "SPECI TJSJ 192120Z 09018G28KT 2SM +TSRA BKN008CB OVC020 26/24 A2996 RMK AO2 LTG DSNT ALQDS TSB15 $" },
    { icaoId: "TJSJ", reportTime: "2026-11-19T20:56:00.000Z", metarType: "METAR", fltCat: "VFR", rawOb: "METAR TJSJ 192056Z 11007KT 10SM FEW031 29/23 A2995 RMK AO2 $" },
  ]);
  const EVENTS = JSON.stringify([{ airportId: "SJU", airportConfig: { airportId: "SJU", arrivalRunwayConfig: "08", departureRunwayConfig: "08", arrivalRate: 24, sourceTimeStamp: "2026-11-19T21:00:00Z" } }]);
  const LUMA = JSON.stringify({ regions: [
    { name: "Bayamon", totalClients: 216496, totalClientsWithoutService: 21000, totalClientsAffectedByPlannedOutage: 50, totalClientsAffectedByLoadShed: 20000, percentageClientsWithoutService: 9.7 },
    { name: "Carolina", totalClients: 141663, totalClientsWithoutService: 1, totalClientsAffectedByPlannedOutage: 0, totalClientsAffectedByLoadShed: 0, percentageClientsWithoutService: 0 },
  ] });
  const src = () => async (url: string) => {
    if (url.includes("api/data/metar")) return new Response(METAR);
    if (url.includes("airport-events")) return new Response(EVENTS);
    if (url.includes("airport-status-information")) return new Response(FAA);
    if (url.includes("lumapr.com")) return new Response(LUMA);
    return new Response("no", { status: 503 });
  };

  it("reads the airport's latest observation and flags lightning and low cloud before any delay is posted", async () => {
    setLiveFetcher(src());
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.atTheField).toMatchObject({ station: "TJSJ", observedAt: "2026-11-19T21:20:00.000Z", ageMinutes: 10, flightCategory: "IFR", lightning: true, specialReportsLastHour: 1 });
    expect(o.signals.join(" ")).toMatch(/lightning/i);
    expect(o.signals.join(" ")).toMatch(/ground crews/i);
  });

  it("shows the arrival rate the FAA has set for the airport, when it publishes one", async () => {
    setLiveFetcher(src());
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.faaRates).toEqual({ arrivalsPerHour: 24, arrivalRunways: "08", departureRunways: "08", setAt: "2026-11-19T21:00:00.000Z" });
  });

  it("answers power questions from the island's power company map, with load shedding called out", async () => {
    setLiveFetcher(src());
    expect(routeLive("power outage puerto rico")).toEqual({ source: "power" });
    expect(routeLive("apagón en bayamón")).toEqual({ source: "power" });
    expect(routeLive("hay luz en carolina")).toEqual({ source: "power" });
    const r = await answerLive("power outage puerto rico", now);
    expect(r.status).toBe(200);
    const b: any = r.body;
    expect(b.source).toBe("LUMA Energy outage map");
    expect(b.regions[0]).toMatchObject({ name: "Bayamon", withoutPower: 21000, percentWithoutPower: 9.7, loadShed: 20000 });
    expect(b.summary).toMatch(/21,001 customers/);
    expect(b.summary).toMatch(/load shed/i);
  });

  it("refuses power questions when the power map cannot be read", async () => {
    setLiveFetcher(fake({}));
    expect((await answerLive("apagon", now)).status).toBe(404);
  });
});

describe("the airport observation, read carefully", () => {
  it("does not take a remark that the thunderstorm sensor is off for a thunderstorm", async () => {
    setLiveFetcher(fake({ "api/data/metar": JSON.stringify([{ icaoId: "TJSJ", reportTime: "2026-11-19T21:20:00.000Z", metarType: "METAR", fltCat: "VFR", rawOb: "METAR TJSJ 192120Z 09010KT 10SM FEW030 29/23 A2996 RMK AO2 TSNO $" }]), "airport-status-information": FAA }));
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.atTheField.lightning).toBe(false);
  });
});

describe("the Puerto Rico weather bundle", () => {
  const LUMA = JSON.stringify({ regions: [{ name: "Mayaguez", totalClients: 216605, totalClientsWithoutService: 5861, totalClientsAffectedByPlannedOutage: 511, totalClientsAffectedByLoadShed: 0, percentageClientsWithoutService: 2.71 }] });
  it("brings power across the island and Puerto Rico's airports with every weather answer, for the same price", async () => {
    setLiveFetcher(fake({ "weather.gov": NWS, "lumapr.com": LUMA, "airport-status-information": FAA }));
    const r = await answerLive("storm warnings puerto rico", now);
    expect(r.status).toBe(200);
    const b: any = r.body;
    expect(b.bundle).toEqual(["weather alerts", "satellite", "tropical storms", "power outages", "Puerto Rico airports"]);
    expect(b.power.island).toMatchObject({ withoutPower: 5861 });
    expect(b.puertoRicoAirports.airports.map((a: any) => a.code)).toEqual(["SJU", "BQN", "PSE"]);
    expect(b.puertoRicoAirports.airports[0].issues[0].kind).toBe("ground delay program");
    expect(b.summary).toMatch(/Power: 5,861 customers/);
    expect(b.summary).toMatch(/Airports: SJU: ground delay program/);
  });

  it("still answers when power and the airports cannot be read, and marks them missing", async () => {
    setLiveFetcher(fake({ "weather.gov": NWS }));
    const b: any = (await answerLive("flood", now)).body;
    expect(b.power).toBeNull();
    expect(b.puertoRicoAirports).toBeNull();
  });
});

describe("a year of history with every Puerto Rico airport answer", () => {
  it("adds what usually happens at this hour and day, and the busy hours for security lines", async () => {
    setLiveFetcher(fake({ "airport-status-information": FAA }));
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.history.localTime).toMatch(/Thursday 17:30/);
    expect(o.history.nextHours[0].hourLocal).toBe("17:00");
    expect(o.history.securityLines.busiestDepartureHoursToday.length).toBe(3);
  });

  it("has no history for an airport outside Puerto Rico", async () => {
    setLiveFetcher(fake({ "airport-status-information": FAA }));
    const o = ((await answerLive("JFK delays", now)).body as any).airports[0].outlook;
    expect(o.history).toBeNull();
  });
});

describe("cruise ships in San Juan, only with the port's permission", () => {
  const row = (eta: string, etd: string, ship: string, line: string, berth: string) => `<div class="schedule-item-row"><div class="eta"><div class="hide-mobile mobile-schedule-title">Arrival</div>${eta}</div><div class="etd"><div class="hide-mobile mobile-schedule-title">Departure</div>${etd}</div><div class="shipname"><div class="hide-mobile mobile-schedule-title">Ship</div>${ship}</div><div class="cruiseline"><div class="hide-mobile mobile-schedule-title">Cruise Line</div>${line}</div><div class="berth"><div class="hide-mobile mobile-schedule-title">Berth</div>${berth}</div></div>`;
  const PAGE = `<div id="cruiseTableContainer">${row("19 Nov 2026 | 09:00", "21 Nov 2026 | 18:00", "Ship One", "Line A", "PIER 3W")}${row("19 Nov 2026 | 05:00", "19 Nov 2026 | 18:00", "Ship Two", "Line B", "PIER 4E")}${row("19 Nov 2026 | 06:00", "19 Nov 2026 | 20:00", "Ship Three", "Line C", "PANAMERICAN E")}${row("20 Nov 2026 | 06:00", "20 Nov 2026 | 20:00", "Ship Four", "Line D", "PIER 1")}</div>`;
  const prev = process.env.CRUISE_SCHEDULE_ENABLED;
  afterEach(() => { if (prev === undefined) delete process.env.CRUISE_SCHEDULE_ENABLED; else process.env.CRUISE_SCHEDULE_ENABLED = prev; });

  it("leaves out the ferry, which shares the schedule but is not a cruise ship", () => {
    expect(parseCruise(row("19 Nov 2026 | 08:00", "19 Nov 2026 | 19:00", "Kydon", "Ferries del Caribe", "PIER 15"))).toEqual([]);
  });

  it("reads each ship's arrival and departure in Puerto Rico time", () => {
    const ships = parseCruise(PAGE);
    expect(ships).toHaveLength(4);
    expect(ships[1]).toEqual({ ship: "Ship Two", line: "Line B", berth: "PIER 4E", arrives: "2026-11-19T09:00:00.000Z", departs: "2026-11-19T22:00:00.000Z" });
  });

  it("stays off, and says why, until the port has agreed", async () => {
    delete process.env.CRUISE_SCHEDULE_ENABLED;
    const calls: string[] = [];
    setLiveFetcher(fake({ "airport-status-information": FAA, "sanjuancruiseport.com": PAGE }, calls));
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.cruise).toMatchObject({ enabled: false });
    expect(o.cruise.note).toMatch(/permission/i);
    expect(calls.some((c) => c.includes("sanjuancruiseport"))).toBe(false);
  });

  it("when switched on, counts the ships in port each day and warns about a busy cruise day at SJU", async () => {
    process.env.CRUISE_SCHEDULE_ENABLED = "1";
    setLiveFetcher(fake({ "airport-status-information": FAA, "sanjuancruiseport.com": PAGE }));
    const o = ((await answerLive("SJU delays", now)).body as any).airports[0].outlook;
    expect(o.cruise.enabled).toBe(true);
    expect(o.cruise.days[0]).toMatchObject({ date: "2026-11-19", shipsInPort: 3 });
    expect(o.signals.join(" ")).toMatch(/3 cruise ships in San Juan today/);
  });

  it("gives cruise ships only with SJU, not with other airports", async () => {
    process.env.CRUISE_SCHEDULE_ENABLED = "1";
    setLiveFetcher(fake({ "airport-status-information": FAA, "sanjuancruiseport.com": PAGE }));
    const o = ((await answerLive("BQN delays", now)).body as any).airports[0].outlook;
    expect(o.cruise).toBeNull();
  });
});

describe("pharmacies near a place in Puerto Rico", () => {
  const GEO = JSON.stringify([{ name: "Hospital Auxilio Mutuo", lat: "18.4096", lon: "-66.0510", type: "hospital" }]);
  const FAR = JSON.stringify([{ name: "Miami", lat: "25.76", lon: "-80.19", type: "city" }]);
  const LIST = JSON.stringify([
    { name: "Walgreens", lat: "18.4100", lon: "-66.0520", extratags: { phone: "+1 787-292-2050", opening_hours: "24/7", brand: "Walgreens" }, address: { road: "Avenida La Sierra", city: "San Juan" } },
    { name: "Farmacia Caridad", lat: "18.4300", lon: "-66.0700", extratags: { opening_hours: "Mo-Sa 08:00-20:00; Su off" }, address: { road: "Avenida Juan Ponce de León", suburb: "Río Piedras" } },
    { name: "Medical Pharmacy", lat: "18.4000", lon: "-66.0400", extratags: {}, address: { road: "Calle Georgetti" } },
  ]);
  const src = (geo = GEO) => async (url: string) => {
    if (url.includes("nominatim") && url.includes("%5Bpharmacy%5D")) return new Response(LIST);
    if (url.includes("nominatim")) return new Response(geo);
    return new Response("no", { status: 503 });
  };
  beforeEach(() => setNominatimGap(0));

  it("sends pharmacy questions here, in English or Spanish, and finds the place in them", () => {
    expect(routeLive("pharmacy near Hospital Auxilio Mutuo")).toEqual({ source: "pharmacy", place: "hospital auxilio mutuo" });
    expect(routeLive("farmacia abierta en Bayamón")).toEqual({ source: "pharmacy", place: "bayamon" });
    expect(routeLive("is the walgreens in ponce open now")).toEqual({ source: "pharmacy", place: "ponce" });
  });

  it("lists the nearest pharmacies first, with phone, hours and whether they are open now in Puerto Rico time", async () => {
    setLiveFetcher(src());
    const thursdayNight = new Date("2026-11-20T01:30:00Z"); // Thursday 21:30 in Puerto Rico
    const r = await answerLive("pharmacy near Hospital Auxilio Mutuo", thursdayNight);
    expect(r.status).toBe(200);
    const b: any = r.body;
    expect(b.place.name).toBe("Hospital Auxilio Mutuo");
    expect(b.pharmacies.map((p: any) => p.name)).toEqual(["Walgreens", "Medical Pharmacy", "Farmacia Caridad"]);
    expect(b.pharmacies[0]).toMatchObject({ phone: "+1 787-292-2050", hours: "24/7", openNow: true, address: "Avenida La Sierra, San Juan" });
    expect(b.pharmacies[2]).toMatchObject({ openNow: false });
    expect(b.pharmacies[1]).toMatchObject({ phone: null, openNow: null });
    expect(b.pharmacies[0].distanceKm).toBeLessThan(0.3);
    expect(b.source).toMatch(/OpenStreetMap/);
  });

  it("says plainly that stock is not something it can see, and how to find out", async () => {
    setLiveFetcher(src());
    const b: any = (await answerLive("farmacia en Bayamón con insulina", now)).body;
    expect(b.stock).toBeNull();
    expect(b.stockNote).toMatch(/call/i);
    expect(b.stockNote).toMatch(/Checked today/);
  });

  it("charges for a real search that finds nothing near a real place, and says so plainly", async () => {
    setLiveFetcher(async (url: string) => (url.includes("%5Bpharmacy%5D") ? new Response("[]") : url.includes("nominatim") ? new Response(GEO) : new Response("no", { status: 503 })));
    const a = await answerLive("pharmacy near Hospital Auxilio Mutuo", now);
    expect(a.status).toBe(200);
    expect(a.results).toBe(0);
    expect(a.body).toMatchObject({ found: false, message: expect.stringMatching(/charged/i) });
  });

  it("does not charge when the map cannot be reached", async () => {
    setLiveFetcher(async (url: string) => (url.includes("%5Bpharmacy%5D") ? new Response("down", { status: 503 }) : url.includes("nominatim") ? new Response(GEO) : new Response("no", { status: 503 })));
    expect((await answerLive("pharmacy near Hospital Auxilio Mutuo", now)).status).toBe(404);
  });

  it("refuses, and so does not charge, a place outside Puerto Rico or no place at all", async () => {
    setLiveFetcher(src(FAR));
    expect((await answerLive("pharmacy near Miami", now)).status).toBe(404);
    setLiveFetcher(src());
    expect((await answerLive("pharmacy", now)).status).toBe(404);
  });
});

describe("reading opening hours", () => {
  const at = (iso: string) => new Date(iso);
  it("understands the common forms, in Puerto Rico time, and says nothing when it cannot tell", () => {
    expect(openNow("24/7", at("2026-11-20T07:00:00Z"))).toBe(true);
    expect(openNow("Mo-Fr 08:00-21:00; Sa 09:00-18:00; Su off", at("2026-11-20T13:00:00Z"))).toBe(true);  // Fri 09:00
    expect(openNow("Mo-Fr 08:00-21:00; Sa 09:00-18:00; Su off", at("2026-11-22T15:00:00Z"))).toBe(false); // Sun 11:00
    expect(openNow("Mo-Su 07:00-23:00", at("2026-11-20T15:30:00Z"))).toBe(true);                         // Fri 11:30
    expect(openNow("Mo-Su 07:00-23:00", at("2026-11-20T04:30:00Z"))).toBe(false);                        // Fri 00:30
    expect(openNow("Mo-Su 22:00-02:00", at("2026-11-20T04:30:00Z"))).toBe(true);                         // Fri 00:30, still Thursday's late shift
    expect(openNow("by appointment", at("2026-11-20T13:00:00Z"))).toBeNull();
    expect(openNow(undefined, at("2026-11-20T13:00:00Z"))).toBeNull();
  });
});
