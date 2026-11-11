import { describe, expect, it } from "vitest";
import { createAdsbAircraftTracking, mapReadsbAircraft } from "../src/adapters/aircraft-tracking.ts";

const NOW = Date.parse("2026-11-11T18:00:00Z");
const airborne = {
  hex: "a1b2c3", r: "N650GX", t: "GLF6", flight: "EJA650  ", alt_baro: 41000, gs: 488.4, track: 132.5,
  baro_rate: -64, squawk: "4521", emergency: "none", lat: 18.9, lon: -66.2, seen: 0.4, seen_pos: 1.2, dbFlags: 0,
};

describe("mapReadsbAircraft", () => {
  it("reads an airborne jet: where, how high, how fast, which way", () => {
    const fix = mapReadsbAircraft(airborne, NOW)!;
    expect(fix.tailNumber).toBe("N650GX");
    expect(fix.typeCode).toBe("GLF6");
    expect(fix.callsign).toBe("EJA650");
    expect(fix.onGround).toBe(false);
    expect(fix.position).toMatchObject({ lat: 18.9, lng: -66.2, altitudeFt: 41000, groundSpeedKts: 488.4, headingDeg: 132.5 });
    expect(fix.position!.updatedAt).toBe(new Date(NOW - 1200).toISOString());
    expect(fix.emergency).toBeUndefined();
    expect(fix.seenSecondsAgo).toBe(1);
  });

  it("knows a jet on the ground, and falls back to its last known position", () => {
    const fix = mapReadsbAircraft({ hex: "a1b2c3", r: "N650GX", alt_baro: "ground", seen: 90, lastPosition: { lat: 18.43, lon: -66.0, seen_pos: 95 } }, NOW)!;
    expect(fix.onGround).toBe(true);
    expect(fix.position).toMatchObject({ lat: 18.43, lng: -66.0, altitudeFt: 0 });
    expect(fix.seenSecondsAgo).toBe(95);
  });

  it("passes on a declared emergency", () => {
    expect(mapReadsbAircraft({ ...airborne, emergency: "general" }, NOW)!.emergency).toBe("general");
  });

  it("keeps an owner's request for privacy: no position, no callsign", () => {
    const fix = mapReadsbAircraft({ ...airborne, dbFlags: 8 }, NOW)!;
    expect(fix.privacyLimited).toBe(true);
    expect(fix.position).toBeUndefined();
    expect(fix.callsign).toBeUndefined();
  });

  it("ignores records that are not aircraft", () => {
    expect(mapReadsbAircraft(null, NOW)).toBeNull();
    expect(mapReadsbAircraft({ r: "N1" }, NOW)).toBeNull();
  });
});

describe("the adsb.lol port", () => {
  const fakeFetch = (body: unknown, status = 200) => {
    const calls: string[] = [];
    const impl = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    return { calls, impl };
  };

  it("asks by registration and returns the freshest match", async () => {
    const f = fakeFetch({ now: NOW, ac: [{ ...airborne, seen_pos: 30 }, airborne] });
    const port = createAdsbAircraftTracking({ base: "https://adsb.example/", fetchImpl: f.impl, clock: () => NOW });
    const fix = await port.findByTail("n650gx");
    expect(f.calls).toEqual(["https://adsb.example/v2/reg/N650GX"]);
    expect(fix!.seenSecondsAgo).toBe(1);
    expect(port.attribution.license).toMatch(/ODbL/);
  });

  it("says nothing is there rather than inventing a position", async () => {
    const port = createAdsbAircraftTracking({ fetchImpl: fakeFetch({ now: NOW, ac: [] }).impl, clock: () => NOW });
    expect(await port.findByTail("N1")).toBeNull();
  });

  it("reuses an answer for a few seconds instead of asking again", async () => {
    let t = NOW;
    const f = fakeFetch({ now: NOW, ac: [airborne] });
    const port = createAdsbAircraftTracking({ fetchImpl: f.impl, clock: () => t });
    await port.findByTail("N650GX");
    t += 5_000;
    await port.findByTail("N650GX");
    expect(f.calls.length).toBe(1);
    t += 6_000;
    await port.findByTail("N650GX");
    expect(f.calls.length).toBe(2);
  });

  it("fails loudly when the service itself fails, so the screen can say so", async () => {
    const port = createAdsbAircraftTracking({ fetchImpl: fakeFetch({}, 503).impl, clock: () => NOW });
    await expect(port.findByTail("N650GX")).rejects.toThrow(/503/);
  });
});
