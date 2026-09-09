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

  it("does not let a signed-out caller tell a real night id from a made-up one", async () => {
    const nightId = (await startNight(sam)).json.night.id;
    // Both must be 401: a different status for a real id is an enumeration oracle.
    expect((await call("GET", `/api/nights/${nightId}`)).status).toBe(401);
    expect((await call("GET", "/api/nights/night_totally_made_up")).status).toBe(401);
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

  it("runs a game round and keeps the first result", async () => {
    const players = [{ id: samId, displayName: "Sam" }, { id: jordanId, displayName: "Jordan" }];
    const round = (await call("POST", "/api/games/rounds", { gameId: "worried-text", players }, sam)).json;
    await call("POST", `/api/games/rounds/${round.id}/settle`, { loserId: jordanId }, sam);
    const flipped = (await call("POST", `/api/games/rounds/${round.id}/settle`, { loserId: samId }, sam)).json;
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

describe("crew", () => {
  const makeCrew = () => call("POST", "/api/crews", { name: "Friday" }, sam);

  it("creates a crew with the creator in it and a join code", async () => {
    const crew = (await makeCrew()).json;
    expect(crew.joinCode).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(crew.members).toHaveLength(1);
    expect(crew.members[0].travelerId).toBe(samId);
  });

  it("lets someone join with the code and shows the table", async () => {
    const crew = (await makeCrew()).json;
    await call("POST", "/api/crews/join", { joinCode: crew.joinCode }, jordan);
    const view = (await call("GET", `/api/crews/${crew.id}`, undefined, sam)).json;
    expect(view.members).toHaveLength(2);
    expect(view.members.map((m: any) => m.displayName).sort()).toEqual(["Jordan", "Sam"]);
  });

  it("refuses a bad code", async () => {
    expect((await call("POST", "/api/crews/join", { joinCode: "ZZZ-999" }, jordan)).status).toBe(404);
  });

  it("is members-only — a join code is not a spectator pass", async () => {
    const crew = (await makeCrew()).json;
    expect((await call("GET", `/api/crews/${crew.id}`, undefined, jordan)).status).toBe(404);
    expect((await call("GET", `/api/crews/${crew.id}`)).status).toBe(401);
  });

  it("flags whoever is ahead of the table", async () => {
    const crew = (await makeCrew()).json;
    await call("POST", "/api/crews/join", { joinCode: crew.joinCode }, jordan);

    const samNight = (await startNight(sam)).json.night.id;
    const jordanNight = (await call("POST", "/api/nights", { weightKg: 70 }, jordan)).json.night.id;
    await call("POST", `/api/nights/${jordanNight}/drinks`, { drinkId: "beer-light" }, jordan);
    for (const d of ["beer-ipa", "beer-ipa", "shot-whiskey", "beer-ipa"]) {
      await call("POST", `/api/nights/${samNight}/drinks`, { drinkId: d }, sam);
    }

    const view = (await call("GET", `/api/crews/${crew.id}`, undefined, jordan)).json;
    expect(view.members.find((m: any) => m.travelerId === samId).state).toBe("ahead");
  });

  it("hides a member's count when they opt out, without hiding the member", async () => {
    const crew = (await makeCrew()).json;
    await call("POST", "/api/crews/join", { joinCode: crew.joinCode }, jordan);
    const nightId = (await startNight(sam)).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-ipa" }, sam);

    await call("POST", `/api/crews/${crew.id}/share-count`, { sharesCount: false }, sam);
    const view = (await call("GET", `/api/crews/${crew.id}`, undefined, jordan)).json;
    const samRow = view.members.find((m: any) => m.travelerId === samId);
    expect(samRow.drinks).toBeNull();
    expect(samRow.displayName).toBe("Sam");
  });

  it("lets a member leave, and then they can no longer read it", async () => {
    const crew = (await makeCrew()).json;
    await call("POST", "/api/crews/join", { joinCode: crew.joinCode }, jordan);
    await call("POST", `/api/crews/${crew.id}/leave`, {}, jordan);
    expect((await call("GET", `/api/crews/${crew.id}`, undefined, jordan)).status).toBe(404);
  });
});

describe("pharmacy run", () => {
  it("authorizes while sober and fires once the estimate crosses the band", async () => {
    const nightId = (await startNight()).json.night.id;
    const authed = (await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
      basketId: "hydration", capCents: 3000, triggerBand: "high", deliverTo: "142 Rowan St",
    }, sam)).json;
    expect(authed.auth.enabled).toBe(true);
    expect(authed.orders).toEqual([]);

    // Drink into the "high" band.
    for (const d of ["shot-whiskey", "shot-tequila", "beer-ipa", "shot-whiskey", "beer-ipa"]) {
      advance(5);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    const after = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json;
    expect(after.bac.band === "high" || after.bac.band === "severe").toBe(true);
    expect(after.carePackage.orders).toHaveLength(1);
    expect(after.carePackage.orders[0].reason).toBe("auto");
  });

  it("never sends the automatic run twice", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
      basketId: "hydration", capCents: 3000, triggerBand: "moderate", deliverTo: "Home",
    }, sam);
    for (const d of ["shot-whiskey", "shot-tequila", "beer-ipa", "shot-whiskey"]) {
      advance(5);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    await call("GET", `/api/nights/${nightId}`, undefined, sam);
    const state = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.carePackage;
    expect(state.orders.filter((o: any) => o.reason === "auto")).toHaveLength(1);
  });

  it("REFUSES to take an authorization once the traveler is already impaired", async () => {
    const nightId = (await startNight()).json.night.id;
    for (const d of ["shot-whiskey", "shot-tequila", "beer-ipa", "shot-whiskey"]) {
      advance(4);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    const res = await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
      basketId: "hydration", capCents: 3000, triggerBand: "high", deliverTo: "Home",
    }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/before you start drinking/i);
  });

  it("refuses a basket over the cap rather than trimming it", async () => {
    const nightId = (await startNight()).json.night.id;
    const res = await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
      basketId: "morning-after", capCents: 200, triggerBand: "high", deliverTo: "Home",
    }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/more than your cap/i);
  });

  it("stops sending after the traveler cancels", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
      basketId: "hydration", capCents: 3000, triggerBand: "moderate", deliverTo: "Home",
    }, sam);
    await call("POST", `/api/nights/${nightId}/care-package/cancel`, {}, sam);
    for (const d of ["shot-whiskey", "shot-tequila", "beer-ipa", "shot-whiskey"]) {
      advance(5);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    const state = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.carePackage;
    expect(state.orders).toEqual([]);
  });

  it("lets the bound guardian send one by hand", async () => {
    const nightId = (await startNight()).json.night.id;
    const grant = (await call("POST", "/api/grants", { scopes: ["location", "drinks"] }, sam)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, jordan);

    const res = await call("POST", `/api/nights/${nightId}/care-package/send`, { basketId: "morning-after" }, jordan);
    expect(res.status).toBe(200);
    expect(res.json.order.reason).toBe("guardian");
  });

  it("does not let a stranger send to someone else's address", async () => {
    const nightId = (await startNight()).json.night.id;
    const mallory = await signup("cp-mal@example.com", "Mallory");
    expect((await call("POST", `/api/nights/${nightId}/care-package/send`, { basketId: "food" }, mallory.token)).status).toBe(404);
  });
});

describe("subscription", () => {
  it("switches the plan and unlocks its features", async () => {
    expect((await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01 },
    }, jordan)).status).toBe(402);

    const res = await call("POST", "/api/subscription", { planId: "premium-plus", cadence: "annual" }, jordan);
    expect(res.status).toBe(200);
    expect(res.json.plan.id).toBe("premium-plus");

    expect((await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01 },
    }, jordan)).status).toBe(200);
  });

  it("is explicit that no payment was taken", async () => {
    const res = await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    expect(res.json.billingConnected).toBe(false);
    expect(res.json.note).toMatch(/nothing was charged/i);
  });

  it("rejects an unknown plan and requires a session", async () => {
    expect((await call("POST", "/api/subscription", { planId: "enterprise" }, jordan)).status).toBe(400);
    expect((await call("POST", "/api/subscription", { planId: "family" })).status).toBe(401);
  });
});

describe("resuming a night", () => {
  it("returns nothing before a night starts", async () => {
    expect((await call("GET", "/api/nights/current", undefined, sam)).json.night).toBeNull();
  });

  it("hands back the night in progress, so a reload picks it up", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-ipa" }, sam);
    const current = (await call("GET", "/api/nights/current", undefined, sam)).json;
    expect(current.night.id).toBe(nightId);
    expect(current.stats.alcoholicDrinks).toBe(1);
  });

  it("stops offering a night once it is finished", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/status`, { status: "home-safe" }, sam);
    expect((await call("GET", "/api/nights/current", undefined, sam)).json.night).toBeNull();
  });

  it("never hands back someone else's night", async () => {
    await startNight(sam);
    expect((await call("GET", "/api/nights/current", undefined, jordan)).json.night).toBeNull();
  });

  it("requires a session", async () => {
    expect((await call("GET", "/api/nights/current")).status).toBe(401);
  });
});

describe("games", () => {
  const players = () => [{ id: samId, displayName: "Sam" }, { id: jordanId, displayName: "Jordan" }];

  it("lists the catalogue with rules and forfeits", async () => {
    const { games } = (await call("GET", "/api/games")).json;
    expect(games.length).toBeGreaterThanOrEqual(5);
    for (const g of games) {
      expect(g.howItWorks.length).toBeGreaterThan(40);
      expect(g.forfeit.toLowerCase()).not.toMatch(/\b(shot|shots|chug|pint)\b/);
    }
  });

  it("needs the plan that includes games", async () => {
    expect((await call("POST", "/api/games/rounds", { gameId: "worried-text", players: players() }, jordan)).status).toBe(402);
  });

  it("enforces the minimum player count", async () => {
    const res = await call("POST", "/api/games/rounds", { gameId: "check-in-roulette", players: players() }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/at least 3/);
  });

  it("settles a race on a winner and pays them", async () => {
    const round = (await call("POST", "/api/games/rounds", { gameId: "ride-home-race", players: players() }, sam)).json;
    const before = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    const settled = (await call("POST", `/api/games/rounds/${round.id}/settle`, { winnerId: samId }, sam)).json;
    expect(settled.winnerId).toBe(samId);
    const after = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    expect(after).toBeGreaterThan(before);
  });

  it("takes guesses and settles closest-wins", async () => {
    const round = (await call("POST", "/api/games/rounds", { gameId: "guess-the-tab", players: players() }, sam)).json;
    await call("POST", `/api/games/rounds/${round.id}/guess`, { guess: 10 }, sam);
    await call("POST", `/api/games/rounds/${round.id}/guess`, { guess: 25 }, jordan);
    const settled = (await call("POST", `/api/games/rounds/${round.id}/settle`, { actualStandardDrinks: 12 }, sam)).json;
    expect(settled.winnerId).toBe(samId);
    expect(settled.loserId).toBe(jordanId);
  });

  it("keeps non-players out", async () => {
    const round = (await call("POST", "/api/games/rounds", { gameId: "worried-text", players: players() }, sam)).json;
    const mallory = await signup("game-mal@example.com", "Mallory");
    expect((await call("POST", `/api/games/rounds/${round.id}/settle`, { loserId: samId }, mallory.token)).status).toBe(404);
  });
});

describe("food orders confirmed sober", () => {
  const queue = () => call("POST", "/api/orders", {
    provider: "uber-eats", vendorName: "Marisol Cantina", deliverTo: "142 Rowan St",
    lines: [{ sku: "burrito", name: "Burrito", priceCents: 1450, qty: 2 }],
    queuedBecause: "You wanted tacos at 1am.",
  }, sam);

  it("queues without charging", async () => {
    const order = (await queue()).json;
    expect(order.status).toBe("waiting");
    expect(order.totalCents).toBe(2900);
  });

  it("does NOT ask while the person is impaired", async () => {
    const nightId = (await startNight()).json.night.id;
    for (const d of ["shot-whiskey", "shot-tequila", "beer-ipa", "shot-whiskey"]) {
      advance(4);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    await queue();
    const pending = (await call("GET", "/api/orders/pending", undefined, sam)).json;
    expect(["moderate", "high", "severe"]).toContain(pending.band);
    expect(pending.askNow).toEqual([]);
    expect(pending.waiting).toHaveLength(1);
  });

  it("refuses a confirmation taken while impaired, and charges nothing", async () => {
    const nightId = (await startNight()).json.night.id;
    for (const d of ["shot-whiskey", "shot-tequila", "beer-ipa", "shot-whiskey"]) {
      advance(4);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    const order = (await queue()).json;
    const res = await call("POST", `/api/orders/${order.id}/confirm`, {}, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/nothing has been charged/i);
  });

  it("asks once they have sobered up, and confirms then", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "shot-whiskey" }, sam);
    const order = (await queue()).json;

    advance(9 * 60);
    const pending = (await call("GET", "/api/orders/pending", undefined, sam)).json;
    expect(pending.askNow.map((o: any) => o.id)).toEqual([order.id]);

    const confirmed = (await call("POST", `/api/orders/${order.id}/confirm`, {}, sam)).json;
    expect(confirmed.status).toBe("confirmed");
  });

  it("lets them decline, and expires anything nobody answers", async () => {
    const order = (await queue()).json;
    expect((await call("POST", `/api/orders/${order.id}/decline`, {}, sam)).json.status).toBe("declined");

    const stale = (await queue()).json;
    advance(30 * 60);
    const pending = (await call("GET", "/api/orders/pending", undefined, sam)).json;
    expect(pending.askNow.find((o: any) => o.id === stale.id)).toBeUndefined();
  });

  it("never shows one user another's orders", async () => {
    const order = (await queue()).json;
    expect((await call("GET", "/api/orders/pending", undefined, jordan)).json.waiting).toEqual([]);
    expect((await call("POST", `/api/orders/${order.id}/confirm`, {}, jordan)).status).toBe(404);
  });
});

describe("party supply", () => {
  it("serves a catalogue across every category", async () => {
    const { categories, items } = (await call("GET", "/api/party/catalog")).json;
    expect(categories.length).toBe(6);
    for (const c of categories) {
      expect(items.some((i: any) => i.category === c.id)).toBe(true);
    }
  });

  it("suggests a cart that covers the headcount", async () => {
    const res = (await call("GET", "/api/party/suggest?guests=20")).json;
    expect(res.summary.coversGuests).toBeGreaterThanOrEqual(20);
    expect(res.summary.subtotalCents).toBeGreaterThan(0);
  });

  it("saves a cart and splits rentals from purchases", async () => {
    const res = (await call("POST", "/api/party/cart", {
      lines: [{ sku: "pt-chair", qty: 10 }, { sku: "pt-cups", qty: 1 }],
    }, sam)).json;
    expect(res.summary.rentalCents).toBe(2500);
    expect(res.summary.purchaseCents).toBe(2800);
    expect((await call("GET", "/api/party/cart", undefined, sam)).json.summary.subtotalCents).toBe(5300);
  });

  it("rejects an unknown sku rather than storing a broken cart", async () => {
    expect((await call("POST", "/api/party/cart", { lines: [{ sku: "pt-unicorn", qty: 1 }] }, sam)).status).toBe(400);
    expect((await call("GET", "/api/party/cart", undefined, sam)).json.lines).toEqual([]);
  });

  it("keeps carts per account", async () => {
    await call("POST", "/api/party/cart", { lines: [{ sku: "pt-chair", qty: 4 }] }, sam);
    expect((await call("GET", "/api/party/cart", undefined, jordan)).json.lines).toEqual([]);
  });
});

describe("medical escalation", () => {
  it("serves red flags and the local emergency number without a plan", async () => {
    const res = await call("GET", "/api/emergency?region=US", undefined, jordan);
    expect(res.status).toBe(200);
    expect(res.json.emergency.number).toBe("911");
    expect(res.json.redFlags.length).toBeGreaterThan(5);
  });

  it("says plainly that it cannot dispatch an ambulance", async () => {
    const res = await call("GET", "/api/emergency?region=GB", undefined, sam);
    expect(res.json.emergency.number).toBe("999");
    expect(res.json.notAnAmbulanceService).toMatch(/cannot dispatch an ambulance/i);
    expect(res.json.notAnAmbulanceService).toMatch(/rideshare is not emergency medical transport/i);
  });

  it("returns no number rather than guessing for an unknown region", async () => {
    expect((await call("GET", "/api/emergency?region=XX", undefined, sam)).json.emergency).toBeNull();
  });

  it("escalates on a single red flag and hands back a dispatcher script", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.7148, lng: -74.0018, venueName: "The Anchor Tavern" }, sam);
    for (const d of ["shot-whiskey", "beer-ipa", "shot-tequila"]) {
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }

    const res = (await call("POST", `/api/nights/${nightId}/emergency/assess`, {
      flags: ["unresponsive"], region: "US",
    }, sam)).json;

    expect(res.assessment.escalation).toBe("call-emergency");
    expect(res.emergency.number).toBe("911");
    expect(res.script[0]).toMatch(/need an ambulance/i);
    expect(res.script.join(" ")).toContain("The Anchor Tavern");
    expect(res.script.join(" ")).toContain("40.71480");
  });

  it("does not manufacture an emergency when nothing is flagged", async () => {
    const nightId = (await startNight()).json.night.id;
    const res = (await call("POST", `/api/nights/${nightId}/emergency/assess`, { concerns: [] }, sam)).json;
    expect(res.assessment.escalation).toBe("get-checked");
    expect(res.script).toEqual([]);
  });

  it("lets the bound guardian run the check too", async () => {
    const nightId = (await startNight()).json.night.id;
    const grant = (await call("POST", "/api/grants", { scopes: ["location", "drinks"] }, sam)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, jordan);

    const res = await call("POST", `/api/nights/${nightId}/emergency/assess`, { flags: ["seizure"], region: "US" }, jordan);
    expect(res.status).toBe(200);
    expect(res.json.assessment.escalation).toBe("call-emergency");
  });

  it("keeps strangers out", async () => {
    const nightId = (await startNight()).json.night.id;
    const mallory = await signup("er-mal@example.com", "Mallory");
    expect((await call("POST", `/api/nights/${nightId}/emergency/assess`, { flags: ["seizure"] }, mallory.token)).status).toBe(404);
  });

  it("raises the prompt on its own once the night is bad enough", async () => {
    const nightId = (await startNight()).json.night.id;
    expect((await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.promptEmergencyCheck).toBe(false);

    for (const d of ["shot-whiskey", "shot-tequila", "shot-whiskey", "beer-ipa", "shot-tequila", "shot-whiskey"]) {
      advance(4);
      await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: d }, sam);
    }
    expect((await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.promptEmergencyCheck).toBe(true);
  });

  it("offers an urgent-care ride with an explicit not-for-emergencies warning", async () => {
    const res = (await call("POST", "/api/rides/urgent-care", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam)).json;
    expect(res.quotes.length).toBeGreaterThan(0);
    expect(res.warning).toMatch(/call your local emergency number/i);
    expect(res.warning).toMatch(/normal ride, with a normal driver/i);
  });

  it("never lists an ambulance among ride options", async () => {
    const quotes = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam)).json;
    expect(JSON.stringify(quotes).toLowerCase()).not.toMatch(/ambulance|paramedic|medical transport/);
  });
});

describe("HEAD requests", () => {
  it("answers HEAD on an API route with headers and no body", async () => {
    const res = await fetch(`${base}/api/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).not.toBeNull();
    expect(await res.text()).toBe("");
  });

  it("still 404s an unknown API path on HEAD", async () => {
    expect((await fetch(`${base}/api/nope`, { method: "HEAD" })).status).toBe(404);
  });
});

describe("account export and deletion", () => {
  it("exports everything held about the caller, without the password hash", async () => {
    const nightId = (await startNight()).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 40.7148, lng: -74.0018 }, sam);
    await call("POST", `/api/nights/${nightId}/drinks`, { drinkId: "beer-ipa" }, sam);

    const out = (await call("GET", "/api/account/export", undefined, sam)).json;
    expect(out.account.email).toBe("sam@example.com");
    expect(out.nights).toHaveLength(1);
    expect(JSON.stringify(out.locationHistory)).toContain("40.7148");
    expect(JSON.stringify(out)).not.toMatch(/passwordHash|scrypt/);
  });

  it("requires a session to export", async () => {
    expect((await call("GET", "/api/account/export")).status).toBe(401);
  });

  it("refuses deletion without the right password", async () => {
    const res = await call("POST", "/api/account/delete", { password: "wrong-password-here", confirm: "DELETE" }, sam);
    expect(res.status).toBe(401);
    expect((await call("GET", "/api/auth/me", undefined, sam)).json.traveler).not.toBeNull();
  });

  it("refuses deletion without the typed confirmation", async () => {
    const res = await call("POST", "/api/account/delete", { password: "a-long-enough-passphrase", confirm: "yes" }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/type DELETE/i);
  });

  it("deletes the account and everything on it", async () => {
    const doomed = await signup("doomed@example.com", "Doomed");
    const nightId = (await call("POST", "/api/nights", { weightKg: 80, drinkLimit: 4 }, doomed.token)).json.night.id;
    await call("POST", `/api/nights/${nightId}/location`, { lat: 51.5, lng: -0.12 }, doomed.token);

    const res = (await call("POST", "/api/account/delete", {
      password: "a-long-enough-passphrase", confirm: "DELETE",
    }, doomed.token)).json;

    expect(res.deleted).toBe(true);
    expect(res.summary.nights).toBe(1);
    expect(res.summary.locationPings).toBe(1);

    // The session dies with it, and the night is unreachable.
    expect((await call("GET", "/api/auth/me", undefined, doomed.token)).json.traveler).toBeNull();
    expect((await call("GET", `/api/nights/${nightId}`, undefined, doomed.token)).status).toBe(401);
    expect((await call("GET", `/api/nights/${nightId}`, undefined, sam)).status).toBe(404);
  });

  it("frees the email, so the same address can sign up again", async () => {
    const first = await signup("recycle@example.com", "First");
    await call("POST", "/api/account/delete", { password: "a-long-enough-passphrase", confirm: "DELETE" }, first.token);
    const second = await signup("recycle@example.com", "Second");
    expect(second.res.status).toBe(200);
    expect(second.id).not.toBe(first.id);
  });

  it("cuts off anyone who was watching them", async () => {
    const doomed = await signup("watched@example.com", "Watched");
    await call("POST", "/api/nights", { weightKg: 80, drinkLimit: 4 }, doomed.token);
    const grant = (await call("POST", "/api/grants", { scopes: ["location"] }, doomed.token)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, sam);
    expect((await call("GET", `/api/watch/${grant.id}`, undefined, sam)).status).toBe(200);

    await call("POST", "/api/account/delete", { password: "a-long-enough-passphrase", confirm: "DELETE" }, doomed.token);
    expect((await call("GET", `/api/watch/${grant.id}`, undefined, sam)).status).toBe(404);
  });

  it("does not disturb anyone else's account", async () => {
    const doomed = await signup("bystander-test@example.com", "Doomed");
    await call("POST", "/api/account/delete", { password: "a-long-enough-passphrase", confirm: "DELETE" }, doomed.token);
    expect((await call("GET", "/api/auth/me", undefined, sam)).json.traveler.email).toBe("sam@example.com");
  });
});
