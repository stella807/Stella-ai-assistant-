import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp, makeCtx } from "../src/server.ts";
import { Store } from "../src/store.ts";
import { SEED } from "../src/seed.ts";
import { hashPassword } from "../src/auth.ts";
import { runPayroll, type Ctx } from "../src/routes.ts";
import { authorizeExactHold, previousPayoutPeriod, recordCharge, resetFlags, settleCharge, setFlag } from "@safehubby/core";

let server: ReturnType<typeof createApp>;
let base: string;
let dir: string;
let clock: Date;
let store: Store;
let ctx: Ctx;

/** Each "session" is just a bearer token, so tests can act as different users. */
const call = async (
  method: string, path: string, body?: unknown, token?: string | null,
  extraHeaders?: Record<string, string>,
) => {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {}, setCookie: res.headers.get("set-cookie") };
};

/** Admin routes (driver-application review) are gated by a shared secret in a
 *  header, not a session — see requireAdmin in routes.ts. */
const callAdmin = (method: string, path: string, body?: unknown, key = "test-admin-key") =>
  call(method, path, body, null, { "x-admin-key": key });

let sam = "", jordan = "", samId = "", jordanId = "";

const signup = async (email: string, displayName: string) => {
  const res = await call("POST", "/api/auth/signup", { email, password: "a-long-enough-passphrase", displayName });
  const token = /sh_session=([^;]+)/.exec(res.setCookie ?? "")?.[1] ?? "";
  return { token, id: res.json.traveler?.id as string, res };
};

/**
 * Provisions an assistant account directly in the store (mirroring
 * `provisionAssistantCredentials` in routes.ts) and signs in, the way the
 * partner network's relayed temp password would in reality. The employee
 * portal is cookie-only, not Bearer — see readAssistantToken in server.ts —
 * so callers get back a `Cookie` header to pass as `extraHeaders`, not a
 * token to hand to `call`'s own `token` parameter.
 */
const assistantLogin = async (assistantId: string, password = "a-fine-assistant-password", mustChangePassword = true) => {
  const passwordHash = await hashPassword(password);
  store.update((db) => {
    db.assistantCredentials[assistantId] = {
      username: assistantId, passwordHash, mustChangePassword, createdAt: clock.toISOString(),
    };
  });
  const res = await call("POST", "/api/assistant/auth/login", { username: assistantId, password });
  const token = /sh_assistant_session=([^;]+)/.exec(res.setCookie ?? "")?.[1] ?? "";
  return { cookie: { Cookie: `sh_assistant_session=${token}` }, res };
};

const advance = (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000); };

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "safehubby-"));
  clock = new Date("2026-01-01T20:00:00Z");
  store = new Store(join(dir, "db.json"));
  store.reset(structuredClone(SEED));
  ctx = { ...makeCtx(store), now: () => clock };
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

    const rides = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam)).json;
    expect(rides.handoffs.length).toBeGreaterThan(0);
  });

  it("awards a large bonus for booking a ride instead of driving", async () => {
    await startNight();
    const before = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    await call("POST", "/api/rides/book", { providerId: "uber-x" }, sam);
    const after = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    expect(after - before).toBe(100);
  });
});

describe("extras", () => {
  it("lists nearby venues with their menus", async () => {
    const venues = (await call("GET", "/api/venues?lat=40.714&lng=-74.003", undefined, sam)).json;
    expect(venues[0].menuDrinkIds.length).toBeGreaterThan(0);
    expect(venues[0].foodMenu.length).toBeGreaterThan(0);
  });

  it("keeps the billed location lookups behind a session", async () => {
    // Places and Yelp charge per search, so an open endpoint is the operator's
    // invoice, payable by anyone who finds the URL.
    expect((await call("GET", "/api/venues?lat=40.714&lng=-74.003")).status).toBe(401);
    expect((await call("GET", "/api/supplies/stores?lat=40.714&lng=-74.003")).status).toBe(401);
  });

  it("refuses coordinates that are not coordinates", async () => {
    // Number("banana") is NaN, and NaN is not nullish, so `?? default` never
    // caught this — it went to the provider as a malformed billed request.
    expect((await call("GET", "/api/venues?lat=banana&lng=-74.003", undefined, sam)).status).toBe(400);
    expect((await call("GET", "/api/venues?lat=999&lng=-74.003", undefined, sam)).status).toBe(400);
    expect((await call("GET", "/api/venues", undefined, sam)).status).toBe(400);
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

  describe("extended menu (premium baskets)", () => {
    // Sam is premium-plus by default (see beforeEach), which now includes
    // `extended-menu` — Premium Plus is the everything tier. Premium
    // ("premium-basic") is the cheapest paid plan that still doesn't have it,
    // so it's what these gate tests downgrade to.
    const downgradeToBasic = () => call("POST", "/api/subscription", { planId: "premium-basic" }, sam);

    it("marks premium baskets locked below the top tiers, unlocked baskets for everyone", async () => {
      await downgradeToBasic();
      const { baskets } = (await call("GET", "/api/care-package/baskets", undefined, sam)).json;
      const pizza = baskets.find((b: any) => b.id === "pizza-night");
      const hydration = baskets.find((b: any) => b.id === "hydration");
      expect(pizza.locked).toBe(true);
      expect(hydration.locked).toBe(false);
    });

    it("refuses to authorize a premium basket on a plan that can't run one at all", async () => {
      await downgradeToBasic();
      const nightId = (await startNight()).json.night.id;
      const res = await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
        basketId: "pizza-night", capCents: 3000, triggerBand: "high", deliverTo: "Home",
      }, sam);
      // 402, but on `supply-delivery` rather than `extended-menu`: now that
      // the extended menu comes with every plan that has supply-delivery,
      // the supply-delivery gate is always the one that fires first on this
      // route. Asserting only the status keeps this test about the refusal
      // rather than about which of two gates got there first.
      expect(res.status).toBe(402);
    });

    it("refuses to hand-send a premium basket on a plan without the extended menu", async () => {
      // The hand-send path doesn't require `supply-delivery` (a partner is
      // paying, out of their own pocket), so this is where the basket-tier
      // gate is actually still reachable.
      await downgradeToBasic();
      const nightId = (await startNight()).json.night.id;
      const res = await call("POST", `/api/nights/${nightId}/care-package/send`, { basketId: "burger-and-fries" }, sam);
      expect(res.status).toBe(402);
      expect(res.json.error).toMatch(/extended menu/i);
    });

    it("unlocks the full menu on Premium Plus, with no upgrade to Family needed", async () => {
      const nightId = (await startNight()).json.night.id;

      const { baskets } = (await call("GET", "/api/care-package/baskets", undefined, sam)).json;
      expect(baskets.find((b: any) => b.id === "pizza-night").locked).toBe(false);

      const authed = await call("POST", `/api/nights/${nightId}/care-package/authorize`, {
        basketId: "pizza-night", capCents: 3000, triggerBand: "high", deliverTo: "Home",
      }, sam);
      expect(authed.status).toBe(200);

      const sent = await call("POST", `/api/nights/${nightId}/care-package/send`, { basketId: "takeout-bowl" }, sam);
      expect(sent.status).toBe(200);
    });
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

  it("starts a trial rather than charging on the way in", async () => {
    const res = await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    expect(res.json.subscription.status).toBe("trialing");
    expect(res.json.charged).toBeNull();
    expect(res.json.note).toMatch(/nothing has been charged/i);
    expect(res.json.statement.settledCents).toBe(0);
  });

  it("rejects an unknown plan and requires a session", async () => {
    expect((await call("POST", "/api/subscription", { planId: "enterprise" }, jordan)).status).toBe(400);
    expect((await call("POST", "/api/subscription", { planId: "family" })).status).toBe(401);
  });
});

describe("one billing surface", () => {
  const addCard = (token: string) =>
    call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, token);

  it("answers the card, the plan and every charge in a single call", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-plus", cadence: "monthly" }, jordan);

    const billing = (await call("GET", "/api/billing", undefined, jordan)).json;
    expect(billing.method.last4).toBe("4242");
    expect(billing.subscription.planId).toBe("premium-plus");
    expect(billing.plan.id).toBe("premium-plus");
    expect(Array.isArray(billing.charges)).toBe(true);
    expect(billing.statement).toHaveProperty("settledCents");
  });

  it("requires a session — money is nobody else's business", async () => {
    expect((await call("GET", "/api/billing")).status).toBe(401);
    expect((await call("POST", "/api/subscription/cancel")).status).toBe(401);
  });

  it("puts a ride on the same statement as the subscription", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-plus" }, jordan);
    await call("POST", "/api/rides/book", {
      pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01, label: "Home" },
    }, jordan);

    const billing = (await call("GET", "/api/billing", undefined, jordan)).json;
    const kinds = billing.charges.map((c: any) => c.kind);
    // The ride is on the ledger whether it booked automatically or handed off;
    // what matters is that nothing lands anywhere other than here.
    expect(kinds.every((k: string) => ["subscription", "ride", "secure-transport", "supplies"].includes(k))).toBe(true);
    expect(billing.charges.every((c: any) => c.railNote)).toBe(true);
  });

  it("bills a web subscription to the card and an in-app one to the store", async () => {
    await addCard(jordan);
    // Out of the trial first, so a plan change actually produces a charge.
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    advance(60 * 24 * 15);                                  // past the 14-day trial

    const web = await call("POST", "/api/subscription", { planId: "premium-plus", platform: "web" }, jordan);
    expect(web.json.charged.rail).toBe("card");
    expect(web.json.charged.status).toBe("settled");
    expect(web.json.awaitingStoreReceipt).toBe(false);

    const ios = await call("POST", "/api/subscription", { planId: "family", platform: "ios" }, jordan);
    expect(ios.json.charged.rail).toBe("app-store");
    expect(ios.json.charged.status).toBe("pending");
    expect(ios.json.awaitingStoreReceipt).toBe(true);
    expect(ios.json.note).toMatch(/store/i);
  });

  it("credits the unused part of a period instead of charging twice for it", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    advance(60 * 24 * 15);                                  // the trial ends and the first month begins
    advance(60 * 24 * 14);                                  // roughly halfway through that month

    const up = await call("POST", "/api/subscription", { planId: "premium-plus", platform: "web" }, jordan);
    const full = (await call("GET", "/api/catalog")).json.plans.find((p: any) => p.id === "premium-plus").monthlyCents;
    expect(up.json.charged.amountCents).toBeLessThan(full);
    expect(up.json.charged.amountCents).toBeGreaterThan(0);
  });

  it("settles a store purchase only against its receipt, and never a card line", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    advance(60 * 24 * 15);                                  // past the trial, so changes are billable

    const web = await call("POST", "/api/subscription", { planId: "premium-plus", platform: "web" }, jordan);
    const ios = await call("POST", "/api/subscription", { planId: "family", platform: "ios" }, jordan);
    const chargeId = ios.json.charged.id;

    expect((await call("POST", `/api/billing/charges/${chargeId}/confirm`, {}, jordan)).status).toBe(400);
    const done = await call("POST", `/api/billing/charges/${chargeId}/confirm`, { receipt: "apple-receipt-1" }, jordan);
    expect(done.status).toBe(200);
    expect(done.json.charges.find((c: any) => c.id === chargeId).status).toBe("settled");
    // Honest about what it did not do.
    expect(done.json.verified).toBe(false);

    // A card line cannot be marked paid by claiming a store receipt for it.
    expect((await call("POST", `/api/billing/charges/${web.json.charged.id}/confirm`, { receipt: "x" }, jordan)).status).toBe(400);
  });

  it("will not let one person confirm or read another person's charges", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    advance(60 * 24 * 15);
    const ios = await call("POST", "/api/subscription", { planId: "family", platform: "ios" }, jordan);

    expect((await call("POST", `/api/billing/charges/${ios.json.charged.id}/confirm`, { receipt: "r" }, sam)).status).toBe(404);
    expect((await call("GET", "/api/billing", undefined, sam)).json.charges).toEqual([]);
  });

  it("keeps paid features until the period runs out after cancelling", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-plus" }, jordan);
    const canceled = await call("POST", "/api/subscription/cancel", {}, jordan);
    expect(canceled.json.subscription.status).toBe("canceled");
    expect(canceled.json.plan.id).toBe("premium-plus");
    expect(canceled.json.note).toMatch(/stays on until/);

    // A quote still works today, which is the whole point of not cutting off mid-period.
    expect((await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01 },
    }, jordan)).status).toBe(200);
  });

  it("has nothing to cancel before there is a subscription", async () => {
    expect((await call("POST", "/api/subscription/cancel", {}, jordan)).status).toBe(404);
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

  it("settles Open Mic on a winner, like the other water/pacing games", async () => {
    const round = (await call("POST", "/api/games/rounds", { gameId: "open-mic", players: players() }, sam)).json;
    const settled = (await call("POST", `/api/games/rounds/${round.id}/settle`, { winnerId: jordanId }, sam)).json;
    expect(settled.winnerId).toBe(jordanId);
    expect(settled.status).toBe("settled");
  });

  it("settles Roll for It on whoever rolled the number, first report wins", async () => {
    const round = (await call("POST", "/api/games/rounds", { gameId: "roll-for-it", players: players() }, sam)).json;
    const settled = (await call("POST", `/api/games/rounds/${round.id}/settle`, { loserId: samId }, sam)).json;
    expect(settled.loserId).toBe(samId);
    // Second report is ignored, same rule as every other forfeit-style game.
    const again = (await call("POST", `/api/games/rounds/${round.id}/settle`, { loserId: jordanId }, sam)).json;
    expect(again.loserId).toBe(samId);
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

describe("party supply (held for a later release)", () => {
  it("is hidden behind the release flag", async () => {
    for (const path of ["/api/party/catalog", "/api/party/suggest?guests=20", "/api/party/cart"]) {
      const res = await call("GET", path, undefined, sam);
      expect(res.status).toBe(404);
      expect(res.json.error).toMatch(/later release/i);
    }
    expect((await call("POST", "/api/party/cart", { lines: [] }, sam)).status).toBe(404);
  });

  it("still works once the flag is on", async () => {
    setFlag("party-supply", true);
    try {
      const { categories, items } = (await call("GET", "/api/party/catalog", undefined, sam)).json;
      expect(categories.length).toBe(6);
      for (const c of categories) expect(items.some((i: any) => i.category === c.id)).toBe(true);

      const suggested = (await call("GET", "/api/party/suggest?guests=20", undefined, sam)).json;
      expect(suggested.summary.coversGuests).toBeGreaterThanOrEqual(20);

      const saved = (await call("POST", "/api/party/cart", {
        lines: [{ sku: "pt-chair", qty: 10 }, { sku: "pt-cups", qty: 1 }],
      }, sam)).json;
      expect(saved.summary.rentalCents).toBe(2500);
      expect(saved.summary.purchaseCents).toBe(2800);

      expect((await call("POST", "/api/party/cart", { lines: [{ sku: "pt-unicorn", qty: 1 }] }, sam)).status).toBe(400);
      expect((await call("GET", "/api/party/cart", undefined, jordan)).json.lines).toEqual([]);
    } finally {
      resetFlags();
    }
  });
});

describe("ride hand-off", () => {
  it("returns links to the real apps, not invented fares", async () => {
    const res = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 },
      dropoff: { lat: 40.75, lng: -73.98, label: "142 Rowan St" },
    }, sam)).json;

    expect(res.mode).toBe("handoff");
    expect(res.handoffs.map((h: any) => h.provider)).toEqual(["Uber", "Lyft", "Maps"]);
    // No prices anywhere: we cannot know them, so we must not show them.
    expect(JSON.stringify(res.handoffs)).not.toMatch(/fareEstimate|\$\d/);
    expect(res.handoffs[0].url).toContain("m.uber.com/ul/");
    expect(res.note).toMatch(/guests\.trips/);
  });

  it("still records the ride home so the points are real", async () => {
    await startNight();
    const before = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    const res = (await call("POST", "/api/rides/book", { providerId: "uber" }, sam)).json;
    expect(res.mode).toBe("handoff");
    expect(res.recorded).toBe(true);
    const after = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    expect(after - before).toBe(100);
  });

  it("is still gated on the paid plan", async () => {
    expect((await call("POST", "/api/rides/quote", {
      pickup: { lat: 1, lng: 1 }, dropoff: { lat: 2, lng: 2 },
    }, jordan)).status).toBe(402);
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
    const rides = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam)).json;
    expect(JSON.stringify(rides).toLowerCase()).not.toMatch(/ambulance|paramedic|medical transport/);
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

describe("automatic fulfilment", () => {
  it("reports what is configured and what each missing piece needs", async () => {
    const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
    // No credentials in tests, so everything falls back rather than faking.
    expect(res.rides.mode).toBe("handoff");
    expect(res.rides.requires).toMatch(/Uber developer app/i);
    expect(res.delivery.requires).toMatch(/Instacart/i);
    expect(res.secureTransport.requires).toMatch(/partner agreement/i);
    expect(res.disclosures.join(" ")).toMatch(/may be armed/i);
  });

  it("requires a session", async () => {
    expect((await call("GET", "/api/fulfillment/status")).status).toBe(401);
  });

  it("hands off rather than claiming a booking it did not make", async () => {
    const res = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 },
      dropoff: { lat: 40.75, lng: -73.98, label: "142 Rowan St" },
    }, sam)).json;
    expect(res.mode).toBe("handoff");
    expect(res.handoffs.length).toBe(3);
  });

  it("does not offer secure transport without a configured provider", async () => {
    const res = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam)).json;
    expect(res.secure).toBeNull();
  });
});

describe("secure transport", () => {
  it("is gated on the plan that includes it", async () => {
    // Jordan stays free (see beforeEach). Premium Plus now includes secure
    // transport, so the gate has to be checked from below it.
    const res = await call("POST", "/api/rides/secure", {
      acknowledgedDisclosures: true,
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, jordan);
    expect(res.status).toBe(402);
  });

  it("is included on Premium Plus, with no upgrade to Family needed", async () => {
    // Sam is premium-plus (see beforeEach). Past the plan gate, so the only
    // thing left to refuse on is the missing provider — a 503, not a 402.
    const res = await call("POST", "/api/rides/secure", {
      acknowledgedDisclosures: true,
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    expect(res.status).toBe(503);
  });

  it("refuses when no licensed provider is configured, rather than pretending", async () => {
    await call("POST", "/api/subscription", { planId: "family" }, sam);
    const res = await call("POST", "/api/rides/secure", {
      acknowledgedDisclosures: true,
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/partner agreement/i);
  });

  it("will not book without the disclosures acknowledged", async () => {
    const res = await call("POST", "/api/rides/secure", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/acknowledged/i);
  });
});

describe("personal concierge", () => {
  // Austin, TX — inside a launch market (see service-area.ts), so these
  // tests exercise the partner-network/disclosure logic rather than
  // tripping the launch-market gate itself (covered separately below).
  const task = (over: Record<string, unknown> = {}) => ({
    category: "grab-something",
    note: "Grab a burger and fries from The Anchor Tavern",
    location: { lat: 30.2672, lng: -97.7431, label: "The Anchor Tavern" },
    spendCapCents: 2500,
    ...over,
  });

  it("is available on every paid tier, gated only on being free", async () => {
    // Jordan stays free (see beforeEach) — no paid plan at all.
    const free = await call("POST", "/api/concierge/quote", task(), jordan);
    expect(free.status).toBe(402);

    // Sam is premium-plus, not Family, and still gets past the gate — it's
    // no longer a Family-exclusive perk. Handoff rather than a plan error,
    // since no partner network is configured in tests.
    const plus = await call("POST", "/api/concierge/quote", task(), sam);
    expect(plus.status).toBe(503);

    // The cheapest paid tier gets it too.
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    const basic = await call("POST", "/api/concierge/quote", task(), jordan);
    expect(basic.status).toBe(503);
  });

  it("refuses when no partner network is configured, rather than pretending", async () => {
    const res = await call("POST", "/api/concierge/quote", task(), sam);
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/partner agreement/i);
  });

  it("validates the request before checking the provider", async () => {
    const badCategory = await call("POST", "/api/concierge/quote", task({ category: "hire-a-hitman" }), sam);
    expect(badCategory.status).toBe(400);

    const overCap = await call("POST", "/api/concierge/quote", task({ spendCapCents: 999999 }), sam);
    expect(overCap.status).toBe(400);
    expect(overCap.json.error).toMatch(/spend cap/i);

    const noNote = await call("POST", "/api/concierge/quote", task({ note: "" }), sam);
    expect(noNote.status).toBe(400);
  });

  it("will not book without the disclosures acknowledged", async () => {
    const res = await call("POST", "/api/concierge/tasks", task(), sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/acknowledged/i);
  });

  it("requires a session for every route", async () => {
    expect((await call("POST", "/api/concierge/quote", task())).status).toBe(401);
    expect((await call("POST", "/api/concierge/tasks", task())).status).toBe(401);
    expect((await call("GET", "/api/concierge/tasks")).status).toBe(401);
  });

  it("is only offered in the launch markets, checked before the partner network itself", async () => {
    // New York City — a real place, just not one of the three launch markets.
    const outside = task({ location: { lat: 40.7128, lng: -74.006, label: "Somewhere in NYC" } });
    const quote = await call("POST", "/api/concierge/quote", outside, sam);
    expect(quote.status).toBe(503);
    expect(quote.json.error).toMatch(/Puerto Rico.*Texas.*Los Angeles/i);

    const booking = await call("POST", "/api/concierge/tasks", { ...outside, acknowledgedDisclosures: true }, sam);
    expect(booking.status).toBe(503);
    expect(booking.json.error).toMatch(/Puerto Rico.*Texas.*Los Angeles/i);

    const roster = await call("GET", "/api/concierge/assistants?category=grab-something&lat=40.7128&lng=-74.006", undefined, sam);
    expect(roster.status).toBe(503);
  });

  it("reports concierge status and its disclosures alongside the rest of fulfilment", async () => {
    const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
    expect(res.concierge.mode).toBe("handoff");
    expect(res.concierge.requires).toMatch(/partner agreement/i);
    expect(res.conciergeDisclosures.join(" ")).toMatch(/not a Safehubby employee/i);
  });

  it("reports card issuing separately from dispatch — no credentials in tests, so it hands off", async () => {
    const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
    expect(res.cardIssuing.mode).toBe("handoff");
    expect(res.cardIssuing.name).toBe("Revolut Business");
    expect(res.cardIssuing.requires).toMatch(/Revolut Business account/i);
  });

  it("still lets a task book with no card issuer configured — issuing one is an add-on, not a precondition", async () => {
    // Dispatch itself is also unconfigured in tests, so this still 503s, but
    // on the dispatch provider's message, never on the card issuer's.
    const res = await call("POST", "/api/concierge/tasks", { ...task(), acknowledgedDisclosures: true }, sam);
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/Nearby Aide|partner agreement/i);
  });

  it("keeps one traveler's tasks out of another's list", async () => {
    expect((await call("GET", "/api/concierge/tasks", undefined, jordan)).json.tasks).toEqual([]);
  });

  it("browses the roster only with a valid category and location, and hands off with no partner configured", async () => {
    expect((await call("GET", "/api/concierge/assistants?category=grab-something&lat=40.7&lng=-74")).status).toBe(401);

    const noCategory = await call("GET", "/api/concierge/assistants?lat=40.7&lng=-74", undefined, sam);
    expect(noCategory.status).toBe(400);

    const badCategory = await call("GET", "/api/concierge/assistants?category=nonsense&lat=40.7&lng=-74", undefined, sam);
    expect(badCategory.status).toBe(400);

    const noLocation = await call("GET", "/api/concierge/assistants?category=grab-something", undefined, sam);
    expect(noLocation.status).toBe(400);

    // No CONCIERGE_API_BASE/KEY in tests, so this hands off rather than
    // returning an invented roster.
    const res = await call("GET", "/api/concierge/assistants?category=grab-something&lat=40.7&lng=-74", undefined, sam);
    expect(res.status).toBe(503);
  });

  it("gates the free-text place search the same as the rest of concierge", async () => {
    expect((await call("GET", "/api/concierge/places?query=corner+bar&lat=40.7&lng=-74")).status).toBe(401);

    // Jordan stays free — no paid plan at all.
    const free = await call("GET", "/api/concierge/places?query=corner+bar&lat=40.7&lng=-74", undefined, jordan);
    expect(free.status).toBe(402);

    const noQuery = await call("GET", "/api/concierge/places?lat=40.7&lng=-74", undefined, sam);
    expect(noQuery.status).toBe(400);

    // No GOOGLE_PLACES_API_KEY configured in tests, so this hands off rather
    // than returning invented results — same discipline as venues/stores.
    const res = await call("GET", "/api/concierge/places?query=corner+bar&lat=40.7&lng=-74", undefined, sam);
    expect(res.status).toBe(503);
  });
});

describe("concierge voice messages", () => {
  let taskId = "";

  beforeEach(() => {
    // Booking always hands off in tests (no partner configured), so a task
    // is seeded directly into the running server's own store — the same way
    // other fixtures in this file are (see samId's plan, set the same way).
    taskId = "ct_test1";
    store.update((db) => {
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500, serviceFeeCents: 900, assistantPayoutCents: 720, peopleCount: 1, status: "in-progress",
        provider: "Nearby Aide", providerTaskId: "provider-task-1", chargeId: "ch_x", holdId: "hold_x",
        createdAt: clock.toISOString(),
      });
    });
  });

  const clip = () => ({
    audioBase64: Buffer.from("a short test clip").toString("base64"),
    mimeType: "audio/webm",
    durationSeconds: 8,
  });

  it("lets the traveler send and read voice messages on their own task", async () => {
    const sent = await call("POST", `/api/concierge/tasks/${taskId}/voice-messages`, clip(), sam);
    expect(sent.status).toBe(200);
    expect(sent.json.id).toBeTruthy();

    const thread = await call("GET", `/api/concierge/tasks/${taskId}/voice-messages`, undefined, sam);
    expect(thread.json.messages).toHaveLength(1);
    expect(thread.json.messages[0].sender).toBe("traveler");
  });

  it("rejects an empty or oversized clip with the domain's own message", async () => {
    const empty = await call("POST", `/api/concierge/tasks/${taskId}/voice-messages`, { ...clip(), audioBase64: "" }, sam);
    expect(empty.status).toBe(400);
    expect(empty.json.error).toMatch(/no audio/i);

    const tooLong = await call("POST", `/api/concierge/tasks/${taskId}/voice-messages`, { ...clip(), durationSeconds: 999 }, sam);
    expect(tooLong.status).toBe(400);
    expect(tooLong.json.error).toMatch(/capped at/i);
  });

  it("will not let a stranger read or post into someone else's task thread", async () => {
    expect((await call("POST", `/api/concierge/tasks/${taskId}/voice-messages`, clip(), jordan)).status).toBe(404);
    expect((await call("GET", `/api/concierge/tasks/${taskId}/voice-messages`, undefined, jordan)).status).toBe(404);
  });

  it("requires a session", async () => {
    expect((await call("POST", `/api/concierge/tasks/${taskId}/voice-messages`, clip())).status).toBe(401);
    expect((await call("GET", `/api/concierge/tasks/${taskId}/voice-messages`)).status).toBe(401);
  });

  it("refuses the partner webhook with no shared secret configured", async () => {
    const res = await call(
      "POST", "/api/concierge/webhooks/voice-message",
      { providerTaskId: "provider-task-1", ...clip() },
      null, { "x-concierge-key": "whatever" },
    );
    expect(res.status).toBe(503);
  });
});

describe("concierge fee math and settlement", () => {
  let taskId = "";
  const spendCapCents = 2500;
  const serviceFeeCents = 900;
  const assistantPayoutCents = 720;
  const totalCents = spendCapCents + serviceFeeCents;

  beforeEach(() => {
    taskId = "ct_fee1";
    const hold = authorizeExactHold({ id: "hold_fee1", travelerId: samId, capCents: totalCents, now: clock });
    const charge = recordCharge({
      id: "ch_fee1", travelerId: samId, kind: "concierge", platform: "web",
      description: "Grab a burger", amountCents: totalCents, now: clock,
    });
    store.update((db) => {
      db.holds.push(hold);
      db.charges.push(charge);
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents, serviceFeeCents, assistantPayoutCents, peopleCount: 1, status: "in-progress",
        provider: "Nearby Aide", providerTaskId: "provider-fee1", chargeId: charge.id, holdId: hold.id,
        createdAt: clock.toISOString(),
      });
    });
  });

  it("settles the purchase plus the full service fee, never just one or the other", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/complete`, { billedCents: 1800 }, sam);
    expect(res.status).toBe(200);
    expect(res.json.task.billedCents).toBe(1800);

    const billing = (await call("GET", "/api/billing", undefined, sam)).json;
    const line = billing.charges.find((c: any) => c.id === "ch_fee1");
    expect(line.status).toBe("settled");
    expect(line.amountCents).toBe(1800 + serviceFeeCents);
  });

  it("charges the service fee in full even when nothing was purchased", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/complete`, { billedCents: 0 }, sam);
    expect(res.json.task.billedCents).toBe(0);
    const billing = (await call("GET", "/api/billing", undefined, sam)).json;
    expect(billing.charges.find((c: any) => c.id === "ch_fee1").amountCents).toBe(serviceFeeCents);
  });

  it("defaults to the full spend cap plus the service fee when nothing is reported", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/complete`, {}, sam);
    expect(res.json.task.billedCents).toBe(spendCapCents);
    const billing = (await call("GET", "/api/billing", undefined, sam)).json;
    expect(billing.charges.find((c: any) => c.id === "ch_fee1").amountCents).toBe(totalCents);
  });

  it("never settles above what was held, whatever billedCents claims", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/complete`, { billedCents: 999999 }, sam);
    expect(res.json.task.billedCents).toBe(spendCapCents); // capped, not the absurd reported figure
  });

  it("releases the whole hold and charges nothing on cancel", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/cancel`, {}, sam);
    expect(res.status).toBe(200);
    const billing = (await call("GET", "/api/billing", undefined, sam)).json;
    const line = billing.charges.find((c: any) => c.id === "ch_fee1");
    expect(line.status).toBe("failed");
  });

  it("refuses to settle or cancel a task twice", async () => {
    await call("POST", `/api/concierge/tasks/${taskId}/complete`, {}, sam);
    expect((await call("POST", `/api/concierge/tasks/${taskId}/complete`, {}, sam)).status).toBe(400);
    expect((await call("POST", `/api/concierge/tasks/${taskId}/cancel`, {}, sam)).status).toBe(400);
  });
});

describe("the service fee is shown to the customer in full", () => {
  let taskId = "";
  const spendCapCents = 2500;
  const serviceFeeCents = 900;
  const assistantPayoutCents = 720;
  const totalCents = spendCapCents + serviceFeeCents;

  beforeEach(() => {
    taskId = "ct_fee_visible1";
    const hold = authorizeExactHold({ id: "hold_fee_visible1", travelerId: samId, capCents: totalCents, now: clock });
    const charge = recordCharge({
      id: "ch_fee_visible1", travelerId: samId, kind: "concierge", platform: "web",
      description: "Grab a burger", amountCents: totalCents, now: clock,
    });
    store.update((db) => {
      db.holds.push(hold);
      db.charges.push(charge);
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents, serviceFeeCents, assistantPayoutCents, peopleCount: 1, quickTask: true,
        status: "in-progress", provider: "Nearby Aide", providerTaskId: "provider-fee-visible1",
        chargeId: charge.id, holdId: hold.id, createdAt: clock.toISOString(),
      });
    });
  });

  it("itemizes the fee in the customer's own task list, not just a total", async () => {
    const tasks = (await call("GET", "/api/concierge/tasks", undefined, sam)).json.tasks;
    const mine = tasks.find((t: any) => t.id === taskId);
    expect(mine.serviceFeeCents).toBe(serviceFeeCents);
    expect(mine.spendCapCents).toBe(spendCapCents);
    expect(mine.quickTask).toBe(true);
  });

  it("itemizes the fee in the complete and cancel responses too", async () => {
    const completed = await call("POST", `/api/concierge/tasks/${taskId}/complete`, {}, sam);
    expect(completed.json.task.serviceFeeCents).toBe(serviceFeeCents);
  });

  it("itemizes the fee in a cancel response", async () => {
    const canceled = await call("POST", `/api/concierge/tasks/${taskId}/cancel`, {}, sam);
    expect(canceled.json.task.serviceFeeCents).toBe(serviceFeeCents);
  });

  it("shows the assistant the same real pay through their own portal", async () => {
    const assistantId = "asst_fee_visible1";
    store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === taskId)!;
      t.assistantId = assistantId;
    });
    const { cookie } = await assistantLogin(assistantId);
    const portal = await call("GET", "/api/assistant/portal", undefined, null, cookie);
    const mine = portal.json.tasks.find((t: any) => t.id === taskId);
    expect(mine.serviceFeeCents).toBe(serviceFeeCents);
  });
});

describe("concierge selfies", () => {
  let taskId = "";

  beforeEach(() => {
    taskId = "ct_selfie1";
    store.update((db) => {
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500, serviceFeeCents: 900, assistantPayoutCents: 720, peopleCount: 1, status: "in-progress",
        provider: "Nearby Aide", providerTaskId: "provider-selfie1", chargeId: "ch_x", holdId: "hold_x",
        createdAt: clock.toISOString(),
      });
    });
  });

  const photo = () => ({ base64: Buffer.from("a small test photo").toString("base64"), mimeType: "image/jpeg" });

  it("lets the traveler attach their own selfie to the task", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/selfie`, photo(), sam);
    expect(res.status).toBe(200);
    const tasks = (await call("GET", "/api/concierge/tasks", undefined, sam)).json.tasks;
    expect(tasks.find((t: any) => t.id === taskId).identityPhotos.traveler.mimeType).toBe("image/jpeg");
  });

  it("rejects a non-image or oversized capture", async () => {
    const badType = await call("POST", `/api/concierge/tasks/${taskId}/selfie`, { ...photo(), mimeType: "audio/webm" }, sam);
    expect(badType.status).toBe(400);
    const empty = await call("POST", `/api/concierge/tasks/${taskId}/selfie`, { ...photo(), base64: "" }, sam);
    expect(empty.status).toBe(400);
  });

  it("will not let a stranger attach a selfie to someone else's task", async () => {
    expect((await call("POST", `/api/concierge/tasks/${taskId}/selfie`, photo(), jordan)).status).toBe(404);
  });
});

describe("concierge disputes — refund the customer, claw it back from the assistant", () => {
  const assistantId = "asst_dispute1";
  const spendCapCents = 2500;
  const serviceFeeCents = 900;
  const assistantPayoutCents = 720;
  let taskId = "";

  beforeEach(async () => {
    taskId = "ct_dispute1";
    const totalCents = spendCapCents + serviceFeeCents;
    const hold = authorizeExactHold({ id: "hold_dispute1", travelerId: samId, capCents: totalCents, now: clock });
    const charge = recordCharge({
      id: "ch_dispute1", travelerId: samId, kind: "concierge", platform: "web",
      description: "Grab a burger", amountCents: totalCents, now: clock,
    });
    store.update((db) => {
      db.holds.push(hold);
      db.charges.push(charge);
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents, serviceFeeCents, assistantPayoutCents, peopleCount: 1, status: "in-progress",
        provider: "Nearby Aide", providerTaskId: "provider-dispute1", assistantId,
        chargeId: charge.id, holdId: hold.id, createdAt: clock.toISOString(),
      });
    });
    // Mark it done for real, through the actual route, so the charge is
    // genuinely settled the way a dispute would find it in practice.
    await call("POST", `/api/concierge/tasks/${taskId}/complete`, {}, sam);
  });

  it("refuses to dispute a task that's still in progress", async () => {
    const inProgressId = "ct_dispute_ip";
    store.update((db) => {
      db.conciergeTasks.push({
        id: inProgressId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents, serviceFeeCents, assistantPayoutCents, peopleCount: 1, status: "in-progress",
        provider: "Nearby Aide", assistantId, chargeId: "ch_x", holdId: "hold_x", createdAt: clock.toISOString(),
      });
    });
    const res = await call("POST", `/api/concierge/tasks/${inProgressId}/dispute`, { reason: "Never showed up" }, sam);
    expect(res.status).toBe(400);
  });

  it("requires a real explanation", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/dispute`, { reason: "" }, sam);
    expect(res.status).toBe(400);
  });

  it("refunds the full settled amount and opens a clawback against the assigned assistant", async () => {
    const res = await call("POST", `/api/concierge/tasks/${taskId}/dispute`, { reason: "Never showed up and kept the money" }, sam);
    expect(res.status).toBe(200);
    expect(res.json.refundedCents).toBe(spendCapCents + serviceFeeCents);
    expect(res.json.clawedBack).toBe(true);
    expect(res.json.task.disputed).toBe(true);
    expect(res.json.task.refundedCents).toBe(spendCapCents + serviceFeeCents);

    const billing = (await call("GET", "/api/billing", undefined, sam)).json;
    expect(billing.charges.find((c: any) => c.id === "ch_dispute1").status).toBe("refunded");

    const [adjustment] = store.data.assistantAdjustments.filter((a) => a.assistantId === assistantId);
    expect(adjustment.totalCents).toBe(spendCapCents + serviceFeeCents);
    expect(adjustment.remainingCents).toBe(spendCapCents + serviceFeeCents);
    expect(adjustment.taskId).toBe(taskId);
  });

  it("cannot be disputed twice", async () => {
    await call("POST", `/api/concierge/tasks/${taskId}/dispute`, { reason: "Never showed up" }, sam);
    const again = await call("POST", `/api/concierge/tasks/${taskId}/dispute`, { reason: "Still not showing up" }, sam);
    expect(again.status).toBe(400);
  });

  it("still refunds a task with no assigned assistant, but invents no one to claw back from", async () => {
    const noAssistantId = "ct_dispute_noone";
    const totalCents = spendCapCents + serviceFeeCents;
    const hold = authorizeExactHold({ id: "hold_dispute_noone", travelerId: samId, capCents: totalCents, now: clock });
    const charge = recordCharge({
      id: "ch_dispute_noone", travelerId: samId, kind: "concierge", platform: "web",
      description: "Grab a burger", amountCents: totalCents, now: clock,
    });
    store.update((db) => {
      db.holds.push(hold);
      db.charges.push(settleCharge(charge, clock, totalCents));
      db.conciergeTasks.push({
        id: noAssistantId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 40.714, lng: -74.003 }, spendCapCents, serviceFeeCents, assistantPayoutCents, peopleCount: 1, status: "completed",
        provider: "Nearby Aide", chargeId: charge.id, holdId: hold.id, createdAt: clock.toISOString(),
        completedAt: clock.toISOString(),
      });
    });
    const res = await call("POST", `/api/concierge/tasks/${noAssistantId}/dispute`, { reason: "Never showed up" }, sam);
    expect(res.status).toBe(200);
    expect(res.json.clawedBack).toBe(false);
    expect(store.data.assistantAdjustments.filter((a) => a.taskId === noAssistantId)).toEqual([]);
  });

  it("will not let a stranger dispute someone else's task", async () => {
    expect((await call("POST", `/api/concierge/tasks/${taskId}/dispute`, { reason: "Never showed up" }, jordan)).status).toBe(404);
  });
});

describe("employee sign-in", () => {
  const assistantId = "asst-login1";

  it("provisions credentials, then only signs in with the right password", async () => {
    await assistantLogin(assistantId, "correct-horse-battery");
    const wrong = await call("POST", "/api/assistant/auth/login", { username: assistantId, password: "wrong" });
    expect(wrong.status).toBe(401);
    const right = await call("POST", "/api/assistant/auth/login", { username: assistantId, password: "correct-horse-battery" });
    expect(right.status).toBe(200);
    expect(right.json.assistantId).toBe(assistantId);
    expect(right.setCookie).toMatch(/sh_assistant_session=/);
  });

  it("404s an unknown username the same shape as a wrong password, not a different error", async () => {
    const res = await call("POST", "/api/assistant/auth/login", { username: "nobody-provisioned", password: "whatever12345" });
    expect(res.status).toBe(401);
  });

  it("reports mustChangePassword true for a freshly provisioned account", async () => {
    const { res } = await assistantLogin(assistantId);
    expect(res.json.mustChangePassword).toBe(true);
  });

  it("lets an assistant change their password, and the old one stops working", async () => {
    const { cookie } = await assistantLogin(assistantId, "temp-password-1");
    const changed = await call(
      "POST", "/api/assistant/auth/change-password",
      { currentPassword: "temp-password-1", newPassword: "a-new-real-password" }, null, cookie,
    );
    expect(changed.status).toBe(200);

    const portalAfter = await call("GET", "/api/assistant/portal", undefined, null, cookie);
    expect(portalAfter.json.mustChangePassword).toBe(false);

    const oldPasswordLogin = await call("POST", "/api/assistant/auth/login", { username: assistantId, password: "temp-password-1" });
    expect(oldPasswordLogin.status).toBe(401);
    const newPasswordLogin = await call("POST", "/api/assistant/auth/login", { username: assistantId, password: "a-new-real-password" });
    expect(newPasswordLogin.status).toBe(200);
  });

  it("rejects a password change with the wrong current password", async () => {
    const { cookie } = await assistantLogin(assistantId, "temp-password-2");
    const res = await call(
      "POST", "/api/assistant/auth/change-password",
      { currentPassword: "not-it", newPassword: "a-new-real-password" }, null, cookie,
    );
    expect(res.status).toBe(401);
  });

  it("logs out and the session stops working", async () => {
    const { cookie } = await assistantLogin(assistantId);
    expect((await call("GET", "/api/assistant/portal", undefined, null, cookie)).status).toBe(200);
    await call("POST", "/api/assistant/auth/logout", {}, null, cookie);
    expect((await call("GET", "/api/assistant/portal", undefined, null, cookie)).status).toBe(401);
  });
});

describe("assistant portal", () => {
  const assistantId = "asst-1";
  const otherAssistantId = "asst-2";
  let cookie: Record<string, string> = {};
  let otherCookie: Record<string, string> = {};
  let taskId = "";
  let otherTaskId = "";

  beforeEach(async () => {
    taskId = "ct_portal1";
    otherTaskId = "ct_portal2";
    store.update((db) => {
      db.conciergeTasks.push(
        {
          id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
          location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500, serviceFeeCents: 900, assistantPayoutCents: 720, peopleCount: 1, status: "in-progress",
          provider: "Nearby Aide", providerTaskId: "provider-portal1", assistantId,
          chargeId: "ch_x", holdId: "hold_x", createdAt: clock.toISOString(),
        },
        {
          id: otherTaskId, travelerId: jordanId, category: "run-errand", note: "Pick up a package",
          location: { lat: 40.71, lng: -74.0 }, spendCapCents: 1500, serviceFeeCents: 900, assistantPayoutCents: 720, peopleCount: 1, status: "in-progress",
          provider: "Nearby Aide", providerTaskId: "provider-portal2", assistantId: otherAssistantId,
          chargeId: "ch_y", holdId: "hold_y", createdAt: clock.toISOString(),
        },
      );
    });
    cookie = (await assistantLogin(assistantId)).cookie;
    otherCookie = (await assistantLogin(otherAssistantId)).cookie;
  });

  it("requires a valid employee session, not a token or a traveler session", async () => {
    expect((await call("GET", "/api/assistant/portal")).status).toBe(401);
    expect((await call("GET", "/api/assistant/portal", undefined, null, { Cookie: "sh_assistant_session=bogus" })).status).toBe(401);
    // A traveler's own session does not substitute for an assistant one.
    expect((await call("GET", "/api/assistant/portal", undefined, sam)).status).toBe(401);
  });

  it("shows only the tasks assigned to that assistant, with who they're for", async () => {
    const res = await call("GET", "/api/assistant/portal", undefined, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.assistantId).toBe(assistantId);
    expect(res.json.tasks).toHaveLength(1);
    expect(res.json.tasks[0].id).toBe(taskId);
    expect(res.json.tasks[0].requesterName).toBe("Sam");
  });

  it("keeps one assistant's tasks completely out of another's reach", async () => {
    expect((await call("GET", `/api/assistant/tasks/${otherTaskId}/voice-messages`, undefined, null, cookie)).status).toBe(404);
    expect((await call("POST", `/api/assistant/tasks/${otherTaskId}/complete`, {}, null, cookie)).status).toBe(404);
    expect((await call("POST", `/api/assistant/tasks/${otherTaskId}/decline`, {}, null, cookie)).status).toBe(404);
    // The other assistant's own session does reach it, though.
    expect((await call("GET", `/api/assistant/tasks/${otherTaskId}/voice-messages`, undefined, null, otherCookie)).status).toBe(200);
  });

  it("lets the assistant send a voice message and the traveler read it", async () => {
    const clip = { audioBase64: Buffer.from("hello").toString("base64"), mimeType: "audio/webm", durationSeconds: 5 };
    const sent = await call("POST", `/api/assistant/tasks/${taskId}/voice-messages`, clip, null, cookie);
    expect(sent.status).toBe(200);

    const thread = await call("GET", `/api/concierge/tasks/${taskId}/voice-messages`, undefined, sam);
    expect(thread.json.messages).toHaveLength(1);
    expect(thread.json.messages[0].sender).toBe("assistant");
  });

  it("lets the assistant attach their own selfie, visible on the traveler's side", async () => {
    const photo = { base64: Buffer.from("assistant selfie").toString("base64"), mimeType: "image/jpeg" };
    expect((await call("POST", `/api/assistant/tasks/${taskId}/selfie`, photo, null, cookie)).status).toBe(200);

    const tasks = (await call("GET", "/api/concierge/tasks", undefined, sam)).json.tasks;
    expect(tasks.find((t: any) => t.id === taskId).identityPhotos.assistant.mimeType).toBe("image/jpeg");
  });

  describe("the task card, for actually paying", () => {
    const cardedTaskId = "ct_carded";

    beforeEach(() => {
      store.update((db) => {
        db.conciergeTasks.push({
          id: cardedTaskId, travelerId: samId, category: "grab-something", note: "Grab groceries",
          location: { lat: 30.2672, lng: -97.7431 }, spendCapCents: 8000,
          serviceFeeCents: 1125, assistantPayoutCents: 900, peopleCount: 1,
          status: "in-progress", provider: "Nearby Aide", assistantId,
          chargeId: "ch_card", holdId: "hold_card", createdAt: clock.toISOString(),
          card: { id: "card_1", last4: "4242", network: "Visa", expMonth: 12, expYear: 2030 },
        });
      });
    });

    it("requires an employee session", async () => {
      expect((await call("POST", `/api/assistant/tasks/${cardedTaskId}/card`, {})).status).toBe(401);
    });

    it("will not reveal another assistant's task card", async () => {
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/card`, {}, null, otherCookie);
      expect(res.status).toBe(404);
    });

    it("refuses when no card was issued for the task", async () => {
      const res = await call("POST", `/api/assistant/tasks/${taskId}/card`, {}, null, cookie);
      expect(res.status).toBe(404);
      expect(res.json.error).toMatch(/no card was issued/i);
    });

    it("refuses once the task is finished, because the card is cancelled by then", async () => {
      await call("POST", `/api/assistant/tasks/${cardedTaskId}/complete`, { billedCents: 1000 }, null, cookie);
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/card`, {}, null, cookie);
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(/already been cancelled/i);
    });

    it("keeps the card locked until a purchase is documented with a photo", async () => {
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/card`, {}, null, cookie);
      expect(res.status).toBe(403);
      expect(res.json.error).toMatch(/photograph what you're buying/i);
    });

    it("says what is missing rather than inventing a link once a purchase is on the record", async () => {
      await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 4000, note: "Two chickens and rice",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/card`, {}, null, cookie);
      expect(res.status).toBe(503);
      expect(res.json.error).toMatch(/revolut/i);
    });

    it("records the purchase with its photo and reports what's left of the cap", async () => {
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 4000, note: "Two chickens and rice",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      expect(res.status).toBe(200);
      expect(res.json.request.status).toBe("open");
      expect(res.json.request.photo.mimeType).toBe("image/jpeg");
      // 8000 cap - 4000 requested
      expect(res.json.remainingSpendCents).toBe(4000);
    });

    it("refuses a purchase that would overrun the cap", async () => {
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 9000, note: "Too much",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(/left of the spend cap/i);
    });

    it("refuses a purchase with no photo — the photo is the point", async () => {
      const res = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 1000, note: "Trust me",
      }, null, cookie);
      expect(res.status).toBe(400);
    });

    it("lets the customer decline, which re-locks the card", async () => {
      const made = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 4000, note: "Two chickens and rice",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      const requestId = made.json.request.id;

      const declined = await call(
        "POST", `/api/concierge/tasks/${cardedTaskId}/spend-requests/${requestId}/decision`,
        { approve: false }, sam,
      );
      expect(declined.status).toBe(200);
      expect(declined.json.request.status).toBe("declined");
      expect(declined.json.cardUnlocked).toBe(false);

      const card = await call("POST", `/api/assistant/tasks/${cardedTaskId}/card`, {}, null, cookie);
      expect(card.status).toBe(403);
    });

    it("lets the customer approve, which leaves the card unlocked", async () => {
      const made = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 4000, note: "Two chickens and rice",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      const res = await call(
        "POST", `/api/concierge/tasks/${cardedTaskId}/spend-requests/${made.json.request.id}/decision`,
        { approve: true }, sam,
      );
      expect(res.json.request.status).toBe("approved");
      expect(res.json.cardUnlocked).toBe(true);
    });

    const requestSpend = async (amountCents = 4000) => {
      const made = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents, note: "Two chickens and rice",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      return made.json.request.id as string;
    };
    const adjustmentsFor = () => store.data.assistantAdjustments.filter((a) => a.taskId === cardedTaskId);

    it("docks the assistant for spend with no receipt and no explanation", async () => {
      await requestSpend(4000);
      await call("POST", `/api/assistant/tasks/${cardedTaskId}/complete`, { billedCents: 4000 }, null, cookie);

      const [adjustment] = adjustmentsFor();
      expect(adjustment.totalCents).toBe(4000);
      expect(adjustment.remainingCents).toBe(4000);
      expect(adjustment.reason).toMatch(/no receipt or explanation/i);
    });

    it("docks nothing once the receipt is sent", async () => {
      const requestId = await requestSpend(4000);
      const receipt = await call(
        "POST", `/api/assistant/tasks/${cardedTaskId}/spend-requests/${requestId}/receipt`,
        { base64: Buffer.from("the receipt").toString("base64"), mimeType: "image/jpeg" }, null, cookie,
      );
      expect(receipt.status).toBe(200);
      expect(receipt.json.unaccountedSpendCents).toBe(0);

      await call("POST", `/api/assistant/tasks/${cardedTaskId}/complete`, { billedCents: 4000 }, null, cookie);
      expect(adjustmentsFor()).toEqual([]);
    });

    it("docks nothing when the assistant reported a change instead — the caveat that protects them", async () => {
      const requestId = await requestSpend(4000);
      const change = await call(
        "POST", `/api/assistant/tasks/${cardedTaskId}/spend-requests/${requestId}/change`,
        { note: "They were out of the 2lb bag, so I didn't buy it" }, null, cookie,
      );
      expect(change.status).toBe(200);
      expect(change.json.unaccountedSpendCents).toBe(0);

      await call("POST", `/api/assistant/tasks/${cardedTaskId}/complete`, { billedCents: 0 }, null, cookie);
      expect(adjustmentsFor()).toEqual([]);
    });

    it("lets a change note correct the price without tripping the cap it was already counted against", async () => {
      const requestId = await requestSpend(8000); // the whole cap
      const res = await call(
        "POST", `/api/assistant/tasks/${cardedTaskId}/spend-requests/${requestId}/change`,
        { note: "Cheaper than expected", amountCents: 5000 }, null, cookie,
      );
      expect(res.status).toBe(200);
      expect(res.json.request.amountCents).toBe(5000);
    });

    it("requires a real explanation on a change note", async () => {
      const requestId = await requestSpend();
      const res = await call(
        "POST", `/api/assistant/tasks/${cardedTaskId}/spend-requests/${requestId}/change`,
        { note: "   " }, null, cookie,
      );
      expect(res.status).toBe(400);
    });

    it("will not let another assistant send a receipt against someone else's purchase", async () => {
      const requestId = await requestSpend();
      const res = await call(
        "POST", `/api/assistant/tasks/${cardedTaskId}/spend-requests/${requestId}/receipt`,
        { base64: Buffer.from("nope").toString("base64"), mimeType: "image/jpeg" }, null, otherCookie,
      );
      expect(res.status).toBe(404);
    });

    it("docks only the unanswered purchase when several are open", async () => {
      const receipted = await requestSpend(3000);
      await requestSpend(2000);
      await call(
        "POST", `/api/assistant/tasks/${cardedTaskId}/spend-requests/${receipted}/receipt`,
        { base64: Buffer.from("the receipt").toString("base64"), mimeType: "image/jpeg" }, null, cookie,
      );
      await call("POST", `/api/assistant/tasks/${cardedTaskId}/complete`, { billedCents: 5000 }, null, cookie);

      const [adjustment] = adjustmentsFor();
      expect(adjustment.totalCents).toBe(2000);
    });

    it("will not let a stranger decide someone else's purchase", async () => {
      const made = await call("POST", `/api/assistant/tasks/${cardedTaskId}/spend-request`, {
        amountCents: 4000, note: "Two chickens and rice",
        photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" },
      }, null, cookie);
      const res = await call(
        "POST", `/api/concierge/tasks/${cardedTaskId}/spend-requests/${made.json.request.id}/decision`,
        { approve: true }, jordan,
      );
      expect(res.status).toBe(404);
    });
  });

  it("lets the assistant mark the task done, settling the same way the traveler's own route would", async () => {
    const res = await call("POST", `/api/assistant/tasks/${taskId}/complete`, { billedCents: 1000 }, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.task.status).toBe("completed");
    expect(res.json.task.billedCents).toBe(1000);
  });

  it("lets the assistant attach a completion photo, visible on the traveler's side, separate from the identity selfies", async () => {
    const photo = { base64: Buffer.from("the delivered burger").toString("base64"), mimeType: "image/jpeg" };
    const res = await call("POST", `/api/assistant/tasks/${taskId}/completion-photo`, photo, null, cookie);
    expect(res.status).toBe(200);

    const tasks = (await call("GET", "/api/concierge/tasks", undefined, sam)).json.tasks;
    const mine = tasks.find((t: any) => t.id === taskId);
    expect(mine.completionPhoto.mimeType).toBe("image/jpeg");
    expect(mine.identityPhotos).toBeUndefined();
  });

  it("lets the assistant decline, distinct from a subscriber-initiated cancel", async () => {
    const res = await call("POST", `/api/assistant/tasks/${taskId}/decline`, {}, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.task.status).toBe("canceled");
    expect(res.json.task.declinedByAssistant).toBe(true);
  });

});

/** Shared by both describe blocks below. */
const withEncryptionKey = async (fn: () => Promise<void>) => {
  const prior = process.env.SAFEHUBBY_ENCRYPTION_KEY;
  process.env.SAFEHUBBY_ENCRYPTION_KEY = "a".repeat(64);
  try { await fn(); } finally {
    if (prior === undefined) delete process.env.SAFEHUBBY_ENCRYPTION_KEY;
    else process.env.SAFEHUBBY_ENCRYPTION_KEY = prior;
  }
};

const payoutDestination = () => ({ accountHolderName: "Jordan Rivera", routingNumber: "021000021", accountNumber: "123456789" });

describe("assistant payout destination", () => {
  const assistantId = "asst_pay1";

  it("requires an assistant session for every route", async () => {
    expect((await call("GET", "/api/assistant/payout-destination")).status).toBe(401);
    expect((await call("POST", "/api/assistant/payout-destination", payoutDestination())).status).toBe(401);
  });

  it("validates the bank details before anything else", async () => {
    const { cookie } = await assistantLogin(assistantId);
    const res = await call("POST", "/api/assistant/payout-destination", { ...payoutDestination(), routingNumber: "123" }, null, cookie);
    expect(res.status).toBe(400);
  });

  it("refuses to store one at all with no encryption key configured server-side", async () => {
    const { cookie } = await assistantLogin(assistantId);
    const prior = process.env.SAFEHUBBY_ENCRYPTION_KEY;
    delete process.env.SAFEHUBBY_ENCRYPTION_KEY;
    try {
      const res = await call("POST", "/api/assistant/payout-destination", payoutDestination(), null, cookie);
      expect(res.status).toBe(503);
    } finally {
      if (prior !== undefined) process.env.SAFEHUBBY_ENCRYPTION_KEY = prior;
    }
  });

  it("reports null before anything is on file", async () => {
    const { cookie } = await assistantLogin(assistantId);
    const res = await call("GET", "/api/assistant/payout-destination", undefined, null, cookie);
    expect(res.json.destination).toBeNull();
  });

  it("stores an encrypted destination and only ever returns the masked form back", async () => {
    await withEncryptionKey(async () => {
      const { cookie } = await assistantLogin(assistantId);
      const set = await call("POST", "/api/assistant/payout-destination", payoutDestination(), null, cookie);
      expect(set.status).toBe(200);
      expect(set.json).toEqual({ accountHolderName: "Jordan Rivera", accountNumberLast4: "6789" });
      expect(JSON.stringify(set.json)).not.toContain("123456789");

      const got = await call("GET", "/api/assistant/payout-destination", undefined, null, cookie);
      expect(got.json.destination).toEqual({ accountHolderName: "Jordan Rivera", accountNumberLast4: "6789" });
    });
  });
});

describe("biweekly payroll", () => {
  const assistantId = "asst_payroll1";
  let taskId = "";

  beforeEach(() => {
    taskId = "ct_payroll1";
    const period = previousPayoutPeriod(clock);
    const completedAt = new Date(period.start.getTime() + 3_600_000).toISOString();
    store.update((db) => {
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, category: "grab-something", note: "Grab a burger",
        location: { lat: 30.2672, lng: -97.7431 }, spendCapCents: 2500, serviceFeeCents: 1125, assistantPayoutCents: 900, peopleCount: 1,
        status: "completed", provider: "Nearby Aide", assistantId,
        chargeId: "ch_payroll1", holdId: "hold_payroll1", createdAt: completedAt, completedAt,
      });
    });
  });

  it("shows the earned-but-unpaid total in the assistant's own portal and payout history", async () => {
    const { cookie } = await assistantLogin(assistantId);
    const portal = await call("GET", "/api/assistant/portal", undefined, null, cookie);
    expect(portal.json.unpaidEarningsCents).toBe(900);
    const payouts = await call("GET", "/api/assistant/payouts", undefined, null, cookie);
    expect(payouts.json.payouts).toEqual([]);
    expect(payouts.json.unpaidEarningsCents).toBe(900);
  });

  it("fails a payout with a clear reason when there is no destination on file, and never tags the task", async () => {
    const result = await runPayroll(ctx);
    expect(result).toEqual({ paid: 0, failed: 1, totalCents: 0 });
    const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
    expect(payout.status).toBe("failed");
    expect(payout.failureReason).toMatch(/no payout destination/i);
    expect(payout.totalCents).toBe(900);
    expect(store.data.conciergeTasks.find((t) => t.id === taskId)?.payoutId).toBeUndefined();
  });

  it("fails with Revolut's own reason once a destination is on file but Revolut itself is not configured", async () => {
    await withEncryptionKey(async () => {
      const { cookie } = await assistantLogin(assistantId);
      await call("POST", "/api/assistant/payout-destination", payoutDestination(), null, cookie);
      const result = await runPayroll(ctx);
      expect(result.failed).toBe(1);
      const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
      expect(payout.failureReason).toMatch(/Revolut Business/i);
    });
  });

  it("never pays out a task still inside the current, open period", async () => {
    store.update((db) => {
      db.conciergeTasks.find((t) => t.id === taskId)!.completedAt = clock.toISOString();
    });
    const result = await runPayroll(ctx);
    expect(result).toEqual({ paid: 0, failed: 0, totalCents: 0 });
  });

  it("is reflected in the payout history once a run has attempted it", async () => {
    await runPayroll(ctx);
    const { cookie } = await assistantLogin(assistantId);
    const res = await call("GET", "/api/assistant/payouts", undefined, null, cookie);
    expect(res.json.payouts).toHaveLength(1);
    expect(res.json.payouts[0].status).toBe("failed");
    // Still unpaid — a failed attempt never resolves what's actually owed.
    expect(res.json.unpaidEarningsCents).toBe(900);
  });

  it("settles with no transfer, no destination needed, when a clawback exactly consumes the period's earnings", async () => {
    store.update((db) => {
      db.assistantAdjustments.push({
        id: "adj_exact", assistantId, taskId: "ct_other_dispute", reason: "Customer dispute",
        totalCents: 900, remainingCents: 900, createdAt: clock.toISOString(),
      });
    });
    const result = await runPayroll(ctx);
    expect(result).toEqual({ paid: 1, failed: 0, totalCents: 0 });
    const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
    expect(payout.status).toBe("paid");
    expect(payout.totalCents).toBe(0);
    expect(store.data.conciergeTasks.find((t) => t.id === taskId)?.payoutId).toBe(payout.id);
    expect(store.data.assistantAdjustments.find((a) => a.id === "adj_exact")?.remainingCents).toBe(0);
  });

  it("carries the rest of a clawback forward when it's bigger than one period's earnings", async () => {
    store.update((db) => {
      db.assistantAdjustments.push({
        id: "adj_big", assistantId, taskId: "ct_other_dispute", reason: "Customer dispute",
        totalCents: 1500, remainingCents: 1500, createdAt: clock.toISOString(),
      });
    });
    const result = await runPayroll(ctx);
    expect(result).toEqual({ paid: 1, failed: 0, totalCents: 0 });
    expect(store.data.assistantAdjustments.find((a) => a.id === "adj_big")?.remainingCents).toBe(600);
    // The task's earnings were legitimately spent against the debt, so it's
    // accounted for even though no money moved this period.
    expect(store.data.conciergeTasks.find((t) => t.id === taskId)?.payoutId).toBeTruthy();
  });

  it("nets a partial clawback against earnings before attempting a real transfer, and never reduces the debt on a failed attempt", async () => {
    store.update((db) => {
      db.assistantAdjustments.push({
        id: "adj_partial", assistantId, taskId: "ct_other_dispute", reason: "Customer dispute",
        totalCents: 300, remainingCents: 300, createdAt: clock.toISOString(),
      });
    });
    const result = await runPayroll(ctx);
    expect(result.failed).toBe(1); // no payout destination on file, so the net 600 can't actually be sent
    const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
    expect(payout.totalCents).toBe(600);
    // Nothing was actually resolved, so the debt is untouched and the task
    // stays eligible for a retry next run.
    expect(store.data.assistantAdjustments.find((a) => a.id === "adj_partial")?.remainingCents).toBe(300);
    expect(store.data.conciergeTasks.find((t) => t.id === taskId)?.payoutId).toBeUndefined();
  });

  it("requires the admin key to trigger a run manually", async () => {
    const prior = process.env.SAFEHUBBY_ADMIN_KEY;
    process.env.SAFEHUBBY_ADMIN_KEY = "test-admin-key";
    try {
      expect((await callAdmin("POST", "/api/admin/payroll/run", undefined, "wrong-key")).status).toBe(401);
      const res = await callAdmin("POST", "/api/admin/payroll/run");
      expect(res.status).toBe(200);
      expect(res.json.failed).toBe(1); // no payout destination on file for asst_payroll1
    } finally {
      if (prior === undefined) delete process.env.SAFEHUBBY_ADMIN_KEY;
      else process.env.SAFEHUBBY_ADMIN_KEY = prior;
    }
  });
});

describe("grocery fulfilment", () => {
  it("reports Instacart as the delivery path and Walmart separately", async () => {
    const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
    expect(res.delivery.name).toBe("Instacart");
    expect(res.delivery.requires).toMatch(/Instacart Developer Platform/i);
    expect(res.walmart.requires).toMatch(/affiliate/i);
  });

  it("falls back to a Walmart link when nothing is configured", async () => {
    const res = (await call("POST", "/api/supplies/order", {
      items: [{ id: "liquid-iv", name: "Liquid I.V.", qty: 1, priceCents: 999 }], to: "142 Rowan St",
    }, sam)).json;

    expect(res.mode).toBe("handoff");
    expect(res.handoff.provider).toBe("Walmart");
    expect(res.handoff.url).toContain("walmart.com");
    expect(res.handoff.url).toContain(encodeURIComponent("Liquid I.V.").slice(0, 6));
    // Untracked without a publisher id — and honest about it.
    expect(res.handoff.tracked).toBe(false);
    expect(res.note).toMatch(/Instacart/i);
  });

  it("still needs the plan that includes delivery", async () => {
    expect((await call("POST", "/api/supplies/order", { items: [] }, jordan)).status).toBe(402);
  });

  it("offers the Walmart fallback on the care package too", async () => {
    const nightId = (await startNight()).json.night.id;
    const state = (await call("GET", `/api/nights/${nightId}`, undefined, sam)).json.carePackage;
    expect(state.mode).toBe("prepared");
    expect(state.handoff.provider).toBe("Walmart");
  });

  it("lists nearby stores to prefer, closest first, from the mock when no Places key is set", async () => {
    const res = await call("GET", "/api/supplies/stores?lat=40.7135&lng=-74.0041", undefined, sam);
    expect(res.status).toBe(200);
    expect(res.json.length).toBeGreaterThan(0);
    expect(res.json[0]).toMatchObject({ name: expect.any(String), address: expect.any(String) });
  });

  it("accepts a preferred store on the order without changing the fallback path", async () => {
    const res = (await call("POST", "/api/supplies/order", {
      items: [{ id: "liquid-iv", name: "Liquid I.V.", qty: 1, priceCents: 999 }],
      to: "142 Rowan St",
      store: { name: "Corner Market", address: "210 Bridge St" },
    }, sam)).json;
    // No Instacart key in tests, so this still falls back to Walmart — the
    // store preference only reaches Instacart's own request, exercised
    // separately in the grocery adapter's own unit test.
    expect(res.mode).toBe("handoff");
    expect(res.handoff.provider).toBe("Walmart");
  });
});

describe("Uber Guest Trips wiring", () => {
  it("names the scope and the sandbox in what it needs", async () => {
    const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
    expect(res.rides.requires).toMatch(/guests\.trips/);
    expect(res.rides.requires).toMatch(/sandbox/i);
  });

  it("cancelling requires a session", async () => {
    expect((await call("POST", "/api/rides/trip_123/cancel", {})).status).toBe(401);
  });

  it("cancelling without Uber configured fails loudly rather than claiming success", async () => {
    const res = await call("POST", "/api/rides/trip_123/cancel", {}, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not configured/i);
  });
});

describe("payment method on file", () => {
  it("starts with none", async () => {
    const res = await call("GET", "/api/account/payment-method", undefined, sam);
    expect(res.json.method).toBeNull();
    expect(res.json.live).toBe(false);
  });

  it("attaches a card and reports it live", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.status).toBe(200);
    expect(res.json.method.last4).toBe("4242");

    const check = await call("GET", "/api/account/payment-method", undefined, sam);
    expect(check.json.live).toBe(true);
    expect(check.json.method.last4).toBe("4242");
  });

  it("rejects a malformed card", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      brand: "Visa", last4: "42", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.status).toBe(400);
  });

  it("rejects an already-expired card", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      brand: "Visa", last4: "4242", expMonth: 1, expYear: 2000,
    }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/expired/i);
  });

  it("removes the card on file", async () => {
    await call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, sam);
    await call("POST", "/api/account/payment-method/remove", {}, sam);
    const check = await call("GET", "/api/account/payment-method", undefined, sam);
    expect(check.json.method).toBeNull();
  });

  it("requires a session", async () => {
    expect((await call("GET", "/api/account/payment-method")).status).toBe(401);
    expect((await call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 1, expYear: 2030 })).status).toBe(401);
  });

  it("keeps cards per account", async () => {
    await call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, sam);
    const jordanCheck = await call("GET", "/api/account/payment-method", undefined, jordan);
    expect(jordanCheck.json.method).toBeNull();
  });

  it("defaults an unspecified method to the stripe processor", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("stripe");
    expect(res.json.method.wallet).toBeUndefined();
  });

  it("records a paypal method with no wallet", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "paypal", brand: "PayPal", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("paypal");
    expect(res.json.method.wallet).toBeUndefined();
  });

  it("records which wallet was used through Stripe", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "stripe", wallet: "apple-pay", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("stripe");
    expect(res.json.method.wallet).toBe("apple-pay");
  });

  it("rejects a wallet claimed against paypal instead of stripe", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "paypal", wallet: "google-pay", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.status).toBe(400);
  });
});

describe("payment processor status", () => {
  it("reports stripe and paypal as handoff without real credentials configured", async () => {
    const res = await call("GET", "/api/payment/processors", undefined, sam);
    expect(res.status).toBe(200);
    const ids = res.json.processors.map((p: { id: string }) => p.id);
    expect(ids).toEqual(["stripe", "paypal"]);
    for (const p of res.json.processors) expect(p.mode).toBe("handoff");
  });
});

describe("ride quote reflects the missing card, not a generic note, once the provider is the only other gap", () => {
  it("without Uber configured, the note is about the provider, never the card, even with no card on file", async () => {
    // In this test environment Uber is never configured, so providerReady is
    // always false — the card can never be the reported blocker here. This
    // guards the priority order in the route: provider status first.
    const res = await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    expect(res.json.mode).toBe("handoff");
    expect(res.json.needsPaymentMethod).toBe(false);
    expect(res.json.note).toMatch(/guests\.trips/i);
  });
});

describe("driver applications", () => {
  const applicant = (over: Record<string, unknown> = {}) => ({
    tier: "standard",
    fullName: "Jordan Rivera",
    email: "driver-jordan@example.com",
    phone: "404-555-0182",
    city: "Atlanta",
    state: "GA",
    licenseNumber: "GA123456",
    licenseExpiry: "2030-01-01T00:00:00Z",
    yearsDriving: 6,
    vehicle: { make: "Toyota", model: "Camry", year: 2021, licensePlate: "ABC1234" },
    backgroundCheckConsent: true,
    ...over,
  });

  it("is public — needs no account", async () => {
    const res = await call("POST", "/api/drivers/apply", applicant());
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("submitted");
    expect(res.json.id).toMatch(/^drv_/);
  });

  it("rejects an incomplete application, naming the field", async () => {
    const res = await call("POST", "/api/drivers/apply", applicant({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/valid email/i);
  });

  it("requires the extra fields for the secure-transport tier", async () => {
    const res = await call("POST", "/api/drivers/apply", applicant({ tier: "secure-transport" }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/protective-services or law-enforcement licence/i);
  });

  it("accepts a complete secure-transport application", async () => {
    const res = await call("POST", "/api/drivers/apply", applicant({
      tier: "secure-transport",
      protectiveLicenseNumber: "PSA-9981",
      protectiveLicenseState: "GA",
      yearsProtectiveExperience: 8,
      email: "driver-secure@example.com",
    }));
    expect(res.status).toBe(200);
  });

  it("is rate limited on its own budget", async () => {
    for (let i = 0; i < 10; i++) {
      await call("POST", "/api/drivers/apply", applicant({ email: `driver-rl-${i}@example.com` }));
    }
    const eleventh = await call("POST", "/api/drivers/apply", applicant({ email: "driver-rl-10@example.com" }));
    expect(eleventh.status).toBe(429);
  });

  it("lets an applicant withdraw with their id and email, and nobody else's", async () => {
    const submitted = await call("POST", "/api/drivers/apply", applicant({ email: "driver-withdraw@example.com" }));
    const wrong = await call("POST", `/api/drivers/applications/${submitted.json.id}/withdraw`, { email: "wrong@example.com" });
    expect(wrong.status).toBe(404);

    const right = await call("POST", `/api/drivers/applications/${submitted.json.id}/withdraw`, { email: "driver-withdraw@example.com" });
    expect(right.status).toBe(200);
    expect(right.json.status).toBe("withdrawn");
  });

  describe("admin review", () => {
    const withAdminKey = async (fn: () => Promise<void>) => {
      const prior = process.env.SAFEHUBBY_ADMIN_KEY;
      process.env.SAFEHUBBY_ADMIN_KEY = "test-admin-key";
      try { await fn(); } finally { process.env.SAFEHUBBY_ADMIN_KEY = prior; }
    };

    it("refuses the list without an admin key configured server-side", async () => {
      const prior = process.env.SAFEHUBBY_ADMIN_KEY;
      delete process.env.SAFEHUBBY_ADMIN_KEY;
      try {
        const res = await callAdmin("GET", "/api/drivers/applications");
        expect(res.status).toBe(503);
      } finally {
        process.env.SAFEHUBBY_ADMIN_KEY = prior;
      }
    });

    it("refuses a wrong key even when one is configured", async () => {
      await withAdminKey(async () => {
        const res = await callAdmin("GET", "/api/drivers/applications", undefined, "wrong-key");
        expect(res.status).toBe(401);
      });
    });

    it("lists applications and reviews one through submitted -> under-review -> approved", async () => {
      await withAdminKey(async () => {
        const submitted = await call("POST", "/api/drivers/apply", applicant({ email: "driver-review@example.com" }));
        const list = await callAdmin("GET", "/api/drivers/applications");
        expect(list.status).toBe(200);
        expect(list.json.some((a: any) => a.id === submitted.json.id)).toBe(true);

        const straight = await callAdmin("POST", `/api/drivers/applications/${submitted.json.id}/review`, { status: "approved" });
        expect(straight.status).toBe(400);
        expect(straight.json.error).toMatch(/under-review before approving/i);

        const toReview = await callAdmin("POST", `/api/drivers/applications/${submitted.json.id}/review`, {
          status: "under-review", note: "Checking references.",
        });
        expect(toReview.status).toBe(200);
        expect(toReview.json.status).toBe("under-review");

        const approved = await callAdmin("POST", `/api/drivers/applications/${submitted.json.id}/review`, { status: "approved" });
        expect(approved.status).toBe(200);
        expect(approved.json.status).toBe("approved");
      });
    });

    it("plain requests without the admin route cannot see the queue", async () => {
      await withAdminKey(async () => {
        expect((await call("GET", "/api/drivers/applications", undefined, sam)).status).toBe(401);
      });
    });
  });
});

describe("push to the guardian", () => {
  const register = (token: string, who: string) =>
    call("POST", "/api/push/devices", { token, platform: "ios" }, who);

  /** Sam is out; Jordan is watching with a claimed grant of the given scopes. */
  const watched = async (scopes: string[]) => {
    const nightId = (await startNight()).json.night.id;
    const grant = (await call("POST", "/api/grants", { scopes }, sam)).json;
    await call("POST", "/api/grants/claim", { inviteCode: grant.inviteCode }, jordan);
    await register("jordan-device-token", jordan);
    return { nightId, grantId: grant.id };
  };

  it("registers a device and reports whether delivery is configured", async () => {
    const res = await register("jordan-device-token", jordan);
    expect(res.status).toBe(200);
    expect(res.json.registered).toBe(true);
    // No provider configured in tests, and the API says so rather than implying delivery.
    expect(res.json.delivery.mode).not.toBe("automatic");

    const status = (await call("GET", "/api/push/status", undefined, jordan)).json;
    expect(status.devices).toBe(1);
  });

  it("rejects a token that is not one, and requires a session", async () => {
    expect((await call("POST", "/api/push/devices", { token: "x", platform: "ios" }, jordan)).status).toBe(400);
    expect((await call("POST", "/api/push/devices", { token: "a-real-looking-token", platform: "ios" })).status).toBe(401);
  });

  it("does not multiply devices when the client re-registers on every launch", async () => {
    await register("jordan-device-token", jordan);
    await register("jordan-device-token", jordan);
    expect((await call("GET", "/api/push/status", undefined, jordan)).json.devices).toBe(1);
  });

  it("unregisters, and cannot unregister someone else's device", async () => {
    await register("jordan-device-token", jordan);
    await call("POST", "/api/push/devices/remove", { token: "jordan-device-token" }, sam);
    expect((await call("GET", "/api/push/status", undefined, jordan)).json.devices).toBe(1);

    await call("POST", "/api/push/devices/remove", { token: "jordan-device-token" }, jordan);
    expect((await call("GET", "/api/push/status", undefined, jordan)).json.devices).toBe(0);
  });

  it("raising an SOS does not fail when no push provider is configured", async () => {
    const { nightId } = await watched(["location"]);
    const res = await call("POST", `/api/nights/${nightId}/sos`, {}, sam);
    expect(res.status).toBe(200);
    expect(res.json.alert.kind).toBe("sos");
  });

  it("reports push alongside the other fulfilment providers", async () => {
    const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
    expect(res.push.id).toBe("push");
    expect(res.push.requires).toMatch(/PUSH_API_URL/);
  });
});

describe("codes cannot be brute forced", () => {
  it("rate limits invite-code attempts", async () => {
    // A six-character code is the only thing between a stranger and a named
    // person's live location. Unlimited guesses made that a matter of time.
    const results: number[] = [];
    for (let i = 0; i < 14; i++) {
      results.push((await call("POST", "/api/grants/claim", { inviteCode: `ZZZ-${i}00` }, jordan)).status);
    }
    expect(results).toContain(429);
  });

  it("rate limits crew join attempts on the same budget", async () => {
    const results: number[] = [];
    for (let i = 0; i < 14; i++) {
      results.push((await call("POST", "/api/crews/join", { joinCode: `YYY-${i}00` }, jordan)).status);
    }
    expect(results).toContain(429);
  });
});

describe("night creation refuses input that would break the estimate", () => {
  it("rejects a body-water ratio that would brick every later read", async () => {
    const res = await call("POST", "/api/nights", { weightKg: 82, widmarkRatio: -1, drinkLimit: 4 }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/ratio/i);
  });

  it("rejects a weight that makes the estimate meaningless", async () => {
    expect((await call("POST", "/api/nights", { weightKg: 0.1 }, sam)).status).toBe(400);
    expect((await call("POST", "/api/nights", { weightKg: 5000 }, sam)).status).toBe(400);
    expect((await call("POST", "/api/nights", { weightKg: "banana" }, sam)).status).toBe(400);
  });

  it("rejects a drink limit that would alert on every single drink", async () => {
    expect((await call("POST", "/api/nights", { weightKg: 82, drinkLimit: 0 }, sam)).status).toBe(400);
  });
});
