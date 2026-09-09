import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/server.ts";
import { Store } from "../src/store.ts";
import { SEED } from "../src/seed.ts";
import type { Ctx } from "../src/routes.ts";

let server: ReturnType<typeof createApp>;
let base: string;
let dir: string;
let clock: Date;

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() as any };
};

const advance = (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000); };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "safehubby-"));
  clock = new Date("2026-01-01T20:00:00Z");
  const store = new Store(join(dir, "db.json"));
  store.reset(structuredClone(SEED));
  const ctx: Ctx = { store, now: () => clock };
  server = createApp(ctx);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const startNight = () =>
  call("POST", "/api/nights", { travelerId: "t-sam", weightKg: 82, drinkLimit: 4, homeAddressLabel: "142 Rowan St" });

describe("API basics", () => {
  it("serves health and the catalog", async () => {
    expect((await call("GET", "/api/health")).json.ok).toBe(true);
    const catalog = (await call("GET", "/api/catalog")).json;
    expect(catalog.drinks.length).toBeGreaterThan(5);
    expect(catalog.plans.length).toBe(4);
  });

  it("404s an unknown route and 400s bad JSON", async () => {
    expect((await call("GET", "/api/nope")).status).toBe(404);
    const res = await fetch(`${base}/api/nights`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{oops",
    });
    expect(res.status).toBe(400);
  });

  it("validates required fields when starting a night", async () => {
    expect((await call("POST", "/api/nights", { travelerId: "t-sam" })).status).toBe(400);
    expect((await call("POST", "/api/nights", { weightKg: 80 })).status).toBe(400);
  });
});

describe("a night out, end to end", () => {
  it("tracks drinks, check-ins, alerts, and getting home safe", async () => {
    const started = (await startNight()).json;
    const nightId = started.night.id;
    expect(started.night.checkIns).toHaveLength(1);
    expect(started.bac.estimate).toBe(0);

    // Log drinks fast enough to trip the pace rule.
    for (const drinkId of ["beer-ipa", "beer-ipa", "shot-whiskey"]) {
      advance(12);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId, venueName: "The Anchor Tavern" });
    }

    const afterDrinks = (await call("GET", `/api/nights/${nightId}`)).json;
    expect(afterDrinks.stats.alcoholicDrinks).toBe(3);
    expect(afterDrinks.bac.estimate).toBeGreaterThan(0);
    expect(afterDrinks.bac.neverAdviseDriving).toBe(true);
    expect(afterDrinks.alerts.some((a: any) => a.kind === "fast-pace")).toBe(true);

    // Answering a check-in schedules the next one and never leaves a gap.
    const pending = afterDrinks.pendingCheckIn;
    expect(pending).not.toBeNull();
    const answered = (await call("POST", `/api/nights/${nightId}/check-ins/${pending.id}/answer`, { feelingRating: 3 })).json;
    expect(answered.pendingCheckIn).not.toBeNull();
    expect(answered.pendingCheckIn.id).not.toBe(pending.id);

    // Answering twice is a conflict, not a silent double-award.
    expect((await call("POST", `/api/nights/${nightId}/check-ins/${pending.id}/answer`, {})).status).toBe(409);

    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.7148, lng: -74.0018, venueName: "The Anchor Tavern" });
    const home = (await call("POST", `/api/nights/${nightId}/status`, { status: "home-safe" })).json;
    expect(home.night.status).toBe("home-safe");
    expect(home.alerts.some((a: any) => a.kind === "home-safe")).toBe(true);

    const traveler = (await call("GET", "/api/travelers/t-sam")).json;
    expect(traveler.points.balance).toBeGreaterThan(0);
  });

  it("raises a missed check-in once its grace period lapses", async () => {
    const nightId = (await startNight()).json.night.id;
    advance(120);
    const state = (await call("GET", `/api/nights/${nightId}`)).json;
    expect(state.stats.missedCheckIns).toBeGreaterThan(0);
    expect(state.alerts.some((a: any) => a.kind === "missed-check-in")).toBe(true);
  });

  it("does not re-raise the same alert on repeated polls", async () => {
    const nightId = (await startNight()).json.night.id;
    advance(120);
    const first = (await call("GET", `/api/nights/${nightId}`)).json.alerts.length;
    const second = (await call("GET", `/api/nights/${nightId}`)).json.alerts.length;
    expect(second).toBe(first);
  });

  it("sends an SOS with the last known location, silently when asked", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 });
    const sos = (await call("POST", `/api/nights/${nightId}/sos`, { silent: true })).json;
    expect(sos.alert.severity).toBe("urgent");
    expect(sos.alert.actions.map((a: any) => a.type)).not.toContain("call");
    expect(sos.lastPing.lat).toBeCloseTo(40.71);
  });

  it("rejects a location ping without coordinates", async () => {
    const nightId = (await startNight()).json.night.id;
    expect((await call("POST", `/api/nights/${nightId}/location`, { venueName: "x" })).status).toBe(400);
  });

  it("404s an unknown night", async () => {
    expect((await call("GET", "/api/nights/night_missing")).status).toBe(404);
  });
});

describe("consent gating", () => {
  it("lets only the traveler grant access, and scopes what the guardian sees", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-regular" });
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 });

    // A guardian cannot grant themselves access.
    const stolen = await call("POST", "/api/grants", {
      travelerId: "t-sam", guardianId: "g-alex", createdBy: "g-alex", scopes: ["location"],
    });
    expect(stolen.status).toBe(400);

    // Location only: drinks must not leak through.
    const grant = (await call("POST", "/api/grants", {
      travelerId: "t-sam", guardianId: "g-alex", createdBy: "t-sam", scopes: ["location"], hours: 6,
    })).json;
    expect(grant.visibleToTraveler).toBe(true);

    const view = (await call("GET", `/api/watch/${grant.id}`)).json;
    expect(view.sharingActive).toBe(true);
    expect(view.lastPing).not.toBeNull();
    expect(view.night.drinks).toEqual([]);
    expect(view.bac).toBeNull();
  });

  it("stops sharing the moment the grant is revoked", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 });
    const grant = (await call("POST", "/api/grants", {
      travelerId: "t-sam", guardianId: "g-alex", createdBy: "t-sam", scopes: ["location", "drinks"],
    })).json;

    await call("POST", `/api/grants/${grant.id}/revoke`, { revokedBy: "t-sam" });
    const view = (await call("GET", `/api/watch/${grant.id}`)).json;
    expect(view.sharingActive).toBe(false);
    expect(view.lastPing).toBeNull();
  });

  it("expires sharing on its own", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 });
    const grant = (await call("POST", "/api/grants", {
      travelerId: "t-sam", guardianId: "g-alex", createdBy: "t-sam", scopes: ["location"], hours: 2,
    })).json;
    advance(3 * 60);
    expect((await call("GET", `/api/watch/${grant.id}`)).json.sharingActive).toBe(false);
  });

  it("revokes live grants when the night ends", async () => {
    const nightId = (await startNight()).json.night.id;
    const grant = (await call("POST", "/api/grants", {
      travelerId: "t-sam", guardianId: "g-alex", createdBy: "t-sam", scopes: ["location"], hours: 12,
    })).json;
    await call("POST", `/api/nights/${nightId}/status`, { status: "home-safe" });
    expect((await call("GET", `/api/watch/${grant.id}`)).json.sharingActive).toBe(false);
  });
});

describe("plan gating", () => {
  it("blocks premium features on the free plan but never SOS", async () => {
    const jordanNight = (await call("POST", "/api/nights", { travelerId: "t-jordan", weightKg: 70 })).json.night;

    expect((await call("GET", `/api/nights/${jordanNight.id}/recovery`)).status).toBe(402);
    expect((await call("POST", "/api/rides/quote", {
      travelerId: "t-jordan", pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01 },
    })).status).toBe(402);

    // Safety basics stay free.
    expect((await call("POST", `/api/nights/${jordanNight.id}/sos`, {})).status).toBe(200);
    expect((await call("POST", `/api/nights/${jordanNight.id}/drinks`, { drinkId: "beer-light" })).status).toBe(200);
  });

  it("allows the same features on a paid plan", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-ipa" });
    const recovery = (await call("GET", `/api/nights/${nightId}/recovery`)).json;
    expect(recovery.soberEstimate).toMatch(/only time/i);

    const quotes = (await call("POST", "/api/rides/quote", {
      travelerId: "t-sam", pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    })).json;
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes[0].fareEstimateCents).toBeGreaterThan(0);
  });

  it("awards a large bonus for booking a ride instead of driving", async () => {
    await startNight();
    const before = (await call("GET", "/api/travelers/t-sam")).json.points.balance;
    await call("POST", "/api/rides/book", {
      travelerId: "t-sam", providerId: "uber-x",
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    });
    const after = (await call("GET", "/api/travelers/t-sam")).json.points.balance;
    expect(after - before).toBe(100);
  });
});

describe("extras", () => {
  it("lists nearby venues with their menus", async () => {
    const venues = (await call("GET", "/api/venues?lat=40.714&lng=-74.003")).json;
    expect(venues[0].menuDrinkIds.length).toBeGreaterThan(0);
    expect(venues[0].foodMenu.length).toBeGreaterThan(0);
  });

  it("offers supplies and flags the poorly lit route", async () => {
    expect((await call("GET", "/api/supplies")).json.some((i: any) => i.id === "liquid-iv")).toBe(true);
    const routes = (await call("POST", "/api/routes", {
      travelerId: "t-sam", from: { lat: 40.714, lng: -74.003, accuracyMeters: 10, at: clock.toISOString() },
      to: { lat: 40.72, lng: -74.01 },
    })).json;
    expect(routes.some((r: any) => r.reasons.some((x: string) => /lit/i.test(x)))).toBe(true);
  });

  it("refuses to redeem a reward the traveler cannot afford", async () => {
    const res = await call("POST", "/api/points/redeem", { travelerId: "t-sam", rewardId: "rw-app" });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not enough/i);
  });

  it("runs the worried-text game and keeps the first result", async () => {
    const players = [{ id: "t-sam", displayName: "Sam" }, { id: "t-jordan", displayName: "Jordan" }];
    const round = (await call("POST", "/api/games/worried-text", { travelerId: "t-sam", players })).json;
    await call("POST", `/api/games/worried-text/${round.id}/report`, { playerId: "t-jordan" });
    const flipped = (await call("POST", `/api/games/worried-text/${round.id}/report`, { playerId: "t-sam" })).json;
    expect(flipped.loserId).toBe("t-jordan");
  });
});

describe("adaptive cadence", () => {
  it("pulls the pending check-in closer as drinks pile up", async () => {
    const started = (await startNight()).json;
    const nightId = started.night.id;
    const originalDue = new Date(started.night.checkIns[0].dueAt).getTime();

    for (const drinkId of ["beer-ipa", "shot-whiskey", "beer-ipa", "shot-tequila"]) {
      advance(4);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId });
    }

    const after = (await call("GET", `/api/nights/${nightId}`)).json;
    expect(new Date(after.pendingCheckIn.dueAt).getTime()).toBeLessThan(originalDue);
  });
});
