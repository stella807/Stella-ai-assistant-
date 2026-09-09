import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp, makeCtx } from "../src/server.ts";
import { Store } from "../src/store.ts";
import { SEED } from "../src/seed.ts";
import type { Ctx } from "../src/routes.ts";

let server: ReturnType<typeof createApp>;
let base: string;
let dir: string;
let clock: Date;

/** Each "session" is just a bearer token, so tests can act as different users. */
const call = async (method: string, path: string, body?: unknown, token?: string | null) => {
  const headers: Record<string, string> = {};
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {}, setCookie: res.headers.get("set-cookie") };
};

let sam = "", jordan = "", samId = "", jordanId = "";

const signup = async (email: string, displayName: string) => {
  const res = await call("POST", "/api/auth/signup", { email, password: "a-long-enough-passphrase", displayName });
  const token = /sh_session=([^;]+)/.exec(res.setCookie ?? "")?.[1] ?? "";
  return { token, id: res.json.traveler?.id as string, res };
};

const advance = (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000); };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "safehubby-"));
  clock = new Date("2026-01-01T20:00:00Z");
  const store = new Store(join(dir, "db.json"));
  store.reset(structuredClone(SEED));
  const ctx: Ctx = { ...makeCtx(store), now: () => clock };
  server = createApp(ctx);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const a = await signup("sam@example.com", "Sam");
  sam = a.token; samId = a.id;
  const b = await signup("jordan@example.com", "Jordan");
  jordan = b.token; jordanId = b.id;
  // Sam is on the paid tier; Jordan stays free, so plan gating is exercised.
  store.update((db) => { db.travelers.find((t) => t.id === samId)!.planId = "premium-plus"; });
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const startNight = (token = sam) =>
  call("POST", "/api/nights", { weightKg: 82, drinkLimit: 4, homeAddressLabel: "142 Rowan St" }, token);

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
    expect((await call("POST", "/api/nights", {}, sam)).status).toBe(400);
    expect((await call("POST", "/api/nights", { weightKg: -5 }, sam)).status).toBe(400);
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
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId, venueName: "The Anchor Tavern" }, sam);
    }

    const afterDrinks = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json;
    expect(afterDrinks.stats.alcoholicDrinks).toBe(3);
    expect(afterDrinks.bac.estimate).toBeGreaterThan(0);
    expect(afterDrinks.bac.neverAdviseDriving).toBe(true);
    expect(afterDrinks.alerts.some((a: any) => a.kind === "fast-pace")).toBe(true);

    // Answering a check-in schedules the next one and never leaves a gap.
    const pending = afterDrinks.pendingCheckIn;
    expect(pending).not.toBeNull();
    const answered = (await call("POST", `/api/nights/${nightId}/check-ins/${pending.id}/answer`, { feelingRating: 3 }, sam)).json;
    expect(answered.pendingCheckIn).not.toBeNull();
    expect(answered.pendingCheckIn.id).not.toBe(pending.id);

    // Answering twice is a conflict, not a silent double-award.
    expect((await call("POST", `/api/nights/${nightId}/check-ins/${pending.id}/answer`, {}, sam)).status).toBe(409);

    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.7148, lng: -74.0018, venueName: "The Anchor Tavern" }, sam);
    const home = (await call("POST", `/api/nights/${nightId}/status`, { status: "home-safe" }, sam)).json;
    expect(home.night.status).toBe("home-safe");
    expect(home.alerts.some((a: any) => a.kind === "home-safe")).toBe(true);

    const traveler = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json;
    expect(traveler.points.balance).toBeGreaterThan(0);
  });

  it("raises a missed check-in once its grace period lapses", async () => {
    const nightId = (await startNight()).json.night.id;
    advance(120);
    const state = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json;
    expect(state.stats.missedCheckIns).toBeGreaterThan(0);
    expect(state.alerts.some((a: any) => a.kind === "missed-check-in")).toBe(true);
  });

  it("does not re-raise the same alert on repeated polls", async () => {
    const nightId = (await startNight()).json.night.id;
    advance(120);
    const first = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.alerts.length;
    const second = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.alerts.length;
    expect(second).toBe(first);
  });

  it("sends an SOS with the last known location, silently when asked", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 }, sam);
    const sos = (await call("POST", `/api/nights/${nightId}/sos`, { silent: true }, sam)).json;
    expect(sos.alert.severity).toBe("urgent");
    expect(sos.alert.actions.map((a: any) => a.type)).not.toContain("call");
    expect(sos.lastPing.lat).toBeCloseTo(40.71);
  });

  it("rejects a location ping without coordinates", async () => {
    const nightId = (await startNight()).json.night.id;
    expect((await call("POST", `/api/nights/${nightId}/location`, { venueName: "x" }, sam)).status).toBe(400);
  });

  it("404s an unknown night", async () => {
    expect((await call("GET", "/api/nights/night_missing", undefined, sam)).status).toBe(404);
  });
});

describe("consent gating", () => {
  const shareWithJordan = async (scopes: string[]) => {
    const grant = (await call("POST", "/api/grants", { scopes, hours: 6 }, sam)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, jordan);
    return grant;
  };

  it("issues an unclaimed invite that grants nobody access until claimed", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 }, sam);
    const grant = (await call("POST", "/api/grants", { scopes: ["location"] }, sam)).json;

    expect(grant.guardianId).toBeNull();
    expect(grant.inviteCode).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    // Holding the grant id is not access.
    expect((await call("GET", `/api/watch/${grant.id}`, undefined, jordan)).status).toBe(404);
  });

  it("binds the invite to the account that claims it, and scopes what they see", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-regular" }, sam);
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 }, sam);

    const grant = await shareWithJordan(["location"]);
    const view = (await call("GET", `/api/watch/${grant.id}`, undefined, jordan)).json;
    expect(view.sharingActive).toBe(true);
    expect(view.lastPing).not.toBeNull();
    // Location-only: drinks and the estimate must not leak.
    expect(view.night.drinks).toEqual([]);
    expect(view.bac).toBeNull();
  });

  it("refuses a second person claiming the same code", async () => {
    const grant = (await call("POST", "/api/grants", { scopes: ["location"] }, sam)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, jordan);
    const third = await signup("mallory@example.com", "Mallory");
    const res = await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, third.token);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/already been claimed/i);
  });

  it("does not let a stranger read a claimed grant", async () => {
    await startNight();
    const grant = await shareWithJordan(["location", "drinks"]);
    const mallory = await signup("m2@example.com", "Mallory");
    expect((await call("GET", `/api/watch/${grant.id}`, undefined, mallory.token)).status).toBe(404);
    expect((await call("GET", `/api/watch/${grant.id}`)).status).toBe(401);
  });

  it("stops sharing the moment the traveler revokes", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 }, sam);
    const grant = await shareWithJordan(["location", "drinks"]);

    await call("POST", `/api/grants/${grant.id}/revoke`, {}, sam);
    const view = (await call("GET", `/api/watch/${grant.id}`, undefined, jordan)).json;
    expect(view.sharingActive).toBe(false);
    expect(view.lastPing).toBeNull();
  });

  it("expires sharing on its own", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.71, lng: -74.0 }, sam);
    const grant = (await call("POST", "/api/grants", { scopes: ["location"], hours: 2 }, sam)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, jordan);
    advance(3 * 60);
    expect((await call("GET", `/api/watch/${grant.id}`, undefined, jordan)).json.sharingActive).toBe(false);
  });

  it("revokes live grants when the night ends", async () => {
    const nightId = (await startNight()).json.night.id;
    const grant = await shareWithJordan(["location"]);
    await call("POST", `/api/nights/${nightId}/status`, { status: "home-safe" }, sam);
    expect((await call("GET", `/api/watch/${grant.id}`, undefined, jordan)).json.sharingActive).toBe(false);
  });
});

describe("authentication", () => {
  it("rejects a weak password and a malformed email", async () => {
    expect((await call("POST", "/api/auth/signup", { email: "a@b.co", password: "short", displayName: "X" })).status).toBe(400);
    expect((await call("POST", "/api/auth/signup", { email: "nope", password: "a-long-enough-passphrase", displayName: "X" })).status).toBe(400);
  });

  it("refuses a duplicate account", async () => {
    expect((await call("POST", "/api/auth/signup", { email: "sam@example.com", password: "a-long-enough-passphrase", displayName: "Sam" })).status).toBe(409);
  });

  it("logs in with the right password and not the wrong one", async () => {
    expect((await call("POST", "/api/auth/login", { email: "sam@example.com", password: "a-long-enough-passphrase" })).status).toBe(200);
    const bad = await call("POST", "/api/auth/login", { email: "sam@example.com", password: "wrong-password-here" });
    expect(bad.status).toBe(401);
    // The same message whether the account exists or not.
    const unknown = await call("POST", "/api/auth/login", { email: "ghost@example.com", password: "wrong-password-here" });
    expect(unknown.json.error).toBe(bad.json.error);
  });

  it("never returns a password hash", async () => {
    const me = await call("GET", "/api/auth/me", undefined, sam);
    expect(JSON.stringify(me.json)).not.toMatch(/passwordHash|scrypt/);
    const acct = await call("GET", `/api/travelers/${samId}`, undefined, sam);
    expect(JSON.stringify(acct.json)).not.toMatch(/passwordHash|scrypt/);
  });

  it("ends the session on logout", async () => {
    const fresh = await signup("logout@example.com", "Temp");
    expect((await call("GET", "/api/auth/me", undefined, fresh.token)).json.traveler).not.toBeNull();
    await call("POST", "/api/auth/logout", {}, fresh.token);
    expect((await call("GET", "/api/auth/me", undefined, fresh.token)).json.traveler).toBeNull();
  });

  it("treats an expired session as signed out", async () => {
    const fresh = await signup("expiry@example.com", "Temp");
    advance(31 * 24 * 60);
    expect((await call("GET", "/api/auth/me", undefined, fresh.token)).json.traveler).toBeNull();
    expect((await call("POST", "/api/nights", { weightKg: 80 }, fresh.token)).status).toBe(401);
  });
});

describe("a signed-out or wrong user gets nothing", () => {
  it("requires a session for every night action", async () => {
    const nightId = (await startNight()).json.night.id;
    for (const [method, path, body] of [
      ["GET", `/api/nights/${nightId}`, undefined],
      ["POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-regular" }],
      ["POST", `/api/nights/${nightId}/location`, { lat: 1, lng: 1 }],
      ["POST", `/api/nights/${nightId}/sos`, {}],
      ["POST", "/api/nights", { weightKg: 80 }],
      ["POST", "/api/grants", {}],
      ["GET", "/api/games/leaderboard", undefined],
    ] as const) {
      expect((await call(method, path, body)).status).toBe(401);
    }
  });

  it("hides another user's night behind a 404, not a 403", async () => {
    const nightId = (await startNight(sam)).json.night.id;
    // Jordan is signed in, just not the owner. 404 so night ids cannot be probed.
    expect((await call("GET", `/api/nights/${nightId}`, undefined, jordan)).status).toBe(404);
    expect((await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-regular" }, jordan)).status).toBe(404);
    expect((await call("POST", `/api/nights/${nightId}/status`, { status: "ended" }, jordan)).status).toBe(404);
  });

  it("will not let one user read another's account or points", async () => {
    expect((await call("GET", `/api/travelers/${samId}`, undefined, jordan)).status).toBe(404);
  });

  it("ignores a travelerId in the body — identity comes from the session", async () => {
    // Jordan tries to bill a night to Sam's account.
    const night = (await call("POST", "/api/nights", { travelerId: samId, weightKg: 70 }, jordan)).json;
    expect(night.night.travelerId).toBe(jordanId);
  });

  it("will not let a stranger revoke someone else's grant", async () => {
    const grant = (await call("POST", "/api/grants", { scopes: ["location"] }, sam)).json;
    expect((await call("POST", `/api/grants/${grant.id}/revoke`, {}, jordan)).status).toBe(404);
  });
});

describe("plan gating", () => {
  it("blocks premium features on the free plan but never SOS", async () => {
    const jordanNight = (await call("POST", "/api/nights", { weightKg: 70 }, jordan)).json.night;

    expect((await call("GET", `/api/nights/${jordanNight.id}/recovery`, undefined, jordan)).status).toBe(402);
    expect((await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01 },
    }, jordan)).status).toBe(402);

    // Safety basics stay free.
    expect((await call("POST", `/api/nights/${jordanNight.id}/sos`, {}, jordan)).status).toBe(200);
    expect((await call("POST", `/api/nights/${jordanNight.id}/drinks`, { drinkId: "beer-light" }, jordan)).status).toBe(200);
    expect((await call("POST", "/api/grants", { scopes: ["location"] }, jordan)).status).toBe(200);
  });

  it("allows the same features on a paid plan", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-ipa" }, sam);
    const recovery = (await call("GET", `/api/nights/${nightId}/recovery`, undefined, sam)).json;
    expect(recovery.soberEstimate).toMatch(/only time/i);

    const quotes = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam)).json;
    expect(quotes.length).toBeGreaterThan(0);
  });

  it("awards a large bonus for booking a ride instead of driving", async () => {
    await startNight();
    const before = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    await call("POST", "/api/rides/book", {
      providerId: "uber-x", pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    const after = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
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
      from: { lat: 40.714, lng: -74.003, accuracyMeters: 10, at: clock.toISOString() },
      to: { lat: 40.72, lng: -74.01 },
    }, sam)).json;
    expect(routes.some((r: any) => r.reasons.some((x: string) => /lit/i.test(x)))).toBe(true);
  });

  it("refuses to redeem a reward the traveler cannot afford", async () => {
    const res = await call("POST", "/api/points/redeem", { rewardId: "rw-app" }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not enough/i);
  });

  it("runs the worried-text game and keeps the first result", async () => {
    const players = [{ id: samId, displayName: "Sam" }, { id: jordanId, displayName: "Jordan" }];
    const round = (await call("POST", "/api/games/worried-text", { players }, sam)).json;
    await call("POST", `/api/games/worried-text/${round.id}/report`, { playerId: jordanId }, sam);
    const flipped = (await call("POST", `/api/games/worried-text/${round.id}/report`, { playerId: samId }, sam)).json;
    expect(flipped.loserId).toBe(jordanId);
  });
});

describe("adaptive cadence", () => {
  it("pulls the pending check-in closer as drinks pile up", async () => {
    const started = (await startNight()).json;
    const nightId = started.night.id;
    const originalDue = new Date(started.night.checkIns[0].dueAt).getTime();

    for (const drinkId of ["beer-ipa", "shot-whiskey", "beer-ipa", "shot-tequila"]) {
      advance(4);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId }, sam);
    }

    const after = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json;
    expect(new Date(after.pendingCheckIn.dueAt).getTime()).toBeLessThan(originalDue);
  });
});
