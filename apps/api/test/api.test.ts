import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp, makeCtx } from "../src/server.ts";
import { Store } from "../src/store.ts";
import { SEED } from "../src/seed.ts";
import { hashPassword } from "../src/auth.ts";
import { runFlightSweep, runPayroll, type Ctx } from "../src/routes.ts";
import { taskCards } from "../src/adapters/cards.ts";
import {
  ELITE_LADDER, INCLUDED_GRABS_PER_MONTH, PLANS, authorizeExactHold, findPlan, assistantPayoutFor,
  eliteUnlockThresholdCents, previousPayoutPeriod, recordCharge, resetFlags, serviceFeeFor,
  OPEN_POSITIONS, errandFeeCents, errandPayoutCents, settleCharge, setFlag, type CardIssuingPort,
} from "@safehubby/core";
import {
  LAUNCH_DISCOUNT_RATE, LAUNCH_WINDOW_END, LAUNCH_WINDOW_START, POINT_RULES, SERVICE_LIVE_AT,
} from "@safehubby/core";

let server: ReturnType<typeof createApp>;
let base: string;
let dir: string;
let clock: Date;
let store: Store;
let ctx: Ctx;

/**
 * Subscribing to a paid plan needs the subscriber's agreement to the
 * automatic-renewal terms, which the plan screen collects and the server
 * refuses to start without — see auto-renewal.ts.
 *
 * The browser sends it on every real purchase, so the harness does the same
 * rather than making fifty call sites restate it. A test that wants the
 * refusal passes `renewalConsent: null` explicitly; the gate itself is
 * covered in core's auto-renewal.test.ts and in "the renewal-terms gate"
 * below.
 */
/** A current liability-insurance certificate, which every field applicant now
 *  has to attach (see credentials.ts). A real PDF header, so it validates. */
const TEST_INSURANCE = {
  kind: "liability-insurance", number: "POL-123456", issuer: "Triple-S Propiedad", expiresAt: "2099-01-01T00:00:00.000Z",
  document: { base64: Buffer.from("%PDF-1.4 test certificate").toString("base64"), mimeType: "application/pdf", fileName: "insurance.pdf" },
};
const withRenewalConsent = (path: string, body: unknown): unknown => {
  if (path !== "/api/subscription" || typeof body !== "object" || body === null) return body;
  const b = body as Record<string, unknown>;
  if ("renewalConsent" in b) return b.renewalConsent === null ? { ...b, renewalConsent: undefined } : b;
  const plan = PLANS.find((p) => p.id === b.planId);
  if (!plan) return b;
  const priceCents = b.cadence === "annual" ? plan.annualCents : plan.monthlyCents;
  if (priceCents === 0) return b;
  return { ...b, renewalConsent: { priceCents } };
};

/** Each "session" is just a bearer token, so tests can act as different users. */
const call = async (
  method: string, path: string, rawBody?: unknown, token?: string | null,
  extraHeaders?: Record<string, string>,
) => {
  const body = withRenewalConsent(path, rawBody);
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

/**
 * Moves the clock past the free trial, wherever it actually ends.
 *
 * Not simply "advance fifteen days" any more: a subscription started before
 * the service goes live has its trial deferred to go-live, so nobody is
 * charged for the pre-launch window (see `billingStartsAt` in promotions.ts).
 * These tests run on a clock that starts well before launch, so the deferral
 * applies to every one of them.
 */
const advancePastTrial = () => {
  const live = Date.parse(SERVICE_LIVE_AT);
  clock = new Date(Math.max(clock.getTime(), live) + 15 * 86_400_000);
};

/** Sets the admin secret for the tests in the enclosing describe, and puts
 *  back whatever was there before — requireAdmin reads it live from the
 *  environment, so leaking it would silently unlock other suites. */
const useAdminKey = (key = "test-admin-key") => {
  let prior: string | undefined;
  beforeEach(() => { prior = process.env.SAFEHUBBY_ADMIN_KEY; process.env.SAFEHUBBY_ADMIN_KEY = key; });
  afterEach(() => {
    if (prior === undefined) delete process.env.SAFEHUBBY_ADMIN_KEY;
    else process.env.SAFEHUBBY_ADMIN_KEY = prior;
  });
};

beforeEach(async () => {
  // These tests describe billing once payments are live; the `paid-plans`
  // gate that holds paid plans back before then has its own tests below.
  setFlag("paid-plans", true);
  // PayPal is paused in production until the EIN (`paypal-payments`); these
  // tests describe it switched on, and the pause has its own test below.
  setFlag("paypal-payments", true);
  dir = mkdtempSync(join(tmpdir(), "safehubby-"));
  // After go-live (SERVICE_LIVE_AT), because these tests are about a running
  // service: before it, billing defers and nothing is charged, which is the
  // pre-launch behaviour covered by its own tests rather than the premise of
  // every other one here.
  clock = new Date("2027-01-01T20:00:00Z");
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

/** Elite now stays locked behind a real revenue cushion, not just the
 *  `elite-tier` flag (see `eliteUnlockThresholdCents` in billing.ts) — tests
 *  that need to actually subscribe past the flag seed that trailing revenue
 *  directly, the same way they seed any other store state, rather than
 *  routing a settlement through every payment adapter just to get past a
 *  gate the flag alone used to be. */
const unlockElite = () => {
  store.update((db) => {
    db.charges.push({
      id: "chg_test_elite_unlock", travelerId: samId, kind: "subscription", rail: "card",
      description: "test revenue seed for the Elite unlock gate", amountCents: eliteUnlockThresholdCents(),
      currency: "USD", status: "settled", createdAt: clock.toISOString(), settledAt: clock.toISOString(),
    });
  });
};

const startNight = (token = sam) =>
  call("POST", "/api/nights", { weightKg: 82, drinkLimit: 4, homeAddressLabel: "142 Rowan St" }, token);

describe("API basics", () => {
  it("serves health and the catalog", async () => {
    expect((await call("GET", "/api/health")).json.ok).toBe(true);
    const catalog = (await call("GET", "/api/catalog")).json;
    expect(catalog.drinks.length).toBeGreaterThan(5);
    // Three paid everyday tiers plus the three Elite rungs. Free is not offered
    // while `free-tier` is off, so it is not in what a visitor can choose from.
    expect(catalog.plans.length).toBe(3 + ELITE_LADDER.length);
    expect(catalog.plans.map((p: { id: string }) => p.id)).not.toContain("free");
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

    // Safety basics stay free — ride booking and quick errands included; see
    // FREE_FEATURES in billing.ts.
    expect((await call("POST", `/api/nights/${jordanNight.id}/sos`, {}, jordan)).status).toBe(200);
    expect((await call("POST", `/api/nights/${jordanNight.id}/drinks`, { drinkId: "beer-light" }, jordan)).status).toBe(200);
    expect((await call("POST", "/api/grants", { scopes: ["location"] }, jordan)).status).toBe(200);
    expect((await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.71, lng: -74 }, dropoff: { lat: 40.72, lng: -74.01 },
    }, jordan)).status).toBe(200);
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
    // Sam is premium-plus by default (see beforeEach). `extended-menu` is
    // now on every paid plan — Premium, Premium Plus and Family are all the
    // everything tier, differing only by seats — so Free is the only plan
    // left that these gate tests can downgrade to.
    const downgradeToFree = () => call("POST", "/api/subscription", { planId: "free" }, sam);

    it("marks premium baskets locked below the top tiers, unlocked baskets for everyone", async () => {
      await downgradeToFree();
      const { baskets } = (await call("GET", "/api/care-package/baskets", undefined, sam)).json;
      const pizza = baskets.find((b: any) => b.id === "pizza-night");
      const hydration = baskets.find((b: any) => b.id === "hydration");
      expect(pizza.locked).toBe(true);
      expect(hydration.locked).toBe(false);
    });

    it("refuses to authorize a premium basket on a plan that can't run one at all", async () => {
      await downgradeToFree();
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
      await downgradeToFree();
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
    const jordanNight = (await call("POST", "/api/nights", { weightKg: 70 }, jordan)).json.night;
    expect((await call("GET", `/api/nights/${jordanNight.id}/recovery`, undefined, jordan)).status).toBe(402);

    const res = await call("POST", "/api/subscription", { planId: "premium-plus", cadence: "annual" }, jordan);
    expect(res.status).toBe(200);
    expect(res.json.plan.id).toBe("premium-plus");

    expect((await call("GET", `/api/nights/${jordanNight.id}/recovery`, undefined, jordan)).status).toBe(200);
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

  describe("downgrading between paid tiers", () => {
    it("refuses to move to a cheaper paid plan and points at the help desk", async () => {
      await call("POST", "/api/subscription", { planId: "family" }, jordan);
      const res = await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
      expect(res.status).toBe(409);
      expect(res.json.error).toMatch(/help desk/i);

      // Refused, not silently applied.
      const billing = (await call("GET", "/api/billing", undefined, jordan)).json;
      expect(billing.plan.id).toBe("family");
    });

    it("still allows an upgrade", async () => {
      await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
      const res = await call("POST", "/api/subscription", { planId: "premium-plus" }, jordan);
      expect(res.status).toBe(200);
      expect(res.json.plan.id).toBe("premium-plus");
    });

    it("still allows cancelling all the way down to Free through the plan route", async () => {
      await call("POST", "/api/subscription", { planId: "premium-plus" }, jordan);
      const res = await call("POST", "/api/subscription", { planId: "free" }, jordan);
      expect(res.status).toBe(200);
      expect(res.json.plan.id).toBe("free");
    });

    it("is not triggered by the very first subscription — there is nothing to downgrade from", async () => {
      const res = await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
      expect(res.status).toBe(200);
    });
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
    advancePastTrial();

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
    advancePastTrial();                                     // the trial ends and the first month begins
    advance(60 * 24 * 14);                                  // roughly halfway through that month

    const up = await call("POST", "/api/subscription", { planId: "premium-plus", platform: "web" }, jordan);
    const full = (await call("GET", "/api/catalog")).json.plans.find((p: any) => p.id === "premium-plus").monthlyCents;
    expect(up.json.charged.amountCents).toBeLessThan(full);
    expect(up.json.charged.amountCents).toBeGreaterThan(0);
  });

  it("settles a store purchase only against its receipt, and never a card line", async () => {
    await addCard(jordan);
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    advancePastTrial();                                     // past the trial, so changes are billable

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
    advancePastTrial();
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

  it("is on the free plan too — hand-off links, not automatic booking", async () => {
    // Ride booking itself is a free-tier safety basic (FREE_FEATURES in
    // billing.ts); what still needs a paid plan is Safehubby booking and
    // paying for the ride automatically — see "automatic-rides" gating.
    const res = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 1, lng: 1 }, dropoff: { lat: 2, lng: 2 },
    }, jordan)).json;
    expect(res.mode).toBe("handoff");
  });

  it("quotes the arranging fee on every plan, and no fare at all", async () => {
    // Safehubby charges to arrange the ride; a rideshare sets the fare. The
    // fee is on every plan including Free, and the fare is deliberately
    // absent — this app does not predict somebody else's surge pricing.
    const res = (await call("POST", "/api/rides/quote", {
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, jordan)).json;
    expect(res.standard.arrangeFeeCents).toBeGreaterThan(0);
    expect(res.standard.fareEstimateCents).toBeUndefined();
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
  it("is on every plan now, Free included — no plan gate left to fail on", async () => {
    // Jordan stays free (see beforeEach). Ownership's direction: Free can
    // book the same real, passed-through-priced ride a paid plan can. Past
    // the (now-nonexistent) plan gate, so the only thing left to refuse on
    // is the missing provider — a 503, not a 402.
    const res = await call("POST", "/api/rides/secure", {
      acknowledgedDisclosures: true,
      pickup: { lat: 40.714, lng: -74.003 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, jordan);
    expect(res.status).toBe(503);
  });

  it("is included on Premium Plus, with no upgrade to Family needed", async () => {
    // Sam is premium-plus (see beforeEach). Same 503 as Free, for the same
    // reason: no plan gate left, only the missing provider.
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
  // These exercise the Free plan's errands, which are paused by default (the
  // `free-errands` flag). The capability is kept and tested; it is switched on.
  beforeEach(() => setFlag("free-errands", true));
  afterEach(() => resetFlags());

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
    // Jordan stays free (see beforeEach) — no paid plan at all. Under
    // FREE_GRAB_SOMETHING_MAX_CAP_CENTS, so the cap check doesn't fire
    // before the feature gate this test is actually about.
    const free = await call("POST", "/api/concierge/quote", task({ spendCapCents: 1000 }), jordan);
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

  it("waives the gate on the free tier for a quick errand — grab-something or run-errand, booked as quickTask", async () => {
    // Jordan stays free. Under FREE_GRAB_SOMETHING_MAX_CAP_CENTS, so the cap
    // check doesn't fire first. Past the 402 this time — 503 because no
    // partner network is configured in tests, same handoff every paid tier
    // gets.
    const grab = await call("POST", "/api/concierge/quote", task({ spendCapCents: 1000, quickTask: true }), jordan);
    expect(grab.status).toBe(503);

    const errand = await call(
      "POST", "/api/concierge/quote", task({ category: "run-errand", quickTask: true }), jordan,
    );
    expect(errand.status).toBe(503);
  });

  it("still gates the free tier without the quick-task flag, or for open-ended categories", async () => {
    // Same category the quick-task test just waived the gate for — without
    // `quickTask: true` this is the full-price personal-assistant booking,
    // which stays behind `personal-concierge`. Under the free-tier cap so
    // that gate, not the cap check, is what this test exercises.
    const standardRate = await call("POST", "/api/concierge/quote", task({ spendCapCents: 1000 }), jordan);
    expect(standardRate.status).toBe(402);

    // Waiting with someone is open-ended time with a person, not a bounded
    // pickup — never eligible for the quick-task discount at all.
    const wait = await call(
      "POST", "/api/concierge/quote", task({ category: "wait-with-someone" }), jordan,
    );
    expect(wait.status).toBe(402);
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
    expect(res.cardIssuing.name).toBe("Lithic");
    expect(res.cardIssuing.requires).toMatch(/Lithic/i);
  });

  it("still lets a task book with no card issuer configured — issuing one is an add-on, not a precondition", async () => {
    // Dispatch itself is also unconfigured in tests, so this still 503s, but
    // on the dispatch provider's message, never on the card issuer's.
    const res = await call("POST", "/api/concierge/tasks", { ...task(), acknowledgedDisclosures: true }, sam);
    expect(res.status).toBe(503);
    expect(res.json.error).toMatch(/Nearby Aide|partner agreement/i);
  });

  describe("airport pickup — withdrawn", () => {
    it("can no longer be booked or quoted", async () => {
      const pickup = task({ category: "airport-pickup", hours: 2, flight: { flightNumber: "DL204", date: "2026-09-17" } });
      const booked = await call("POST", "/api/concierge/tasks", { ...pickup, acknowledgedDisclosures: true }, sam);
      expect(booked.status).toBe(400);
      expect(booked.json.error).toMatch(/unknown task type/i);
      expect((await call("POST", "/api/concierge/quote", pickup, sam)).status).toBe(400);
    });

    it("refuses a flight on a category that isn't airport pickup", async () => {
      const res = await call("POST", "/api/concierge/tasks", {
        ...task({ flight: { flightNumber: "DL204", date: "2026-09-17" } }), acknowledgedDisclosures: true,
      }, sam);
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(/does not track a flight/i);
    });

    it("reports flight tracking status and its disclosures alongside the rest of fulfilment", async () => {
      const res = (await call("GET", "/api/fulfillment/status", undefined, sam)).json;
      expect(res.flightTracking.mode).toBe("handoff");
      expect(res.flightTracking.name).toBe("AeroDataBox");
      expect(res.flightTrackingDisclosures.join(" ")).toMatch(/lag reality/i);
    });
  });

  describe("GET /api/flights/lookup", () => {
    it("requires a session", async () => {
      expect((await call("GET", "/api/flights/lookup?flightNumber=DL204&date=2026-09-17")).status).toBe(401);
    });

    it("requires both a flight number and a date", async () => {
      expect((await call("GET", "/api/flights/lookup?flightNumber=DL204", undefined, sam)).status).toBe(400);
      expect((await call("GET", "/api/flights/lookup?date=2026-09-17", undefined, sam)).status).toBe(400);
    });

    it("503s honestly with no provider key configured, rather than inventing a flight", async () => {
      const res = await call("GET", "/api/flights/lookup?flightNumber=DL204&date=2026-09-17", undefined, sam);
      expect(res.status).toBe(503);
      expect(res.json.error).toMatch(/RapidAPI|AeroDataBox/i);
    });

    it("requires the personal-concierge feature", async () => {
      expect((await call("GET", "/api/flights/lookup?flightNumber=DL204&date=2026-09-17", undefined, jordan)).status).toBe(402);
    });
  });

  describe("the flight sweep", () => {
    it("does nothing at all, quietly, with no provider configured", async () => {
      // It runs on a five-minute timer in main.ts, so the unconfigured case is
      // the one that executes most often in practice — it must not throw, and
      // must not spend a call finding that out.
      expect(await runFlightSweep(ctx)).toEqual({ checked: 0, changed: 0, pushed: 0 });
    });

    it("leaves a stored flight snapshot as the last thing known to be true", async () => {
      // A provider it cannot reach must never downgrade what the customer is
      // already being shown — the same rule booking follows when the lookup
      // misses outright.
      const snapshot = {
        flightNumber: "DL204", airlineName: "Delta Air Lines", airlineIata: "DL",
        status: "active" as const,
        departure: { iata: "JFK", scheduledTime: "2026-09-17T13:00:00Z" },
        arrival: { iata: "LAX", scheduledTime: "2026-09-17T16:20:00Z" },
      };
      store.update((db) => {
        db.conciergeTasks.push({
          id: "task_sweep_1", travelerId: "usr_x", category: "airport-pickup",
          note: "Meet me at baggage claim",
          location: { lat: 33.94, lng: -118.4 },
          spendCapCents: 2500, serviceFeeCents: 7000, assistantPayoutCents: 4900,
          peopleCount: 1, status: "in-progress", provider: "in-house",
          chargeId: "chg_x", holdId: "hold_x", createdAt: "2026-09-17T12:00:00Z",
          flightNumber: "DL204", flightDate: "2026-09-17", flight: snapshot,
        });
      });

      await runFlightSweep(ctx);

      expect(store.data.conciergeTasks.find((t) => t.id === "task_sweep_1")?.flight).toEqual(snapshot);
    });
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

  describe("AI drafting help — a faster first draft, never sent on its own", () => {
    it("reports handoff with nothing configured, so the portal knows to hide the button", async () => {
      const res = await call("GET", "/api/assistant/portal", undefined, null, cookie);
      expect(res.json.aiAssist.mode).toBe("handoff");
      expect(res.json.aiAssist.requires).toMatch(/AI_ASSIST_API_BASE/);
    });

    it("refuses to draft rather than fake one when no provider is configured", async () => {
      const res = await call(
        "POST", `/api/assistant/tasks/${taskId}/ai-draft`,
        { purpose: "explaining a change", instruction: "they were out of the burger, got a wrap instead" },
        null, cookie,
      );
      expect(res.status).toBe(503);
    });

    it("requires a valid employee session, not a token or a traveler session", async () => {
      const body = { instruction: "test" };
      expect((await call("POST", `/api/assistant/tasks/${taskId}/ai-draft`, body)).status).toBe(401);
      expect((await call("POST", `/api/assistant/tasks/${taskId}/ai-draft`, body, sam)).status).toBe(401);
    });

    it("keeps one assistant's tasks out of another's reach", async () => {
      const res = await call(
        "POST", `/api/assistant/tasks/${otherTaskId}/ai-draft`, { instruction: "test" }, null, cookie,
      );
      expect(res.status).toBe(404);
    });
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
      expect(res.json.error).toMatch(/lithic/i);
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

  it("fails with a clear pay-it-yourself reason once a destination is on file but no payout provider is connected", async () => {
    await withEncryptionKey(async () => {
      const { cookie } = await assistantLogin(assistantId);
      await call("POST", "/api/assistant/payout-destination", payoutDestination(), null, cookie);
      const result = await runPayroll(ctx);
      expect(result.failed).toBe(1);
      const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
      expect(payout.failureReason).toMatch(/pay this one yourself/i);
    });
  });

  describe("Puerto Rico withholding", () => {
    const worker = (market: string, extra: object = {}) => store.update((db) => {
      db.assistants.push({
        id: assistantId, applicationId: "app_x", name: "Pay Test", role: "personal-assistant", market: market as any,
        categories: ["grab-something"], maxConcurrentCustomers: 2, hiredAt: "2026-01-01T00:00:00.000Z", ...extra,
      } as any);
    });

    it("holds back 10% of a Puerto Rico worker's pay and records it", async () => {
      worker("puerto-rico");
      await runPayroll(ctx);
      const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
      expect(payout.withheldCents).toBe(90);
      expect(payout.totalCents).toBe(810);
    });

    it("holds nothing back with an exemption certificate on file", async () => {
      worker("puerto-rico", { withholdingExemptionCertificate: "SC-2888-1" });
      await runPayroll(ctx);
      const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
      expect(payout.withheldCents).toBe(0);
      expect(payout.totalCents).toBe(900);
    });

    it("holds nothing back in Texas", async () => {
      worker("texas");
      await runPayroll(ctx);
      const [payout] = store.data.payouts.filter((p) => p.assistantId === assistantId);
      expect(payout.withheldCents).toBe(0);
    });

    it("pays an errand runner the task was handed to, not only the assistant", async () => {
      store.update((db) => {
        const t = db.conciergeTasks.find((x) => x.id === taskId)!;
        t.assistantId = "asst_boss"; t.runnerId = "asst_runner_pay";
      });
      await runPayroll(ctx);
      expect(store.data.payouts.some((p) => p.assistantId === "asst_runner_pay")).toBe(true);
      expect(store.data.payouts.some((p) => p.assistantId === "asst_boss")).toBe(false);
    });
  });

  describe("signing in to the Management portal with the server's admin key", () => {
    useAdminKey("the-server-admin-key");

    it("lets the owner in with SAFEHUBBY_ADMIN_KEY, even with a stray space pasted on", async () => {
      const r = await call("POST", "/api/master/auth/login", { key: " the-server-admin-key\n" });
      expect(r.status).toBe(200);
      expect(r.json.role).toBe("owner");
      const token = /sh_master_session=([^;]+)/.exec(r.setCookie ?? "")?.[1] ?? "";
      const overview = await call("GET", "/api/master/overview", undefined, null, { Cookie: `sh_master_session=${token}` });
      expect(overview.status).toBe(200);
    });

    it("makes the owner account only once", async () => {
      await call("POST", "/api/master/auth/login", { key: "the-server-admin-key" });
      await call("POST", "/api/master/auth/login", { key: "the-server-admin-key" });
      expect(store.data.masterAccounts.filter((a) => a.role === "owner")).toHaveLength(1);
    });

    it("still refuses a wrong key", async () => {
      expect((await call("POST", "/api/master/auth/login", { key: "the-server-admin-kez" })).status).toBe(401);
    });
  });

  describe("recording an exemption certificate and the year's totals", () => {
    useAdminKey();
    const master = async (role: string, email: string) => {
      const created = await callAdmin("POST", "/api/admin/master-accounts", { name: "M", email, role });
      const signedIn = await call("POST", "/api/master/auth/login", { key: created.json.key });
      const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
      return { Cookie: `sh_master_session=${token}` };
    };

    it("lets only the owner record a certificate, and reports what was withheld", async () => {
      store.update((db) => {
        db.assistants.push({ id: assistantId, applicationId: "a", name: "Pay Test", role: "personal-assistant", market: "puerto-rico",
          categories: [], maxConcurrentCustomers: 1, hiredAt: "2026-01-01T00:00:00.000Z" } as any);
        db.payouts.push({ id: "po1", assistantId, periodStart: "x", periodEnd: "y", taskIds: [], totalCents: 810, withheldCents: 90,
          status: "paid", createdAt: clock.toISOString(), paidAt: clock.toISOString() });
      });
      const club = await master("club-assistant", "nocert@example.com");
      expect((await call("POST", `/api/master/assistants/${assistantId}/withholding-exemption`, { certificate: "C1" }, null, club)).status).toBe(401);
      const owner = await master("owner", "cert@example.com");
      const report = await call("GET", "/api/master/withholding", undefined, null, owner);
      expect(report.json.totalWithheldCents).toBe(90);
      expect(report.json.workers[0]).toMatchObject({ assistantId, withheldCents: 90, paidCents: 810 });
      const set = await call("POST", `/api/master/assistants/${assistantId}/withholding-exemption`, { certificate: "C1" }, null, owner);
      expect(set.json.certificate).toBe("C1");
      expect(store.data.assistants.find((a) => a.id === assistantId)?.withholdingExemptionCertificate).toBe("C1");
      const { cookie } = await assistantLogin(assistantId);
      const mine = await call("GET", "/api/assistant/payouts", undefined, null, cookie);
      expect(mine.json.withheldThisYearCents).toBe(90);
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

describe("paid plans before payments are live", () => {
  beforeEach(() => setFlag("paid-plans", false));
  afterEach(() => resetFlags());

  it("lifts the hold by itself once a payment processor is connected", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_unlock";
    try {
      const plans = (await call("GET", "/api/catalog")).json.plans;
      for (const p of plans.filter((x: any) => x.monthlyCents > 0 && x.lockedReason)) expect(p.lockedReason, p.id).not.toBe("payments");
    } finally {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  it("keeps every price on show but locks every paid plan, saying why", async () => {
    const plans = (await call("GET", "/api/catalog")).json.plans;
    const paid = plans.filter((p: any) => p.monthlyCents > 0);
    expect(paid.length).toBeGreaterThan(0);
    for (const p of paid) {
      expect(p.locked, p.id).toBe(true);
      expect(p.lockedReason, p.id).toBe("payments");
    }
  });

  it("refuses to start a paid plan on the web, so nobody is granted one unpaid", async () => {
    const res = await call("POST", "/api/subscription", { planId: "premium-plus" }, jordan);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/payments are live/i);
    expect((await call("GET", "/api/billing", undefined, jordan)).json.plan.id).not.toBe("premium-plus");
  });
});

describe("the Elite ladder", () => {
  afterEach(() => setFlag("elite-revenue-gate", false));

  it("serves every rung in the catalogue", async () => {
    const ids = (await call("GET", "/api/catalog")).json.plans.map((p: any) => p.id);
    for (const id of ELITE_LADDER) expect(ids).toContain(id);
    expect(ids).toContain("family");
  });

  it("opens with no revenue at all while the revenue hold is off", async () => {
    const res = await call("GET", "/api/catalog");
    for (const p of res.json.plans.filter((x: any) => ELITE_LADDER.includes(x.id))) expect(p.locked, p.id).toBe(false);
    expect(res.json.eliteUnlock.unlocked).toBe(true);
  });

  it("stays visible but locked — coming soon — before there is revenue to cover the allowance", async () => {
    setFlag("elite-revenue-gate", true);
    const res = await call("GET", "/api/catalog");
    const elitePlans = res.json.plans.filter((p: any) => ELITE_LADDER.includes(p.id));
    expect(elitePlans.length).toBe(ELITE_LADDER.length);
    for (const p of elitePlans) expect(p.locked, p.id).toBe(true);
    expect(res.json.eliteUnlock.unlocked).toBe(false);
    expect(res.json.eliteUnlock.percent).toBe(0);

    for (const id of ELITE_LADDER) {
      const sub = await call("POST", "/api/subscription", { planId: id }, sam);
      expect(sub.status, id).toBe(404);
      expect(sub.json.error, id).toMatch(/coming soon/i);
    }
  });

  it("unlocks — and becomes subscribable — once trailing revenue covers the cushion", async () => {
    unlockElite();
    const res = await call("GET", "/api/catalog");
    const elitePlans = res.json.plans.filter((p: any) => ELITE_LADDER.includes(p.id));
    for (const p of elitePlans) expect(p.locked, p.id).toBe(false);
    expect(res.json.eliteUnlock.unlocked).toBe(true);
    expect(res.json.eliteUnlock.percent).toBe(100);
  });

  it("can be subscribed to, on every rung", async () => {
    unlockElite();
    for (const id of ELITE_LADDER) {
      const res = await call("POST", "/api/subscription", { planId: id }, sam);
      expect(res.status, id).toBe(200);
      expect(res.json.subscription.planId, id).toBe(id);
    }
  });

  it("goes back behind the flag as a whole if it is ever pulled", async () => {
    // The switch still works in both directions, which is what makes pulling
    // the ladder a one-line decision rather than a revert.
    setFlag("elite-tier", false);
    try {
      const ids = (await call("GET", "/api/catalog")).json.plans.map((p: any) => p.id);
      for (const id of ELITE_LADDER) expect(ids).not.toContain(id);
      for (const id of ELITE_LADDER) {
        expect((await call("POST", "/api/subscription", { planId: id }, sam)).status, id).toBe(404);
      }
      expect(ids).toContain("family");
    } finally {
      resetFlags();
    }
  });

  it("appears and becomes subscribable once the flag is on", async () => {
    setFlag("elite-tier", true);
    unlockElite();
    try {
      const ids = (await call("GET", "/api/catalog")).json.plans.map((p: any) => p.id);
      expect(ids).toContain("elite");

      const res = await call("POST", "/api/subscription", { planId: "elite" }, sam);
      expect(res.status).toBe(200);
      expect(res.json.plan.id).toBe("elite");
    } finally {
      resetFlags();
    }
  });

  it("unlocks the luxury desk only on Elite", async () => {
    setFlag("elite-tier", true);
    unlockElite();
    try {
      // Sam is premium-plus by default — the everything-for-everyday tier,
      // which deliberately stops short of private aviation.
      const before = (await call("GET", "/api/billing", undefined, sam)).json;
      expect(before.plan.features).not.toContain("private-aviation");

      await call("POST", "/api/subscription", { planId: "elite" }, sam);
      const after = (await call("GET", "/api/billing", undefined, sam)).json;
      expect(after.plan.features).toContain("private-aviation");
      expect(after.plan.features).toContain("yacht-charter");
      expect(after.plan.features).toContain("lifestyle-manager");
    } finally {
      resetFlags();
    }
  });
});

describe("the Elite luxury desk", () => {
  const elite = async () => {
    setFlag("elite-tier", true);
    unlockElite();
    await call("POST", "/api/subscription", { planId: "elite" }, sam);
  };

  it("stays closed to anyone not actually on an Elite plan", async () => {
    // The ladder is released, so the gate is the subscription rather than the
    // flag. A member must not reach the desk by knowing the URL — and 402
    // rather than 404 because the tier is openly sold now, so "upgrade" is
    // the honest answer instead of a dead end.
    expect((await call("GET", "/api/elite/services", undefined, sam)).status).toBe(402);
    expect((await call("POST", "/api/elite/bookings", { serviceId: "jet-travel", brief: "x" }, sam)).status).toBe(402);
  });

  it("disappears again for everyone if the ladder is pulled", async () => {
    await elite();
    setFlag("elite-tier", false);
    try {
      expect((await call("GET", "/api/elite/services", undefined, sam)).status).toBe(404);
    } finally {
      resetFlags();
    }
  });

  it("offers the luxury catalogue once a member is on Elite", async () => {
    await elite();
    try {
      const res = await call("GET", "/api/elite/services", undefined, sam);
      expect(res.status).toBe(200);
      const ids = res.json.services.map((s: any) => s.id);
      expect(ids).toContain("jet-travel");
      expect(ids).toContain("concierge-doctor");
    } finally {
      resetFlags();
    }
  });

  it("refuses the desk to a paid plan that is not Elite", async () => {
    setFlag("elite-tier", true);
    try {
      // Sam stays premium-plus — the everything-for-everyday tier.
      const res = await call("POST", "/api/elite/bookings", {
        serviceId: "jet-travel", brief: "Austin to Aspen Friday, four of us",
      }, sam);
      expect(res.status).toBe(402);
      // And the catalogue is closed too, not merely empty. It used to answer
      // 200 with no services and the partner desk's configuration status
      // attached, to anybody signed in — invisible while the flag was off,
      // because the route 404'd for everyone before the plan was ever read.
      const services = await call("GET", "/api/elite/services", undefined, sam);
      expect(services.status).toBe(402);
      expect(services.json.services).toBeUndefined();
      expect(services.json.desk).toBeUndefined();
    } finally {
      resetFlags();
    }
  });

  it("books without charging anything or placing a hold", async () => {
    await elite();
    try {
      const before = store.data.charges.length;
      const beforeHolds = store.data.holds.length;

      const res = await call("POST", "/api/elite/bookings", {
        serviceId: "jet-travel", brief: "Austin to Aspen Friday, four of us",
      }, sam);
      expect(res.status).toBe(200);
      expect(res.json.booking.status).toBe("requested");
      expect(res.json.booking.supplierQuoteCents).toBeUndefined();

      // The whole point of the model: a $50,000 charter never touches
      // Safehubby's ledger or the member's card.
      expect(store.data.charges.length).toBe(before);
      expect(store.data.holds.length).toBe(beforeHolds);
    } finally {
      resetFlags();
    }
  });

  it("says plainly that no partner desk is connected, rather than quoting a price it made up", async () => {
    await elite();
    try {
      const services = await call("GET", "/api/elite/services", undefined, sam);
      expect(services.json.desk.mode).toBe("handoff");
      expect(services.json.desk.requires).toMatch(/amalfi/i);

      const res = await call("POST", "/api/elite/bookings", {
        serviceId: "jet-travel", brief: "Austin to Aspen Friday",
      }, sam);
      expect(res.json.booking.status).toBe("requested");
      expect(res.json.booking.supplierQuoteCents).toBeUndefined();
      expect(res.json.note).toMatch(/come back to you with a price/i);
    } finally {
      resetFlags();
    }
  });

  it("shows the Part 295 disclosures with a jet booking", async () => {
    await elite();
    try {
      const res = await call("POST", "/api/elite/bookings", {
        serviceId: "jet-travel", brief: "Austin to Aspen Friday",
      }, sam);
      const text = res.json.disclosures.join(" ");
      expect(text).toMatch(/air carrier operating your flight is named/i);
      expect(text).toMatch(/liability insurance/i);
    } finally {
      resetFlags();
    }
  });

  it("refuses a concierge doctor when the symptoms need an ambulance", async () => {
    await elite();
    try {
      const res = await call("POST", "/api/elite/bookings", {
        serviceId: "concierge-doctor", brief: "Come to the house",
        redFlags: ["unresponsive"],
      }, sam);
      expect(res.status).toBe(409);
      expect(res.json.error).toMatch(/emergency services, not a house call/i);
      expect(store.data.eliteBookings.filter((b) => b.serviceId === "concierge-doctor")).toEqual([]);
    } finally {
      resetFlags();
    }
  });

  it("allows a concierge doctor for something that is not an emergency", async () => {
    await elite();
    try {
      const res = await call("POST", "/api/elite/bookings", {
        serviceId: "concierge-doctor", brief: "Nasty cold, would rather not sit in a waiting room",
      }, sam);
      expect(res.status).toBe(200);
      expect(res.json.disclosures[0]).toMatch(/not emergency care/i);
    } finally {
      resetFlags();
    }
  });

  it("quotes the supplier's price and Safehubby's disclosed commission", async () => {
    await elite();
    const prior = process.env.SAFEHUBBY_ADMIN_KEY;
    process.env.SAFEHUBBY_ADMIN_KEY = "test-admin-key";
    try {
      const made = await call("POST", "/api/elite/bookings", {
        serviceId: "jet-travel", brief: "Austin to Aspen Friday",
      }, sam);
      const res = await callAdmin(
        "POST", `/api/admin/elite/bookings/${made.json.booking.id}/quote`,
        { supplierQuoteCents: 5_000_000, operatorName: "Example Air Charter LLC" },
      );
      expect(res.status).toBe(200);
      expect(res.json.booking.supplierQuoteCents).toBe(5_000_000);
      expect(res.json.booking.commissionCents).toBe(400_000); // 8%
      expect(res.json.booking.operatorName).toBe("Example Air Charter LLC");
    } finally {
      resetFlags();
      if (prior === undefined) delete process.env.SAFEHUBBY_ADMIN_KEY;
      else process.env.SAFEHUBBY_ADMIN_KEY = prior;
    }
  });

  it("will not quote a jet without naming the operating carrier", async () => {
    await elite();
    const prior = process.env.SAFEHUBBY_ADMIN_KEY;
    process.env.SAFEHUBBY_ADMIN_KEY = "test-admin-key";
    try {
      const made = await call("POST", "/api/elite/bookings", {
        serviceId: "jet-travel", brief: "Austin to Aspen Friday",
      }, sam);
      const res = await callAdmin(
        "POST", `/api/admin/elite/bookings/${made.json.booking.id}/quote`,
        { supplierQuoteCents: 5_000_000 },
      );
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(/part 295/i);
    } finally {
      resetFlags();
      if (prior === undefined) delete process.env.SAFEHUBBY_ADMIN_KEY;
      else process.env.SAFEHUBBY_ADMIN_KEY = prior;
    }
  });

  it("keeps one member's bookings out of another's", async () => {
    await elite();
    try {
      await call("POST", "/api/elite/bookings", { serviceId: "jet-travel", brief: "Mine" }, sam);
      await call("POST", "/api/subscription", { planId: "elite" }, jordan);
      const mine = await call("GET", "/api/elite/bookings", undefined, jordan);
      expect(mine.json.bookings).toEqual([]);
    } finally {
      resetFlags();
    }
  });
});

describe("a saved home address — the missing piece before anyone real can be sent there", () => {
  it("starts with none", async () => {
    expect((await call("GET", "/api/account/address", undefined, sam)).json.address).toBeNull();
  });

  it("saves and returns a real, coordinate-backed address", async () => {
    const saved = await call("POST", "/api/account/address", { lat: 40.75, lng: -73.98, label: "Home" }, sam);
    expect(saved.status).toBe(200);
    expect(saved.json.address).toEqual({ lat: 40.75, lng: -73.98, label: "Home" });
    expect((await call("GET", "/api/account/address", undefined, sam)).json.address.label).toBe("Home");
  });

  it("refuses a missing coordinate or a blank label", async () => {
    // NaN itself cannot cross JSON (it serializes as null), so a missing
    // field is what actually exercises the non-finite guard end to end.
    expect((await call("POST", "/api/account/address", { lng: -73.98, label: "Home" }, sam)).status).toBe(400);
    expect((await call("POST", "/api/account/address", { lat: 40.75, lng: -73.98, label: "" }, sam)).status).toBe(400);
  });

  it("keeps one member's address out of another's", async () => {
    await call("POST", "/api/account/address", { lat: 40.75, lng: -73.98, label: "Sam's place" }, sam);
    expect((await call("GET", "/api/account/address", undefined, jordan)).json.address).toBeNull();
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

  it("defaults an unspecified method to the PayPal processor", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("paypal");
  });

  it("records a paypal method with no brand", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "paypal", brand: "PayPal", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("paypal");
  });

  it("saves a Stripe card as Stripe, and drops the old wallet brands", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "stripe", payWith: "apple-pay", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("stripe");
    expect(res.json.method.payWith).toBeUndefined();
  });

  it("treats a request for ATH Móvil as PayPal", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "ath-movil", brand: "ATH Móvil", last4: "5309", expMonth: 12, expYear: 2030,
    }, sam);
    expect(res.json.method.processor).toBe("paypal");
  });
});

describe("saving a PayPal account with PayPal's own button", () => {
  /** PayPal, stood in for. Only its own host is intercepted. */
  const realFetch = globalThis.fetch;
  let calls: { url: string; body: unknown }[];
  let vaulted: { email: string | null };

  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = "client-id-123";
    process.env.PAYPAL_CLIENT_SECRET = "secret-456";
    calls = [];
    vaulted = { email: "jordan.lee@gmail.com" };
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (!url.startsWith("https://api-m.paypal.com")) return realFetch(input, init);
      const raw = init?.body ? String(init.body) : undefined;
      // The OAuth token request is form-encoded; everything else is JSON.
      const body = raw && !url.endsWith("/v1/oauth2/token") ? JSON.parse(raw) : raw;
      calls.push({ url, body });
      if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "at" });
      if (url.endsWith("/v3/vault/setup-tokens")) return Response.json({ id: "SETUP-1", status: "PAYER_ACTION_REQUIRED" });
      if (url.endsWith("/v3/vault/payment-tokens")) return Response.json({ id: "PAYTOKEN-1" });
      if (url.includes("/v3/vault/payment-tokens/PAYTOKEN-1")) {
        return Response.json({ payment_source: vaulted.email ? { paypal: { email_address: vaulted.email } } : {} });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  });

  it("needs a session", async () => {
    expect((await call("GET", "/api/payment/paypal/config")).status).toBe(401);
    expect((await call("POST", "/api/payment/paypal/setup-token", {})).status).toBe(401);
    expect((await call("POST", "/api/payment/paypal/payment-token", {})).status).toBe(401);
  });

  it("hands the browser the public client id and never the secret", async () => {
    const res = await call("GET", "/api/payment/paypal/config", undefined, sam);
    expect(res.json).toEqual({ ready: true, clientId: "client-id-123" });
    expect(JSON.stringify(res.json)).not.toContain("secret-456");
  });

  it("says plainly when PayPal is not set up", async () => {
    delete process.env.PAYPAL_CLIENT_SECRET;
    expect((await call("GET", "/api/payment/paypal/config", undefined, sam)).json.ready).toBe(false);
    expect((await call("POST", "/api/payment/paypal/setup-token", {}, sam)).status).toBe(503);
  });

  it("asks PayPal for a setup token to approve, charging nothing", async () => {
    const res = await call("POST", "/api/payment/paypal/setup-token", {}, sam);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.id).toBe("SETUP-1");
    const setup = calls.find((c) => c.url.endsWith("/v3/vault/setup-tokens"))!;
    expect(setup.body).toMatchObject({ payment_source: { paypal: { usage_type: "MERCHANT" } } });
    expect(calls.some((c) => c.url.includes("/v2/checkout/orders"))).toBe(false);
  });

  it("hides PayPal entirely while it is paused, even with its keys set", async () => {
    setFlag("paypal-payments", false);
    const processors = (await call("GET", "/api/payment/processors", undefined, sam)).json.processors;
    expect(processors.find((p: { id: string }) => p.id === "paypal").mode).toBe("handoff");
    expect((await call("GET", "/api/payment/paypal/config", undefined, sam)).json.ready).toBe(false);
    expect((await call("POST", "/api/payment/paypal/setup-token", {}, sam)).status).toBe(503);
  });

  it("no longer starts saving a card through PayPal — cards go through Stripe", async () => {
    const res = await call("POST", "/api/payment/paypal/setup-token", { kind: "card" }, sam);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const setup = calls.filter((c) => c.url.endsWith("/v3/vault/setup-tokens")).at(-1)!;
    expect(JSON.stringify(setup.body)).not.toMatch(/"card"/);
  });

  it("keeps a saved card by its brand, last four and expiry, read back from PayPal", async () => {
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "at" });
      if (url.includes("/v3/vault/payment-tokens/CARDTOKEN-1")) {
        return Response.json({ payment_source: { card: { brand: "MASTERCARD", last_digits: "5100", expiry: "2031-04" } } });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    const res = await call("POST", "/api/account/payment-method", { processor: "paypal", token: "CARDTOKEN-1" }, sam);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.method).toMatchObject({ processor: "paypal", brand: "MASTERCARD", last4: "5100", expMonth: 4, expYear: 2031 });
  });

  it("turns the approved setup token into a payment token", async () => {
    const res = await call("POST", "/api/payment/paypal/payment-token", { setupToken: "SETUP-1" }, sam);
    expect(res.json.token).toBe("PAYTOKEN-1");
    expect(calls.find((c) => c.url.endsWith("/v3/vault/payment-tokens"))!.body)
      .toEqual({ payment_source: { token: { id: "SETUP-1", type: "SETUP_TOKEN" } } });
    expect((await call("POST", "/api/payment/paypal/payment-token", {}, sam)).status).toBe(400);
  });

  it("keeps the account by its masked email, read back from PayPal rather than the browser's claim", async () => {
    const res = await call("POST", "/api/account/payment-method", {
      processor: "paypal", token: "PAYTOKEN-1",
      // What a tampered client might send — none of it is believed.
      brand: "Visa", last4: "0000", accountLabel: "boss@safehubby.com",
    }, sam);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.method).toMatchObject({ processor: "paypal", brand: "PayPal", last4: "", accountLabel: "j***@gmail.com" });
    expect(res.json.method.expMonth).toBeUndefined();
    const stored = await call("GET", "/api/account/payment-method", undefined, sam);
    expect(stored.json.live).toBe(true);
  });

  it("refuses a token PayPal does not recognise", async () => {
    const res = await call("POST", "/api/account/payment-method", { processor: "paypal", token: "NOPE" }, sam);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await call("GET", "/api/account/payment-method", undefined, sam)).json.method).toBeNull();
  });
});

describe("payment processor status", () => {
  it("reports PayPal and Stripe as handoff without real credentials configured", async () => {
    const res = await call("GET", "/api/payment/processors", undefined, sam);
    expect(res.status).toBe(200);
    const ids = res.json.processors.map((p: { id: string }) => p.id);
    expect(ids).toEqual(["paypal", "stripe"]);
    for (const p of res.json.processors) expect(p.mode).toBe("handoff");
  });

  it("serves no wallet brands and no card networks — only processors", async () => {
    const res = await call("GET", "/api/payment/processors", undefined, sam);
    expect(res.json.brands).toBeUndefined();
    expect(res.json.cardNetworks).toBeUndefined();
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
    backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
    ...over,
  });

  it("takes an optional résumé", async () => {
    const res = await call("POST", "/api/drivers/apply", applicant({
      email: "driver-with-resume@example.com",
      resume: { base64: "JVBERi0xLjQK", mimeType: "application/pdf", fileName: "jordan-resume.pdf" },
    }));
    expect(res.status).toBe(200);
    const stored = store.data.driverApplications.find((a) => a.email === "driver-with-resume@example.com");
    expect(stored?.resume?.fileName).toBe("jordan-resume.pdf");
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

describe("push to the assistant", () => {
  // These exercise the Free plan's errands, which are paused by default (the
  // `free-errands` flag). The capability is kept and tested; it is switched on.
  beforeEach(() => setFlag("free-errands", true));
  afterEach(() => resetFlags());

  useAdminKey();

  /** Hires an errand runner and signs them into the portal, the same shape
   *  as `bookedTask` in "texting the assistant on your task" below. */
  const hiredErrandRunner = async () => {
    const app = await call("POST", "/api/staff/apply", {
      role: "errand-runner", fullName: "Nia Osei", email: "nia@example.com",
      phone: "2125550148", city: "Houston", state: "TX", hoursPerWeek: 15,
      backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
      experience: "Two years of bike courier work across downtown.",
    });
    await callAdmin("POST", `/api/staff/applications/${app.json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${app.json.id}/review`, { status: "approved" });
    const hired = await callAdmin("POST", `/api/staff/applications/${app.json.id}/hire`, { market: "texas" });
    return hired.json.assistant.id as string;
  };

  it("registers a device from the portal session, separate from a traveler's", async () => {
    const assistantId = await hiredErrandRunner();
    const { cookie } = await assistantLogin(assistantId);

    const res = await call("POST", "/api/assistant/push/devices", { token: "assistant-device-token", platform: "ios" }, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.registered).toBe(true);

    const status = (await call("GET", "/api/assistant/push/status", undefined, null, cookie)).json;
    expect(status.devices).toBe(1);

    // A traveler's session cannot see or clear an assistant's device.
    expect((await call("GET", "/api/push/status", undefined, jordan)).json.devices).toBe(0);
  });

  it("rejects a token that is not one, and requires the assistant's own session", async () => {
    const assistantId = await hiredErrandRunner();
    const { cookie } = await assistantLogin(assistantId);
    expect((await call("POST", "/api/assistant/push/devices", { token: "x", platform: "ios" }, null, cookie)).status).toBe(400);
    expect((await call("POST", "/api/assistant/push/devices", { token: "a-real-looking-token", platform: "ios" })).status).toBe(401);
  });

  it("does not fail booking a free-tier quick errand when the assistant has no push provider configured", async () => {
    const assistantId = await hiredErrandRunner();
    const { cookie } = await assistantLogin(assistantId);
    await call("POST", "/api/assistant/push/devices", { token: "assistant-device-token", platform: "ios" }, null, cookie);

    // Jordan stays on the free plan — this is exactly the quick-task gate
    // waived above, now carried through to an actual booking. Under
    // FREE_GRAB_SOMETHING_MAX_CAP_CENTS, so the free-tier cap doesn't
    // refuse the booking this test is actually about.
    await call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, jordan);
    const booked = await call("POST", "/api/concierge/tasks", {
      category: "grab-something", note: "A burger and fries from The Anchor Tavern",
      location: { lat: 30.2672, lng: -97.7431, label: "The Anchor Tavern" },
      spendCapCents: 1000, quickTask: true, acknowledgedDisclosures: true,
      assistantId,
    }, jordan);
    expect(booked.status).toBe(200);
    expect(booked.json.task.assistantId).toBe(assistantId);

    // The assistant's own portal shows the task landed on them, whether or
    // not the push actually reached the (unconfigured, in tests) device.
    const portal = (await call("GET", "/api/assistant/portal", undefined, null, cookie)).json;
    expect(portal.tasks.some((t: { id: string }) => t.id === booked.json.task.id)).toBe(true);
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

describe("the launch party and the share loop", () => {
  it("reports the launch window on the public catalog, so a signed-out visitor can be told", async () => {
    const catalog = (await call("GET", "/api/catalog")).json;
    expect(catalog.launch).toMatchObject({
      discountRate: LAUNCH_DISCOUNT_RATE, startsAt: LAUNCH_WINDOW_START, endsAt: LAUNCH_WINDOW_END,
    });
    expect(typeof catalog.launch.open).toBe("boolean");
    expect(catalog.launch.note).toBeTruthy();
  });

  it("tells 'not yet' apart from 'over' — before the window, nothing has closed", async () => {
    clock = new Date("2026-09-12T00:00:00.000Z");
    const before = (await call("GET", "/api/catalog")).json.launch;
    expect(before).toMatchObject({ open: false, phase: "upcoming" });
    expect(before.note).not.toMatch(/closed/i);
    expect(before.note).toMatch(/opens/i);

    clock = new Date("2026-10-15T00:00:00.000Z");
    const during = (await call("GET", "/api/catalog")).json.launch;
    expect(during).toMatchObject({ open: true, phase: "open" });
    expect(during.note).toMatch(/3% off/);

    clock = new Date("2027-01-15T00:00:00.000Z");
    const after = (await call("GET", "/api/catalog")).json.launch;
    expect(after).toMatchObject({ open: false, phase: "closed" });
    expect(after.note).toMatch(/closed/i);
  });

  it("gives every new account a referral code, a link and a message", async () => {
    const share = (await call("GET", "/api/share", undefined, sam)).json;
    expect(share.code).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    expect(share.url).toContain(`ref=${share.code}`);
    expect(share.message).toContain(share.code);
    expect(share.message).toContain(share.url);
    expect(share.joined).toBe(0);
  });

  it("hands the same person the same code every time, so a shared link keeps working", async () => {
    const first = (await call("GET", "/api/share", undefined, sam)).json.code;
    const second = (await call("GET", "/api/share", undefined, sam)).json.code;
    expect(second).toBe(first);
  });

  it("mints a code for an account that predates referrals rather than returning nothing", async () => {
    store.update((db) => { delete db.travelers.find((t) => t.id === samId)!.referralCode; });
    const share = (await call("GET", "/api/share", undefined, sam)).json;
    expect(share.code).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    // And persisted, not regenerated per request.
    expect(store.data.travelers.find((t) => t.id === samId)!.referralCode).toBe(share.code);
  });

  it("needs a session — a referral code is not public information", async () => {
    expect((await call("GET", "/api/share")).status).toBe(401);
  });

  it("credits the referrer, in points and in the count", async () => {
    const code = (await call("GET", "/api/share", undefined, sam)).json.code;
    const before = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;

    const joined = await call("POST", "/api/auth/signup", {
      email: "riley@example.com", password: "a-long-enough-passphrase", displayName: "Riley",
      referralCode: code,
    });
    expect(joined.status).toBe(200);

    const share = (await call("GET", "/api/share", undefined, sam)).json;
    expect(share.joined).toBe(1);
    const after = (await call("GET", `/api/travelers/${samId}`, undefined, sam)).json.points.balance;
    expect(after - before).toBe(POINT_RULES.referredAFriend);
  });

  it("forgives a lowercase, unhyphenated code — it gets read aloud across a table", async () => {
    const code = (await call("GET", "/api/share", undefined, sam)).json.code;
    const sloppy = code.replace("-", "").toLowerCase();
    const joined = await call("POST", "/api/auth/signup", {
      email: "nico@example.com", password: "a-long-enough-passphrase", displayName: "Nico",
      referralCode: sloppy,
    });
    expect(joined.status).toBe(200);
    expect((await call("GET", "/api/share", undefined, sam)).json.joined).toBe(1);
  });

  it("still creates the account when the code is wrong, rather than losing a signup to a typo", async () => {
    const joined = await call("POST", "/api/auth/signup", {
      email: "ada@example.com", password: "a-long-enough-passphrase", displayName: "Ada",
      referralCode: "ZZZ-999",
    });
    expect(joined.status).toBe(200);
    expect(joined.json.traveler.id).toBeTruthy();
    expect(store.data.referrals).toHaveLength(0);
  });

  it("records nothing for a signup with no code at all", async () => {
    await call("POST", "/api/auth/signup", {
      email: "kit@example.com", password: "a-long-enough-passphrase", displayName: "Kit",
    });
    expect(store.data.referrals).toHaveLength(0);
  });
});

describe("hiring for the roles that do not drive", () => {
  useAdminKey();

  const application = (over: Record<string, unknown> = {}) => ({
    role: "personal-assistant",
    fullName: "Rosa Delgado",
    email: "rosa@example.com",
    phone: "2125550147",
    city: "Hoboken",
    state: "NJ",
    experience: "Six years as a home health aide, plus weekend shifts at a shelter.",
    hoursPerWeek: 20,
    backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
    ...over,
  });

  it("refuses a field application without the applicant's own insurance", async () => {
    const res = await call("POST", "/api/staff/apply", application({ credentials: [] }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/liability insurance/i);
  });

  it("publishes the open roles and what everyone hired gets, without a login", async () => {
    const res = await call("GET", "/api/staff/roles");
    expect(res.status).toBe(200);
    expect(res.json.roles.map((r: { id: string }) => r.id).sort())
      .toEqual([
        "errand-runner", "lawyer", "nurse", "personal-assistant", "physician",
        "secretary", "social-media-manager", "web-developer", "wingman-club-coordinator",
      ]);
    // Drivers apply through their own form, which asks about a vehicle.
    expect(res.json.roles.some((r: { id: string }) => r.id === "driver")).toBe(false);

    const ids = res.json.benefits.map((b: { id: string }) => b.id);
    // Insurance is left out until a policy exists — see `insurance-in-place`.
    expect(ids).not.toContain("liability-insurance");
    expect(ids).toContain("gas-stipend");
  });

  it("emails the applicant when it arrives, and again when it is decided", async () => {
    const realFetch = globalThis.fetch;
    const sent: { to: string; subject: string }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith("https://api.cloudflare.com/")) {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    Object.assign(process.env, { CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_EMAIL_TOKEN: "tok", EMAIL_FROM: "hello@safehubby.com", SAFEHUBBY_ADMIN_KEY: "k" });
    try {
      const res = await call("POST", "/api/staff/apply", application());
      await new Promise((r) => setTimeout(r, 20));
      expect(sent.at(-1)?.subject).toMatch(/received/i);
      const to = sent.at(-1)!.to;

      await call("POST", `/api/staff/applications/${res.json.id}/review`, { status: "rejected" }, null, { "x-admin-key": "k" });
      await new Promise((r) => setTimeout(r, 20));
      expect(sent.at(-1)).toMatchObject({ to, subject: expect.stringMatching(/About your application/) });
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_EMAIL_TOKEN", "EMAIL_FROM", "SAFEHUBBY_ADMIN_KEY"]) delete process.env[k];
    }
  });

  it("takes an application and gives back an id to follow it up with", async () => {
    const res = await call("POST", "/api/staff/apply", application());
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("submitted");
    expect(res.json.role).toBe("personal-assistant");
    expect(store.data.staffApplications).toHaveLength(1);
  });

  it("takes an optional résumé, without ever requiring one", async () => {
    const withResume = await call("POST", "/api/staff/apply", application({
      email: "with-resume@example.com",
      resume: { base64: "JVBERi0xLjQK", mimeType: "application/pdf", fileName: "rosa-resume.pdf" },
    }));
    expect(withResume.status).toBe(200);
    const stored = store.data.staffApplications.find((a) => a.email === "with-resume@example.com");
    expect(stored?.resume?.fileName).toBe("rosa-resume.pdf");
    // The full application response never echoes the file back to the
    // submitter's own browser — see the doc comment on POST /api/staff/apply.
    expect(withResume.json.resume).toBeUndefined();

    const withoutResume = await call("POST", "/api/staff/apply", application({ email: "no-resume@example.com" }));
    expect(withoutResume.status).toBe(200);
    expect(store.data.staffApplications.find((a) => a.email === "no-resume@example.com")?.resume).toBeUndefined();
  });

  it("refuses a résumé of a type that isn't a PDF or a photo", async () => {
    const res = await call("POST", "/api/staff/apply", application({
      email: "bad-resume@example.com",
      resume: { base64: "JVBERi0xLjQK", mimeType: "application/msword", fileName: "resume.doc" },
    }));
    expect(res.status).toBe(400);
  });

  it("accepts each role being hired, and sends drivers to their own form", async () => {
    for (const role of ["personal-assistant", "errand-runner", "secretary"]) {
      const res = await call("POST", "/api/staff/apply", application({ role, email: `${role}@example.com` }));
      expect(res.status).toBe(200);
    }
    const driver = await call("POST", "/api/staff/apply", application({ role: "driver" }));
    expect(driver.status).toBe(400);
    expect(driver.json.error).toMatch(/driver application/i);
  });

  it("names the field that is wrong rather than failing generically", async () => {
    const res = await call("POST", "/api/staff/apply", application({ experience: "n/a" }));
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/experience/i);
  });

  it("keeps the review queue behind the admin secret — it is real personal data", async () => {
    await call("POST", "/api/staff/apply", application());
    expect((await call("GET", "/api/staff/applications")).status).toBe(401);
    expect((await callAdmin("GET", "/api/staff/applications", undefined, "wrong-key")).status).toBe(401);
    const ok = await callAdmin("GET", "/api/staff/applications");
    expect(ok.status).toBe(200);
    expect(ok.json).toHaveLength(1);
  });

  it("will not approve anything sight-unseen, through the API as well as in core", async () => {
    const { json } = await call("POST", "/api/staff/apply", application());
    const straight = await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
    expect(straight.status).toBe(400);

    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    const approved = await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
    expect(approved.status).toBe(200);
    expect(approved.json.status).toBe("approved");
  });

  it("lets an applicant withdraw with the id and the email they applied with", async () => {
    const { json } = await call("POST", "/api/staff/apply", application());
    const wrong = await call("POST", `/api/staff/applications/${json.id}/withdraw`, { email: "someone@else.com" });
    expect(wrong.status).toBe(404);

    const ok = await call("POST", `/api/staff/applications/${json.id}/withdraw`, { email: "rosa@example.com" });
    expect(ok.json.status).toBe("withdrawn");
  });
});

describe("the hiring budget", () => {
  useAdminKey();

  it("reports the plan and what has actually been hired, behind the admin secret", async () => {
    expect((await call("GET", "/api/admin/budget")).status).toBe(401);
    const res = await callAdmin("GET", "/api/admin/budget");
    expect(res.status).toBe(200);
    expect(res.json.plan.budget.totalCents).toBeGreaterThan(0);
    // Nobody hired yet, so the actual roster costs nothing — the number moves
    // as applications are approved rather than being a fixed forecast.
    expect(res.json.actual.budget.totalCents).toBe(0);
    expect(res.json.plan.budget.months).toBe(2);
  });

  it("counts an approved hire into the actual budget", async () => {
    const { json } = await call("POST", "/api/staff/apply", {
      role: "secretary", fullName: "Dana Reyes", email: "dana@example.com", phone: "2125550188",
      city: "Hoboken", state: "NJ", hoursPerWeek: 20, backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
      experience: "Ran scheduling and intake for a two-clinic practice for four years.",
    });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });

    const res = await callAdmin("GET", "/api/admin/budget");
    expect(res.json.actual.headcount.secretary).toBe(1);
    expect(res.json.actual.budget.wagesCents).toBeGreaterThan(0);
  });
});

describe("the launch mailing list", () => {
  useAdminKey();

  it("takes an address with no account, since the point is you cannot use the app yet", async () => {
    const res = await call("POST", "/api/newsletter", { email: "Kit@Example.COM" });
    expect(res.status).toBe(200);
    expect(res.json.subscribed).toBe(true);
    expect(store.data.newsletterSubscribers[0]!.email).toBe("kit@example.com");
  });

  it("never claims a confirmation email was sent when nothing can send one", async () => {
    const res = await call("POST", "/api/newsletter", { email: "kit@example.com" });
    expect(res.json.delivered).toBe(false);
    expect(res.json.note).toMatch(/no confirmation email is sent/i);
    expect(res.json.note).not.toMatch(/check your inbox/i);
  });

  it("rejects something that is not an address", async () => {
    expect((await call("POST", "/api/newsletter", { email: "nope" })).status).toBe(400);
  });

  it("does not list the same person twice", async () => {
    await call("POST", "/api/newsletter", { email: "kit@example.com" });
    const again = await call("POST", "/api/newsletter", { email: "KIT@example.com" });
    expect(again.json.alreadyOnList).toBe(true);
    expect(store.data.newsletterSubscribers).toHaveLength(1);
  });

  it("unsubscribes on the token, and answers the same either way", async () => {
    await call("POST", "/api/newsletter", { email: "kit@example.com" });
    const token = store.data.newsletterSubscribers[0]!.token;

    const guessed = await call("POST", "/api/newsletter/unsubscribe", { email: "kit@example.com", token: "guess" });
    expect(guessed.json).toEqual({ unsubscribed: true });
    expect(store.data.newsletterSubscribers[0]!.unsubscribedAt).toBeUndefined();

    const real = await call("POST", "/api/newsletter/unsubscribe", { email: "kit@example.com", token });
    expect(real.json).toEqual({ unsubscribed: true });
    expect(store.data.newsletterSubscribers[0]!.unsubscribedAt).toBeTruthy();
  });

  it("gives an unguessable token, not a predictable one", async () => {
    await call("POST", "/api/newsletter", { email: "a@example.com" });
    await call("POST", "/api/newsletter", { email: "b@example.com" });
    const [one, two] = store.data.newsletterSubscribers;
    expect(one!.token).not.toBe(two!.token);
    expect(one!.token.length).toBeGreaterThanOrEqual(32);
  });

  it("exports the list for admins, with delivery status attached", async () => {
    await call("POST", "/api/newsletter", { email: "kit@example.com" });
    expect((await call("GET", "/api/admin/newsletter")).status).toBe(401);
    const res = await callAdmin("GET", "/api/admin/newsletter");
    expect(res.json.total).toBe(1);
    expect(res.json.active).toBe(1);
    expect(res.json.delivery.mode).toBe("handoff");
  });
});


describe("nothing is dispatched before the service is live", () => {
  /** The promise made at signup during the launch party has two halves:
   *  you are not charged, and you are not served, until launch day. */
  const beforeLaunch = new Date("2026-10-15T20:00:00Z");

  it("turns down a concierge booking with the date the service starts", async () => {
    clock = beforeLaunch;
    const res = await call("POST", "/api/concierge/tasks", {
      category: "grab-something", note: "Grab a burger from The Anchor Tavern",
      location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500,
      acknowledgedDisclosures: true,
    }, sam);

    expect(res.status).toBe(503);
    // The operator's sentence ("the partner is not configured") is not an
    // answer to the person asking — this is a date we chose.
    expect(res.json.error).toMatch(/starts on/i);
    expect(res.json.error).not.toMatch(/not configured/i);
  });

  it("says plainly that nothing is being charged either", async () => {
    clock = beforeLaunch;
    const res = await call("POST", "/api/concierge/tasks", {
      category: "grab-something", note: "Grab a burger from The Anchor Tavern",
      location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500,
      acknowledgedDisclosures: true,
    }, sam);
    expect(res.json.error).toMatch(/nothing is being charged/i);
  });

  it("leaves the safety basics working, which are free and live from day one", async () => {
    clock = beforeLaunch;
    // Starting a night, checking in and sharing location are the whole point
    // of the app and are never gated on a launch date.
    const night = await call("POST", "/api/nights", {
      weightKg: 82, drinkLimit: 4, homeAddressLabel: "142 Rowan St",
    }, sam);
    expect(night.status).toBe(200);

    const ping = await call("POST", `/api/nights/${night.json.night.id}/location`, {
      lat: 40.714, lng: -74.003, accuracyMeters: 20,
    }, sam);
    expect(ping.status).toBe(200);

    const sos = await call("POST", `/api/nights/${night.json.night.id}/sos`, {}, sam);
    expect(sos.status).toBe(200);
  });

  it("stops gating the moment the service is live", async () => {
    clock = new Date("2027-01-01T20:00:00Z");
    const res = await call("POST", "/api/concierge/tasks", {
      category: "grab-something", note: "Grab a burger from The Anchor Tavern",
      location: { lat: 40.714, lng: -74.003 }, spendCapCents: 2500,
      acknowledgedDisclosures: true,
    }, sam);
    // Still blocked, but now for the real reason: no fulfilment partner is
    // wired up in this environment. The launch date is no longer the answer.
    expect(res.json.error ?? "").not.toMatch(/starts on/i);
  });
});

describe("hiring somebody and actually sending them to a job", () => {
  // These exercise the Free plan's errands, which are paused by default (the
  // `free-errands` flag). The capability is kept and tested; it is switched on.
  beforeEach(() => setFlag("free-errands", true));
  afterEach(() => resetFlags());

  useAdminKey();

  /** Texas, so the market-indexed pay applies rather than the default. */
  const IN_TEXAS = { lat: 29.76, lng: -95.37 };

  const withCard = (token: string) =>
    call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, token);

  const apply = (over: Record<string, unknown> = {}) => call("POST", "/api/staff/apply", {
    role: "personal-assistant", fullName: "Rosa Delgado", email: "rosa@example.com",
    phone: "2125550147", city: "Houston", state: "TX", hoursPerWeek: 20,
    backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
    experience: "Six years as a home health aide, plus weekend shifts at a shelter.",
    ...over,
  });

  /** Application → approved → hired, which is the whole pipeline. */
  const hireOne = async (over: Record<string, unknown> = {}, market = "texas") => {
    const { json } = await apply(over);
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
    return callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market, maxConcurrentCustomers: 2 });
  };

  it("keeps an approved applicant in the queue until they are actually hired", async () => {
    // Hiring is reached from this list, so dropping somebody the moment they
    // are approved made the next step unreachable from the dashboard. They
    // stay until they are on the roster, then leave — there is nothing else
    // to do with them here.
    const { json } = await apply({ email: "stayvisible@example.com" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });

    const created = await callAdmin("POST", "/api/admin/master-accounts",
      { name: "Own Queue", email: "ownqueue@example.com", role: "owner" });
    const signedIn = await call("POST", "/api/master/auth/login", { key: created.json.key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    const cookie = { Cookie: `sh_master_session=${token}` };
    const before = await call("GET", "/api/master/overview", undefined, null, cookie);
    const idsBefore = before.json.operations.applications.staff.map((a: { id: string }) => a.id);
    expect(idsBefore).toContain(json.id);

    await call("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas" }, null, cookie);
    const after = await call("GET", "/api/master/overview", undefined, null, cookie);
    const idsAfter = after.json.operations.applications.staff.map((a: { id: string }) => a.id);
    expect(idsAfter).not.toContain(json.id);
  });

  it("lists a newly hired assistant on the team, available until given a job", async () => {
    const { json } = await apply({ email: "teamtrack@example.com" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
    const hired = await callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas", maxConcurrentCustomers: 2 });
    const created = await callAdmin("POST", "/api/admin/master-accounts",
      { name: "Team Watch", email: "teamwatch@example.com", role: "owner" });
    const signedIn = await call("POST", "/api/master/auth/login", { key: created.json.key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    const overview = await call("GET", "/api/master/overview", undefined, null, { Cookie: `sh_master_session=${token}` });
    const member = overview.json.operations.team.members.find((m: { id: string }) => m.id === hired.json.assistant?.id
      || m.id === hired.json.id);
    expect(member).toMatchObject({ status: "available", current: [] });
  });

  it("lets a secretary see the queue but never act on it", async () => {
    // The master dashboard hides the review and hire buttons without the
    // `write` scope, which a secretary does not hold. That is a convenience,
    // not the control — this proves the server refuses regardless, so the
    // gate does not live in the UI.
    const { json } = await apply();
    const created = await callAdmin("POST", "/api/admin/master-accounts",
      { name: "Sec Hire", email: "sechire@example.com", role: "secretary" });
    const signedIn = await call("POST", "/api/master/auth/login", { key: created.json.key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    const cookie = { Cookie: `sh_master_session=${token}` };

    // Reading the queue is operations, which they do have.
    expect((await call("GET", "/api/staff/applications", undefined, null, cookie)).status).toBe(200);

    // Acting on it is `write`, which they do not.
    expect((await call("POST", `/api/staff/applications/${json.id}/review`,
      { status: "under-review" }, null, cookie)).status).toBe(401);
    expect((await call("POST", `/api/staff/applications/${json.id}/hire`,
      { market: "texas" }, null, cookie)).status).toBe(401);
  });

  it("lets an owner run the whole pipeline from a master session, no shared key", async () => {
    // What the dashboard buttons actually do, through the same session the
    // browser holds — the admin key is not involved.
    const { json } = await apply({ email: "ownerpipe@example.com" });
    const created = await callAdmin("POST", "/api/admin/master-accounts",
      { name: "Own Hire", email: "ownhire@example.com", role: "owner" });
    const signedIn = await call("POST", "/api/master/auth/login", { key: created.json.key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    const cookie = { Cookie: `sh_master_session=${token}` };

    // Straight to approved is refused: somebody has to open it first.
    expect((await call("POST", `/api/staff/applications/${json.id}/review`,
      { status: "approved" }, null, cookie)).status).toBe(400);

    expect((await call("POST", `/api/staff/applications/${json.id}/review`,
      { status: "under-review" }, null, cookie)).status).toBe(200);
    expect((await call("POST", `/api/staff/applications/${json.id}/review`,
      { status: "approved" }, null, cookie)).status).toBe(200);

    const hired = await call("POST", `/api/staff/applications/${json.id}/hire`,
      { market: "puerto-rico" }, null, cookie);
    expect(hired.status).toBe(200);
    // Shown once, and the dashboard has to surface it immediately.
    expect(hired.json.credentials.tempPassword).toBeTruthy();
  });

  it("does not promise applicants insurance that has not been bought", async () => {
    const res = await call("GET", "/api/staff/roles");
    expect(res.status).toBe(200);
    expect(res.json.benefits.map((b: { id: string }) => b.id)).not.toContain("liability-insurance");
    expect(JSON.stringify(res.json.benefits).toLowerCase()).not.toContain("insurance");
  });

  it("tells applicants what each role pays and how many we are looking for", async () => {
    const res = await call("GET", "/api/staff/roles");
    expect(res.status).toBe(200);
    const roles = res.json.roles as { id: string; pay: string; openings: number; hiring: boolean }[];
    const assistant = roles.find((r) => r.id === "personal-assistant")!;
    expect(assistant.pay).toContain("$35.00");
    expect(assistant.openings).toBe(OPEN_POSITIONS["personal-assistant"]);
    expect(assistant.hiring).toBe(true);
    // Errand runners are on hold: the pay is still stated, and it says so.
    const runner = roles.find((r) => r.id === "errand-runner")!;
    expect(runner.pay).toContain(`$${(errandPayoutCents("in-building") / 100).toFixed(2)}`);
    expect(runner.openings).toBe(0);
    expect(runner.hiring).toBe(false);
    const physician = roles.find((r) => r.id === "physician")!;
    expect(physician.hiring).toBe(false);
    // Every role says what it pays; none is left blank.
    for (const r of roles) expect(String(r.pay).length, r.id).toBeGreaterThan(5);
    // Drivers apply through their own screen.
    expect(roles.some((r) => r.id === "driver")).toBe(false);
  });

  it("lists the roles we are hiring for first", async () => {
    // An applicant should see the open jobs before the closed ones.
    const roles = (await call("GET", "/api/staff/roles")).json.roles as { id: string; hiring: boolean }[];
    const firstClosed = roles.findIndex((r) => !r.hiring);
    expect(firstClosed).toBeGreaterThan(0);
    for (const r of roles.slice(firstClosed)) expect(r.hiring, r.id).toBe(false);
  });

  it("counts an opening down when somebody is hired, so a filled role stops advertising", async () => {
    const find = async () => (await call("GET", "/api/staff/roles")).json.roles
      .find((r: { id: string }) => r.id === "personal-assistant").openings as number;
    const before = await find();
    await hireOne({ role: "personal-assistant", fullName: "Rosa Open", email: "rosaopen@example.com" });
    expect(await find()).toBe(before - 1);
  });

  it("lets the owner open a résumé the dashboard says is attached", async () => {
    // The dashboard showed "résumé attached" with no way to read it.
    const pdf = Buffer.from("%PDF-1.4\nRosa Delgado resume\n").toString("base64");
    const { json } = await apply({ email: "withresume@example.com", resume: { base64: pdf, mimeType: "application/pdf", fileName: "rosa-delgado-resume.pdf" } });
    const res = await callAdmin("GET", `/api/applications/${json.id}/resume`);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json).toEqual({ fileName: "rosa-delgado-resume.pdf", mimeType: "application/pdf", base64: pdf });
  });

  it("keeps résumés from anyone who is not the owner", async () => {
    const pdf = Buffer.from("%PDF-1.4\n").toString("base64");
    const { json } = await apply({ email: "private@example.com", resume: { base64: pdf, mimeType: "application/pdf", fileName: "r.pdf" } });
    expect((await call("GET", `/api/applications/${json.id}/resume`)).status).toBe(401);
    expect((await call("GET", `/api/applications/${json.id}/resume`, undefined, sam)).status).toBe(401);
  });

  it("says plainly when there is nothing attached, or no such application", async () => {
    const { json } = await apply({ email: "noresume@example.com" });
    const none = await callAdmin("GET", `/api/applications/${json.id}/resume`);
    expect(none.status).toBe(404);
    expect(none.json.error).toMatch(/did not attach/i);
    expect((await callAdmin("GET", "/api/applications/staff_nope/resume")).status).toBe(404);
  });

  it("refuses an application whose résumé is not the file type it claims", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>").toString("base64");
    const res = await apply({ email: "fake@example.com", resume: { base64: html, mimeType: "application/pdf", fileName: "r.pdf" } });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not a real/i);
  });

  it("makes an approved applicant dispatchable, which is the point of hiring them", async () => {
    const hired = await hireOne();
    expect(hired.status).toBe(200);
    expect(hired.json.assistant.name).toBe("Rosa Delgado");
    expect(hired.json.assistant.market).toBe("texas");
    // And they can sign into the portal — hiring provisions the login.
    expect(hired.json.credentials.username).toBeTruthy();
    expect(hired.json.credentials.tempPassword).toBeTruthy();
  });

  it("shows them on the roster a customer actually sees, with no partner network configured", async () => {
    /**
     * The regression this whole feature exists for. Before it, the roster
     * route read only the partner network and 503'd without one — so
     * somebody hired through this app could never be offered to anybody.
     */
    await hireOne();
    const res = await call("GET", `/api/concierge/assistants?category=wait-with-someone&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, sam);
    expect(res.status).toBe(200);
    expect(res.json.inHouse).toBe(1);
    expect(res.json.assistants[0].name).toBe("Rosa Delgado");
    expect(res.json.available).toBe(1);
  });

  describe("ordering for somebody else", () => {
    const FOR_RAMON = {
      marketId: "puerto-rico", recipientName: "Ramón Torres", place: "Auxilio Mutuo Hospital", room: "412",
    };
    const order = (token: string, assistantId: string, over: Record<string, unknown> = {}) =>
      call("POST", "/api/concierge/tasks", {
        category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice and a phone charger.",
        // Her phone says Orlando. It must not matter.
        location: { lat: 28.54, lng: -81.38, label: "Orlando" },
        spendCapCents: 1_500, acknowledgedDisclosures: true, acknowledgedOnBehalf: true,
        assistantId, onBehalfOf: FOR_RAMON, ...over,
      }, sam);
    const runner = async () => (await hireOne({
      role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com`,
    }, "puerto-rico")).json.assistant.id as string;

    it("lets a customer far away order for somebody in the launch market", async () => {
      const kit = await runner();
      await withCard(sam);
      const res = await order(sam, kit);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      const task = res.json.task;
      expect(task.onBehalfOf).toMatchObject({ recipientName: "Ramón Torres", room: "412" });
      // Placed by the market named, not by the Orlando phone.
      expect(task.location.label).toContain("Auxilio Mutuo");
      expect(task.location.lat).toBeCloseTo(18.225, 2);
    });

    it("never trusts coordinates the client sent for somebody else's order", async () => {
      // A destination outside every launch market, typed as coordinates, must
      // not get a dispatch. The market named decides, and an unknown one fails.
      const kit = await runner();
      await withCard(sam);
      const res = await order(sam, kit, { onBehalfOf: { ...FOR_RAMON, marketId: "mars" } });
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(/area/i);
    });

    it("needs the extra agreement, and says why", async () => {
      const kit = await runner();
      await withCard(sam);
      const res = await order(sam, kit, { acknowledgedOnBehalf: undefined });
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(/somebody else/i);
    });

    it("needs a name and a place", async () => {
      const kit = await runner();
      await withCard(sam);
      expect((await order(sam, kit, { onBehalfOf: { ...FOR_RAMON, recipientName: "" } })).status).toBe(400);
      expect((await order(sam, kit, { onBehalfOf: { ...FOR_RAMON, place: "" } })).status).toBe(400);
    });

    it("shows the assistant where they are going and for whom", async () => {
      const kit = await runner();
      await withCard(sam);
      const booked = await order(sam, kit);
      expect(booked.status, JSON.stringify(booked.json)).toBe(200);
      const { cookie } = await assistantLogin(kit, "a-fine-assistant-password", false);
      const portal = await call("GET", "/api/assistant/portal", undefined, null, cookie);
      const task = portal.json.tasks.find((t: { id: string }) => t.id === booked.json.task.id);
      expect(task.onBehalfOf).toMatchObject({ recipientName: "Ramón Torres", place: "Auxilio Mutuo Hospital", room: "412" });
    });

    it("quotes an order for somebody else without a location of the customer's own", async () => {
      await runner();
      const q = await call("POST", "/api/concierge/quote", {
        category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice.",
        spendCapCents: 1_500, onBehalfOf: FOR_RAMON,
      }, sam);
      expect(q.status, JSON.stringify(q.json)).toBe(200);
    });
  });

  describe("prepaid balance, loaded with crypto", () => {
    /** Puts money on a customer's balance the way a settled crypto payment does. */
    const fund = (travelerId: string, amountCents: number) => store.update((db) => {
      db.balanceEntries.push({
        id: `be_${Math.random().toString(36).slice(2)}`, travelerId, kind: "load", amountCents,
        reference: `openreceive:cl_${Math.random().toString(36).slice(2)}`, source: "crypto", createdAt: clock.toISOString(),
      });
    });
    const availableOf = async (token: string) => (await call("GET", "/api/balance", undefined, token)).json.availableCents;

    it("starts at nothing", async () => {
      expect(await availableOf(sam)).toBe(0);
    });

    it("says when crypto is not set up, and only starts a load for a sound amount once it is", async () => {
      delete process.env.NWC_URI;
      expect((await call("GET", "/api/balance", undefined, sam)).json.crypto.ready).toBe(false);
      expect((await call("POST", "/api/balance/crypto/start", { amountCents: 2_000 }, sam)).status).toBe(503);
      expect((await call("POST", "/openreceive/checkouts", { reference: "x" }, sam)).status).toBe(503);

      process.env.NWC_URI = "nostr+walletconnect://test";
      try {
        for (const amountCents of [1, 100, 99_999_99, 1_000.5, "lots"]) {
          expect((await call("POST", "/api/balance/crypto/start", { amountCents }, sam)).status, String(amountCents)).toBe(400);
        }
        const ok = await call("POST", "/api/balance/crypto/start", { amountCents: 2_000 }, sam);
        expect(ok.status).toBe(200);
        expect(ok.json.reference).toMatch(/^cl_/);
        expect(store.data.cryptoLoads?.find((l) => l.reference === ok.json.reference)?.amountCents).toBe(2_000);
      } finally { delete process.env.NWC_URI; }
    });

    it("needs a session", async () => {
      for (const [m, path] of [["GET", "/api/balance"], ["POST", "/api/balance/crypto/start"]] as const) {
        expect((await call(m, path, m === "GET" ? undefined : {})).status).toBe(401);
      }
    });

    it("has no ATH Móvil routes and no automatic refund any more", async () => {
      for (const path of ["/api/balance/ath/start", "/api/balance/ath/complete", "/api/balance/refund"]) {
        expect((await call("POST", path, {}, sam)).status, path).toBe(404);
      }
      const res = await call("GET", "/api/balance", undefined, sam);
      expect(res.json.ath).toBeUndefined();
      expect(res.json.refundableCents).toBeUndefined();
    });

    it("keeps the whole balance under its ceiling", async () => {
      process.env.NWC_URI = "nostr+walletconnect://test";
      try {
        for (let i = 0; i < 2; i++) fund(samId, 50_000);
        expect((await call("POST", "/api/balance/crypto/start", { amountCents: 500 }, sam)).status).toBe(400);
      } finally { delete process.env.NWC_URI; }
    });

    describe("paying for an errand", () => {
      const book = async (assistantId: string, over: Record<string, unknown> = {}) =>
        call("POST", "/api/concierge/tasks", {
          category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice.",
          location: { lat: 18.4655, lng: -66.1057, label: "San Juan" },
          spendCapCents: 1_000, acknowledgedDisclosures: true, assistantId, ...over,
        }, sam);
      const kit = async () => (await hireOne({
        role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com`,
      }, "puerto-rico")).json.assistant.id as string;

      it("reserves from the balance with no card on file, and gives back what was not spent", async () => {
        const id = await kit();
        fund(samId, 5_000);
        const res = await book(id);
        expect(res.status, JSON.stringify(res.json)).toBe(200);
        const held = (await call("GET", "/api/balance", undefined, sam)).json;
        expect(held.heldCents).toBeGreaterThanOrEqual(1_000);
        expect(held.availableCents).toBe(5_000 - held.heldCents);

        const done = await call("POST", `/api/concierge/tasks/${res.json.task.id}/complete`, { billedCents: 400 }, sam);
        expect(done.status, JSON.stringify(done.json)).toBe(200);
        const after = (await call("GET", "/api/balance", undefined, sam)).json;
        expect(after.heldCents).toBe(0);
        expect(after.spentCents).toBeLessThan(held.heldCents);
        expect(after.availableCents).toBe(5_000 - after.spentCents);
      });

      it("returns everything when the task is canceled", async () => {
        const id = await kit();
        fund(samId, 5_000);
        const res = await book(id);
        const cancel = await call("POST", `/api/concierge/tasks/${res.json.task.id}/cancel`, {}, sam);
        expect(cancel.status, JSON.stringify(cancel.json)).toBe(200);
        expect(await availableOf(sam)).toBe(5_000);
      });

      it("refuses when the balance is short and there is no card, naming the shortfall", async () => {
        const id = await kit();
        fund(samId, 500);
        const res = await book(id, { spendCapCents: 3_000 });
        expect(res.status).toBe(402);
        expect(res.json.error).toMatch(/balance/i);
        expect(await availableOf(sam)).toBe(500);
      });

      it("cannot spend the same money on two tasks", async () => {
        const id = await kit();
        fund(samId, 1_500);
        const results = await Promise.all([book(id), book(id)]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 402]);
      });

      it("falls back to the card when the balance cannot cover it", async () => {
        const id = await kit();
        await withCard(sam);
        fund(samId, 500);
        const res = await book(id, { spendCapCents: 3_000 });
        expect(res.status, JSON.stringify(res.json)).toBe(200);
        expect(await availableOf(sam)).toBe(500);
      });
    });
  });

  describe("an assistant handing an errand to a runner", () => {
    const hire = async (role: string, name: string, market = "puerto-rico") =>
      (await hireOne({ role, fullName: name, email: `${name.toLowerCase().replace(/\W/g, "")}${Math.random()}@example.com` }, market)).json.assistant.id as string;

    /** A customer with a card, an assistant of theirs, a runner, and an errand booked with the assistant. */
    const setup = async (runnerMarket = "puerto-rico") => {
      const paId = await hire("personal-assistant", "Rosa Delgado");
      const runnerId = await hire("errand-runner", "Kit Moreno", runnerMarket);
      await withCard(sam);
      const res = await call("POST", "/api/concierge/tasks", {
        category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice.",
        location: { lat: 18.4655, lng: -66.1057, label: "San Juan" },
        spendCapCents: 1_000, acknowledgedDisclosures: true, assistantId: paId,
      }, sam);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      const pa = await assistantLogin(paId, "a-fine-assistant-password", false);
      const runner = await assistantLogin(runnerId, "a-fine-assistant-password", false);
      return { paId, runnerId, taskId: res.json.task.id as string, pa: pa.cookie, runner: runner.cookie };
    };
    const delegate = (taskId: string, runnerId: string | null, cookie: Record<string, string>) =>
      call("POST", `/api/assistant/tasks/${taskId}/delegate`, { runnerId }, null, cookie);

    it("lists the runners an assistant can hand to, and only to a personal assistant", async () => {
      const { runnerId, pa, runner } = await setup();
      const mine = await call("GET", "/api/assistant/runners", undefined, null, pa);
      expect(mine.json.runners.map((r: { id: string }) => r.id)).toEqual([runnerId]);
      expect((await call("GET", "/api/assistant/runners", undefined, null, runner)).json.runners).toEqual([]);
    });

    it("hands the errand over, and the runner sees it in their own portal as sent by the assistant", async () => {
      const { runnerId, taskId, pa, runner } = await setup();
      const res = await delegate(taskId, runnerId, pa);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      const portal = await call("GET", "/api/assistant/portal", undefined, null, runner);
      const seen = portal.json.tasks.find((t: { id: string }) => t.id === taskId);
      expect(seen).toMatchObject({ role: "runner", handedOverBy: expect.any(String) });
      const mineNow = await call("GET", "/api/assistant/portal", undefined, null, pa);
      expect(mineNow.json.tasks.find((t: { id: string }) => t.id === taskId)).toMatchObject({ role: "assistant", runnerName: "Kit Moreno" });
    });

    it("never shows the customer who the runner is", async () => {
      const { runnerId, taskId, pa } = await setup();
      await delegate(taskId, runnerId, pa);
      const detail = await call("GET", `/api/concierge/tasks/${taskId}`, undefined, sam);
      expect(JSON.stringify(detail.json)).not.toMatch(/runnerId|runnerName|Kit Moreno/);
      const list = await call("GET", "/api/concierge/tasks", undefined, sam);
      expect(JSON.stringify(list.json)).not.toMatch(/runnerId|runnerName|Kit Moreno/);
    });

    it("lets the runner do the legwork — and pays them, not the assistant", async () => {
      const { paId, runnerId, taskId, pa, runner } = await setup();
      await delegate(taskId, runnerId, pa);
      const done = await call("POST", `/api/assistant/tasks/${taskId}/complete`, { billedCents: 300 }, null, runner);
      expect(done.status, JSON.stringify(done.json)).toBe(200);
      const runnerEarned = await call("GET", "/api/assistant/portal", undefined, null, runner);
      const paEarned = await call("GET", "/api/assistant/portal", undefined, null, pa);
      expect(runnerEarned.json.unpaidEarningsCents).toBeGreaterThan(0);
      expect(paEarned.json.unpaidEarningsCents).toBe(0);
      expect(paId).not.toBe(runnerId);
    });

    it("refuses anyone but the assistant on the task, a runner from another market, and a task that is not an errand", async () => {
      const { paId, runnerId, taskId, runner } = await setup();
      expect((await delegate(taskId, runnerId, runner)).status).toBe(404);
      const other = await setup("texas");
      expect((await delegate(other.taskId, other.runnerId, other.pa)).status).toBe(400);
      expect(paId).toBeTruthy();
    });

    it("takes it back, if the assistant changes their mind", async () => {
      const { runnerId, taskId, pa, runner } = await setup();
      await delegate(taskId, runnerId, pa);
      expect((await delegate(taskId, null, pa)).status).toBe(200);
      const portal = await call("GET", "/api/assistant/portal", undefined, null, runner);
      expect(portal.json.tasks.find((t: { id: string }) => t.id === taskId)).toBeUndefined();
    });
  });

  describe("what a customer sees when choosing an assistant", () => {
    const hireWith = async (profile: Record<string, unknown>) => {
      const { json } = await apply({ email: `p${Math.random()}@example.com` });
      await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
      await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
      return callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas", maxConcurrentCustomers: 2, ...profile });
    };

    it("keeps their photo, experience, age and a line about them, and shows them on the roster", async () => {
      const photo = `data:image/jpeg;base64,${Buffer.from("a small photo").toString("base64")}`;
      const hired = await hireWith({ photoUrl: photo, yearsExperience: 6, age: 34, bio: "Six years as a home health aide." });
      expect(hired.status, JSON.stringify(hired.json)).toBe(200);
      const roster = await call("GET", `/api/concierge/assistants?category=wait-with-someone&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, sam);
      const found = roster.json.assistants.find((a: { id: string }) => a.id === hired.json.assistant.id);
      expect(found).toMatchObject({ photoUrl: photo, yearsExperience: 6, age: 34, bio: "Six years as a home health aide." });
    });

    it("refuses a photo that is not an image the app can safely show", async () => {
      for (const photoUrl of ["javascript:alert(1)", "data:image/svg+xml;base64,AAAA", "http://example.com/a.jpg"]) {
        expect((await hireWith({ photoUrl })).status, photoUrl).toBe(400);
      }
    });

    it("hires with no photo at all", async () => {
      expect((await hireWith({})).status).toBe(200);
    });
  });

  describe("email alerts", () => {
    it("needs a session, and refuses without agreement or with a bad address", async () => {
      expect((await call("GET", "/api/account/email-alerts")).status).toBe(401);
      expect((await call("POST", "/api/account/email-alerts", { email: "a@b.co" }, sam)).status).toBe(400);
      expect((await call("POST", "/api/account/email-alerts", { email: "nope", consent: true }, sam)).status).toBe(400);
      expect((await call("GET", "/api/account/email-alerts", undefined, sam)).json.enabled).toBe(false);
    });

    it("turns on, shows only a hint of the address, and turns off at once", async () => {
      const on = await call("POST", "/api/account/email-alerts", { email: "Maria@Example.com", consent: true }, sam);
      expect(on.json).toEqual({ enabled: true, emailHint: "m•••@example.com" });
      const read = await call("GET", "/api/account/email-alerts", undefined, sam);
      expect(read.json.enabled).toBe(true);
      expect(JSON.stringify(read.json)).not.toContain("maria@");
      expect((await call("POST", "/api/account/email-alerts", { consent: false }, sam)).json.enabled).toBe(false);
      expect((await call("GET", "/api/account/email-alerts", undefined, sam)).json.enabled).toBe(false);
    });

    it("keeps one customer's choice from showing on another's account", async () => {
      await call("POST", "/api/account/email-alerts", { email: "sam@example.com", consent: true }, sam);
      expect((await call("GET", "/api/account/email-alerts", undefined, jordan)).json.enabled).toBe(false);
    });
  });

  describe("real charging through PayPal", () => {
    const realFetch = globalThis.fetch;
    let paypal: { path: string; body: any }[];
    const flush = () => new Promise((r) => setTimeout(r, 30));
    beforeEach(() => {
      Object.assign(process.env, { PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com" });
      paypal = [];
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = String(input);
        if (!url.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(input, init);
        const path = new URL(url).pathname;
        if (path === "/v1/oauth2/token") return Response.json({ access_token: "tok" });
        paypal.push({ path, body: JSON.parse(String(init?.body ?? "{}")) });
        if (path === "/v2/checkout/orders") {
          return Response.json({ status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: "AUTH_T", status: "CREATED" }] } }] });
        }
        return Response.json({ status: "COMPLETED" });
      }) as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = realFetch;
      for (const k of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_API_BASE"]) delete process.env[k];
    });

    const bookWithPaypal = async () => {
      const hired = await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com` }, "puerto-rico");
      const assistantId = hired.json.assistant.id as string;
      store.update((db) => {
        db.paymentMethods[samId] = {
          id: "pm_sam", processor: "paypal", processorToken: "VAULT_SAM", brand: "PayPal", last4: "",
          accountLabel: "s***@example.com", addedAt: clock.toISOString(),
        };
      });
      const res = await call("POST", "/api/concierge/tasks", {
        category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice.",
        location: { lat: 18.4655, lng: -66.1057, label: "San Juan" },
        spendCapCents: 1_000, acknowledgedDisclosures: true, assistantId,
      }, sam);
      return { res, assistantId };
    };

    it("reserves the real amount on the saved PayPal account when a request is booked", async () => {
      const { res } = await bookWithPaypal();
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      const order = paypal.find((c) => c.path === "/v2/checkout/orders")!;
      const hold = store.data.holds.find((h) => h.id === res.json.task.holdId)!;
      expect(order.body.intent).toBe("AUTHORIZE");
      expect(order.body.payment_source.paypal.vault_id).toBe("VAULT_SAM");
      expect(order.body.purchase_units[0].amount.value).toBe((hold.amountCents / 100).toFixed(2));
      expect(hold.processorRef).toBe("paypal:AUTH_T");
    });

    it("takes only what was spent when the task is done", async () => {
      const { res, assistantId } = await bookWithPaypal();
      const { cookie } = await assistantLogin(assistantId, "a-fine-assistant-password", false);
      await call("POST", `/api/assistant/tasks/${res.json.task.id}/complete`, { billedCents: 400 }, null, cookie);
      await flush();
      const capture = paypal.find((c) => c.path === "/v2/payments/authorizations/AUTH_T/capture")!;
      expect(capture.body.amount.value).toBe(((400 + res.json.task.serviceFeeCents) / 100).toFixed(2));
      expect(capture.body.final_capture).toBe(true);
    });

    it("lets the whole hold go when the request is cancelled", async () => {
      const { res } = await bookWithPaypal();
      await call("POST", `/api/concierge/tasks/${res.json.task.id}/cancel`, {}, sam);
      await flush();
      expect(paypal.some((c) => c.path === "/v2/payments/authorizations/AUTH_T/void")).toBe(true);
    });
  });

  describe("text alerts", () => {
    /** Twilio, stood in for. Only its own host is intercepted. */
    const realFetch = globalThis.fetch;
    let texts: { to: string; body: string; auth: string }[];
    const flush = () => new Promise((r) => setTimeout(r, 30));

    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID = "ACtest";
      process.env.TWILIO_AUTH_TOKEN = "tok";
      process.env.TWILIO_FROM_NUMBER = "+17875550100";
      texts = [];
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = String(input);
        if (!url.startsWith("https://api.twilio.com")) return realFetch(input, init);
        const form = new URLSearchParams(String(init?.body ?? ""));
        texts.push({ to: form.get("To") ?? "", body: form.get("Body") ?? "", auth: String((init?.headers as Record<string, string>)?.authorization ?? "") });
        return Response.json({ sid: "SM1" }, { status: 201 });
      }) as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = realFetch;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FROM_NUMBER;
      delete process.env.OWNER_ALERT_PHONE;
    });

    const optIn = (token: string | null, cookie: Record<string, string> | null, phone: string, language = "en", path = "/api/account/text-alerts") =>
      call("POST", path, { phone, consent: true, language }, token, cookie ?? undefined);

    /** A customer with a card, an assistant on our roster, and a booked errand between them. */
    const booked = async () => {
      const hired = await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com` }, "puerto-rico");
      const assistantId = hired.json.assistant.id as string;
      await withCard(sam);
      const res = await call("POST", "/api/concierge/tasks", {
        category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice.",
        location: { lat: 18.4655, lng: -66.1057, label: "San Juan" },
        spendCapCents: 1_000, acknowledgedDisclosures: true, assistantId,
      }, sam);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      const { cookie } = await assistantLogin(assistantId, "a-fine-assistant-password", false);
      return { assistantId, taskId: res.json.task.id as string, cookie };
    };

    it("needs a session, and refuses a number without agreement or one that cannot be a number", async () => {
      expect((await call("GET", "/api/account/text-alerts")).status).toBe(401);
      expect((await call("POST", "/api/account/text-alerts", { phone: "787-555-0142", consent: true })).status).toBe(401);
      expect((await call("POST", "/api/account/text-alerts", { phone: "787-555-0142", consent: false }, sam)).json.enabled).toBe(false);
      expect((await call("POST", "/api/account/text-alerts", { phone: "787-555-0142" }, sam)).status).toBe(400);
      expect((await optIn(sam, null, "12345")).status).toBe(400);
      expect((await call("GET", "/api/account/text-alerts", undefined, sam)).json.enabled).toBe(false);
    });

    it("keeps only the last four digits of a number it will show back", async () => {
      const res = await optIn(sam, null, "(787) 555-0142");
      expect(res.json).toEqual({ enabled: true, phoneLast4: "0142" });
      const read = await call("GET", "/api/account/text-alerts", undefined, sam);
      expect(read.json).toMatchObject({ enabled: true, phoneLast4: "0142" });
      expect(JSON.stringify(read.json)).not.toContain("555");
    });

    it("texts the assistant when a request lands on them, signed with the account's own credentials", async () => {
      const hired = await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com` }, "puerto-rico");
      const assistantId = hired.json.assistant.id as string;
      const { cookie } = await assistantLogin(assistantId, "a-fine-assistant-password", false);
      expect((await optIn(null, cookie, "787-555-0199", "es", "/api/assistant/text-alerts")).json.enabled).toBe(true);
      await withCard(sam);
      const res = await call("POST", "/api/concierge/tasks", {
        category: "grab-something", quickTask: true, errandTier: "in-building", note: "A cold juice.",
        location: { lat: 18.4655, lng: -66.1057, label: "San Juan" },
        spendCapCents: 1_000, acknowledgedDisclosures: true, assistantId,
      }, sam);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      await flush();
      expect(texts).toHaveLength(1);
      expect(texts[0]).toMatchObject({ to: "+17875550199" });
      expect(texts[0]!.body).toMatch(/solicitud nueva/);
      expect(texts[0]!.auth).toBe(`Basic ${Buffer.from("ACtest:tok").toString("base64")}`);
    });

    it("texts nobody who never agreed to it", async () => {
      await booked();
      await flush();
      expect(texts).toEqual([]);
    });

    it("texts the customer when the assistant answers, asks to spend, and finishes — and the assistant when the customer writes", async () => {
      const { taskId, cookie } = await booked();
      await optIn(sam, null, "787-555-0142");
      await optIn(null, cookie, "787-555-0199", "en", "/api/assistant/text-alerts");

      await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "Thanks!" }, sam);
      await call("POST", `/api/assistant/tasks/${taskId}/messages`, { body: "On my way." }, null, cookie);
      await flush();
      expect(texts.map((t) => t.to).sort()).toEqual(["+17875550142", "+17875550199"]);

      texts.length = 0;
      await call("POST", `/api/assistant/tasks/${taskId}/spend-request`, { amountCents: 300, note: "Juice", photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" } }, null, cookie);
      await flush();
      expect(texts).toHaveLength(1);
      expect(texts[0]!.to).toBe("+17875550142");
      expect(texts[0]!.body).toMatch(/approve a purchase/);

      texts.length = 0;
      await call("POST", `/api/assistant/tasks/${taskId}/complete`, { billedCents: 300 }, null, cookie);
      await flush();
      expect(texts).toHaveLength(1);
      expect(texts[0]!.body).toMatch(/marked your request done/);
    });

    it("sends one text per conversation per few minutes, not one per message", async () => {
      const { taskId, cookie } = await booked();
      await optIn(null, cookie, "787-555-0199", "en", "/api/assistant/text-alerts");
      for (const body of ["one", "two", "three"]) {
        await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body }, sam);
      }
      await flush();
      expect(texts).toHaveLength(1);
    });

    it("never puts an amount, a place, or what was bought in a text", async () => {
      const { taskId, cookie } = await booked();
      await optIn(sam, null, "787-555-0142");
      await call("POST", `/api/assistant/tasks/${taskId}/spend-request`, { amountCents: 300, note: "Juice at the hospital", photo: { base64: Buffer.from("the shelf").toString("base64"), mimeType: "image/jpeg" } }, null, cookie);
      await flush();
      expect(texts[0]!.body).not.toMatch(/\$|\d{2,}|juice|hospital|san juan/i);
    });

    it("stops texting the moment someone opts out", async () => {
      const { taskId, cookie } = await booked();
      await optIn(sam, null, "787-555-0142");
      expect((await call("POST", "/api/account/text-alerts", { consent: false }, sam)).json.enabled).toBe(false);
      await call("POST", `/api/assistant/tasks/${taskId}/messages`, { body: "Hello" }, null, cookie);
      await flush();
      expect(texts).toEqual([]);
    });

    it("texts whoever hires when an application comes in, only if a number is set for that", async () => {
      await apply({ email: "nonumber@example.com" });
      await flush();
      expect(texts).toEqual([]);
      process.env.OWNER_ALERT_PHONE = "787-555-0111";
      await apply({ email: "withnumber@example.com" });
      await flush();
      expect(texts).toHaveLength(1);
      expect(texts[0]).toMatchObject({ to: "+17875550111" });
      expect(texts[0]!.body).toMatch(/job application/);
    });

    it("reports itself as not set up rather than pretending, when there is no account", async () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      expect((await call("GET", "/api/account/text-alerts", undefined, sam)).json.providerReady).toBe(false);
      await optIn(sam, null, "787-555-0142");
      await booked();
      await flush();
      expect(texts).toEqual([]);
    });
  });

  describe("errand tiers", () => {
    const book = (token: string, assistantId: string, over: Record<string, unknown> = {}) =>
      call("POST", "/api/concierge/tasks", {
        category: "run-errand", quickTask: true, errandTier: "nearby-store",
        note: "A phone charger for room 412.", location: IN_TEXAS, spendCapCents: 2_000,
        acknowledgedDisclosures: true, assistantId, ...over,
      }, token);
    const runner = async () => (await hireOne({
      role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com`,
    })).json.assistant.id as string;

    it("quotes the tier's fee, sized to the cap", async () => {
      await runner();
      const q = await call("POST", "/api/concierge/quote", {
        category: "run-errand", quickTask: true, errandTier: "nearby-store",
        note: "A phone charger.", location: IN_TEXAS, spendCapCents: 2_000,
      }, sam);
      expect(q.status, JSON.stringify(q.json)).toBe(200);
      expect(q.json.serviceFeeCents).toBe(errandFeeCents("nearby-store", 2_000));
      expect(q.json.totalCents).toBe(2_000 + errandFeeCents("nearby-store", 2_000));
    });

    it("pays the runner the tier's pay and stamps the tier on the task", async () => {
      const kit = await runner();
      await withCard(sam);
      const r = await book(sam, kit);
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      expect(r.json.task.assistantPayoutCents).toBe(errandPayoutCents("nearby-store"));
      expect(r.json.task.serviceFeeCents).toBe(errandFeeCents("nearby-store", 2_000));
      expect(r.json.task.errandTier).toBe("nearby-store");
    });

    it("keeps five cents or more on the booking, from what was actually charged", async () => {
      const kit = await runner();
      await withCard(sam);
      for (const [tier, cap] of [["in-building", 1_500], ["shopping-trip", 5_000], ["wait-in-line", 2_000]] as const) {
        const r = await book(sam, kit, { errandTier: tier, spendCapCents: cap });
        expect(r.status, `${tier}: ${JSON.stringify(r.json)}`).toBe(200);
        const t = r.json.task;
        if (t.feeIncluded) continue;
        const charge = store.data.charges.find((c) => c.id === t.chargeId)!;
        const card = Math.ceil(charge.amountCents * 0.029 + 30);
        expect(t.serviceFeeCents - t.assistantPayoutCents - card, tier).toBeGreaterThanOrEqual(5);
      }
    });

    it("refuses a tier on work that is paid by the hour, and a tier that does not exist", async () => {
      const kit = await runner();
      await withCard(sam);
      const hourly = await book(sam, kit, { category: "wait-with-someone", hours: 2, quickTask: false });
      expect(hourly.status).toBe(400);
      const bogus = await book(sam, kit, { errandTier: "teleport" });
      expect(bogus.status).toBe(400);
    });

    it("includes only the cheapest tier in the monthly allowance", async () => {
      const kit = await runner();
      await withCard(sam);
      const cheap = await book(sam, kit, { errandTier: "in-building", category: "grab-something", spendCapCents: 500 });
      expect(cheap.json.task.serviceFeeCents).toBe(0);
      const dear = await book(sam, kit, { errandTier: "nearby-store", category: "grab-something", spendCapCents: 500 });
      expect(dear.json.task.serviceFeeCents).toBe(errandFeeCents("nearby-store", 500));
    });
  });

  describe("while Free's errands are paused", () => {
    it("refuses a free account's errand, says why, and leaves Free's safety basics alone", async () => {
      setFlag("free-errands", false);
      await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: "kitp@example.com" });
      const res = await call("POST", "/api/concierge/quote", {
        category: "grab-something", quickTask: true, note: "A cold juice.", location: IN_TEXAS, spendCapCents: 500,
      }, jordan);
      expect(res.status).toBe(402);
      expect(res.json.error).toMatch(/paused/i);
      expect(res.json.error).toMatch(/premium/i);
      // The rest of Free is untouched: it can still start a night's check-ins.
      const roster = await call("GET", `/api/concierge/assistants?category=grab-something&quickTask=true&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, jordan);
      expect(roster.status).toBe(402);
    });

    it("still prices and books an errand for a paid account", async () => {
      setFlag("free-errands", false);
      await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: "kitq@example.com" });
      const res = await call("POST", "/api/concierge/quote", {
        category: "grab-something", quickTask: true, errandTier: "in-building",
        note: "A cold juice.", location: IN_TEXAS, spendCapCents: 500,
      }, sam);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
      expect(res.json.feeIncluded).toBe(true);
    });
  });

  describe("grabs included in the plan", () => {
    /** A juice to room 412: the smallest thing we do, booked the way the free
     *  plan books it. */
    const bookGrab = (token: string, assistantId: string, over: Record<string, unknown> = {}) =>
      call("POST", "/api/concierge/tasks", {
        category: "grab-something", quickTask: true, note: "A cold juice to room 412.",
        location: IN_TEXAS, spendCapCents: 500, acknowledgedDisclosures: true, assistantId, ...over,
      }, token);

    const runner = async () => {
      const hired = await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: `kit${Math.random()}@example.com` });
      return hired.json.assistant.id as string;
    };

    it("brings a free account's first grab with no service fee, and holds only the item", async () => {
      const kit = await runner();
      await withCard(jordan);

      const quote = await call("POST", "/api/concierge/quote", {
        category: "grab-something", quickTask: true, note: "A cold juice to room 412.",
        location: IN_TEXAS, spendCapCents: 500,
      }, jordan);
      expect(quote.status, JSON.stringify(quote.json)).toBe(200);
      expect(quote.json.serviceFeeCents).toBe(0);
      expect(quote.json.totalCents).toBe(500);
      expect(quote.json.feeIncluded).toBe(true);
      expect(quote.json.includedGrabsRemaining).toBe(INCLUDED_GRABS_PER_MONTH.free);

      const booked = await bookGrab(jordan, kit);
      expect(booked.status, JSON.stringify(booked.json)).toBe(200);
      expect(booked.json.task.serviceFeeCents).toBe(0);
      expect(booked.json.task.feeIncluded).toBe(true);
      // The runner is paid exactly what they would have been. Safehubby pays
      // it instead of the customer; nobody earns less for a free juice run.
      expect(booked.json.task.assistantPayoutCents).toBe(assistantPayoutFor("grab-something", true, 1));
      const charge = store.data.charges.find((c) => c.id === booked.json.task.chargeId)!;
      expect(charge.amountCents).toBe(500);
    });

    it("charges the ordinary fee once the month's allowance is used", async () => {
      const kit = await runner();
      await withCard(jordan);
      const allowance = INCLUDED_GRABS_PER_MONTH.free!;
      for (let i = 0; i < allowance; i++) {
        const r = await bookGrab(jordan, kit);
        expect(r.json.task.serviceFeeCents, `grab ${i + 1}`).toBe(0);
      }
      const next = await bookGrab(jordan, kit);
      expect(next.status).toBe(200);
      expect(next.json.task.serviceFeeCents).toBe(serviceFeeFor("grab-something", true, 1));
      expect(next.json.task.feeIncluded).toBeFalsy();

      const status = await call("GET", "/api/concierge/included-grabs", undefined, jordan);
      expect(status.json).toMatchObject({ allowance, used: allowance, remaining: 0 });
      // Said up front, like the desk-task allowance: when it comes back.
      expect(Date.parse(status.json.resetsAt)).toBeGreaterThan(clock.getTime());
    });

    it("gives a cancelled grab back to the month", async () => {
      // Cancelling should not cost somebody one of their two. Nothing was
      // brought, so nothing was used.
      const kit = await runner();
      await withCard(jordan);
      const booked = await bookGrab(jordan, kit);
      expect((await call("GET", "/api/concierge/included-grabs", undefined, jordan)).json.used).toBe(1);
      await call("POST", `/api/concierge/tasks/${booked.json.task.id}/cancel`, {}, jordan);
      const after = await call("GET", "/api/concierge/included-grabs", undefined, jordan);
      expect(after.json.used).toBe(0);
      expect(after.json.remaining).toBe(INCLUDED_GRABS_PER_MONTH.free);
    });

    it("lets only one of two simultaneous bookings take the last included grab", async () => {
      /**
       * The fee is decided before the task is saved, and in production a card
       * is issued in between — an await on the card issuer. Two taps landing together
       * would both see one grab left and both book it free.
       *
       * Without a card issuer there is no await in that gap at all, so an
       * earlier version of this test passed with the guard switched off and
       * proved nothing. This stands in an issuer that takes its time, the way
       * a real one does, so the two requests genuinely overlap there.
       */
      const kit = await runner();
      await withCard(jordan);
      const allowance = INCLUDED_GRABS_PER_MONTH.free!;
      for (let i = 0; i < allowance - 1; i++) await bookGrab(jordan, kit);

      const cards = taskCards as { status: CardIssuingPort["status"]; issueCard: CardIssuingPort["issueCard"] };
      const real = { status: cards.status, issueCard: cards.issueCard };
      cards.status = { ...real.status, mode: "automatic" };
      cards.issueCard = async () => {
        await new Promise((r) => setTimeout(r, 150));
        return { id: `card_${Math.random()}`, last4: "4242", network: "visa", expMonth: 12, expYear: 2030, revealUrl: null };
      };
      try {
        const [a, b] = await Promise.all([bookGrab(jordan, kit), bookGrab(jordan, kit)]);
        expect(a.status, JSON.stringify(a.json)).toBe(200);
        expect(b.status, JSON.stringify(b.json)).toBe(200);
        const free = [a, b].filter((r) => r.json.task.serviceFeeCents === 0);
        expect(free).toHaveLength(1);
      } finally {
        cards.status = real.status;
        cards.issueCard = real.issueCard;
      }
    });

    it("leaves an errand at its rate", async () => {
      const kit = await runner();
      await withCard(jordan);
      const errand = await bookGrab(jordan, kit, { category: "run-errand", spendCapCents: 1_000 });
      expect(errand.status, JSON.stringify(errand.json)).toBe(200);
      expect(errand.json.task.serviceFeeCents).toBe(serviceFeeFor("run-errand", true, 1));
    });
  });

  it("lets a free plan see who could run its errand without being told it is a quick task", async () => {
    /**
     * The free tier's one concierge capability, and it was unreachable.
     *
     * The client works out "this is a quick task" from the plan and sends it
     * when quoting and when booking — but the roster listing is a third call
     * and did not carry it. So the auto-assign behind "Send request" asked
     * for the roster without the flag and got back "Your plan does not
     * include Personal concierge. Upgrade to unlock it." — for the one
     * category that plan does include.
     *
     * Listing who could come is not booking. A free plan can only ever book
     * these categories as a quick task, so the server works that out from
     * the plan rather than making the caller prove it.
     */
    await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: "kit2@example.com" });
    const res = await call(
      "GET", `/api/concierge/assistants?category=grab-something&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`,
      undefined, jordan);
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.inHouse).toBe(1);
  });

  it("still keeps a free plan out of the categories it does not pay for", async () => {
    // The leniency above is scoped to the quick-task categories. Waiting with
    // somebody is open-ended time with a person and stays paid.
    await hireOne();
    const res = await call(
      "GET", `/api/concierge/assistants?category=wait-with-someone&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`,
      undefined, jordan);
    expect(res.status).toBe(402);
  });

  it("prices work our own roster will do, with no partner network configured", async () => {
    /**
     * The other half of the regression above, and the one that actually
     * blocks a launch. Browsing the roster was fixed; quoting was not, so a
     * market staffed entirely by people we hired could pick an assistant and
     * never see a price — and the client disables the booking button until a
     * price arrives. Browse, choose, and then nothing.
     *
     * `POST /api/concierge/tasks` already books our own staff without the
     * partner, and prices them from the rate card in concierge.ts rather
     * than asking a supplier. Quoting has to follow the same rule or the two
     * routes disagree about whether the work can happen at all.
     */
    await hireOne();
    const res = await call("POST", "/api/concierge/quote", {
      category: "wait-with-someone", note: "Stay with my father through his appointment.",
      location: IN_TEXAS, spendCapCents: 10_000, hours: 2,
    }, sam);

    expect(res.status, JSON.stringify(res.json)).toBe(200);
    // Priced: either a fee, or hours the plan already includes.
    expect(res.json.serviceFeeCents > 0 || res.json.includedHoursUsed > 0).toBe(true);
    expect(res.json.totalCents).toBeGreaterThanOrEqual(10_000 + res.json.serviceFeeCents);
    // Our own roster is not a supplier we ask for a price, so there is no
    // partner quote to return — the rate card already decided it.
    expect(res.json.quote).toBeNull();
  });

  it("still refuses a quote where neither our roster nor a partner can go", async () => {
    // The 503 is correct when nobody can actually do the work. Removing it
    // outright would quote a price for a task that cannot be dispatched.
    const res = await call("POST", "/api/concierge/quote", {
      category: "wait-with-someone", note: "Stay with my father through his appointment.",
      location: IN_TEXAS, spendCapCents: 10_000, hours: 2,
    }, sam);
    expect(res.status).toBe(503);
  });

  it("never offers an errand runner for waiting with or checking on someone", async () => {
    await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: "kit@example.com" });

    const errand = await call("GET", `/api/concierge/assistants?category=grab-something&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, sam);
    expect(errand.json.inHouse).toBe(1);

    const sitting = await call("GET", `/api/concierge/assistants?category=wait-with-someone&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, sam);
    expect(sitting.json.inHouse).toBe(0);
  });

  it("keeps somebody hired for one market out of another market's roster", async () => {
    await hireOne({}, "los-angeles");
    const res = await call("GET", `/api/concierge/assistants?category=grab-something&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, sam);
    expect(res.json.inHouse).toBe(0);
  });

  it("books one of our own without a partner network, at the market rate", async () => {
    const hired = await hireOne();
    const assistantId = hired.json.assistant.id;
    await withCard(sam);

    const booked = await call("POST", "/api/concierge/tasks", {
      category: "wait-with-someone", note: "Sit with my friend Dani until her sister arrives",
      location: IN_TEXAS, spendCapCents: 2500, acknowledgedDisclosures: true, assistantId,
    }, sam);

    expect(booked.status).toBe(200);
    const task = store.data.conciergeTasks.at(-1)!;
    expect(task.assistantId).toBe(assistantId);
    // Texas pay band, not the Los Angeles default.
    expect(task.assistantPayoutCents).toBe(assistantPayoutFor("wait-with-someone", false, 1));
  });

  it("refuses to send somebody to a task their role does not cover", async () => {
    const hired = await hireOne({ role: "errand-runner", fullName: "Kit Moreno", email: "kit@example.com" });
    await withCard(sam);

    const booked = await call("POST", "/api/concierge/tasks", {
      category: "wait-with-someone", note: "Sit with my friend until her sister arrives",
      location: IN_TEXAS, spendCapCents: 2500, acknowledgedDisclosures: true,
      assistantId: hired.json.assistant.id,
    }, sam);

    expect(booked.status).toBe(400);
    expect(booked.json.error).toMatch(/not dispatched for that kind of task/i);
  });

  it("will not hire the same application twice", async () => {
    const { json } = await apply();
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
    expect((await callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas" })).status).toBe(200);
    expect((await callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas" })).status).toBe(409);
  });

  it("will not hire somebody nobody has reviewed", async () => {
    const { json } = await apply();
    const res = await callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas" });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/approved application/i);
  });

  it("needs a market, since that is what their pay is priced against", async () => {
    const { json } = await apply();
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
    const res = await callAdmin("POST", `/api/staff/applications/${json.id}/hire`, {});
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/market/i);
  });

  it("takes somebody off the roster without deleting them", async () => {
    const hired = await hireOne();
    const id = hired.json.assistant.id;
    const stood = await callAdmin("POST", `/api/staff/roster/${id}/stand-down`, {});
    expect(stood.json.activeUntil).toBeTruthy();

    advance(1);
    const res = await call("GET", `/api/concierge/assistants?category=grab-something&lat=${IN_TEXAS.lat}&lng=${IN_TEXAS.lng}`, undefined, sam);
    expect(res.json.inHouse).toBe(0);
    // The record survives — they are still attached to work they did.
    expect(store.data.assistants).toHaveLength(1);
  });

  it("keeps the roster behind the admin secret", async () => {
    expect((await call("GET", "/api/staff/roster")).status).toBe(401);
    expect((await callAdmin("GET", "/api/staff/roster")).status).toBe(200);
  });
});

describe("texting the assistant on your task", () => {
  const IN_TEXAS = { lat: 29.76, lng: -95.37 };
  useAdminKey();

  const withCard = (token: string) =>
    call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, token);

  /** Hire somebody and book them, which is the only way a thread exists. */
  const bookedTask = async () => {
    const app = await call("POST", "/api/staff/apply", {
      role: "personal-assistant", fullName: "Rosa Delgado", email: "rosa@example.com",
      phone: "2125550147", city: "Houston", state: "TX", hoursPerWeek: 20,
      backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
      experience: "Six years as a home health aide, plus weekend shifts at a shelter.",
    });
    await callAdmin("POST", `/api/staff/applications/${app.json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/staff/applications/${app.json.id}/review`, { status: "approved" });
    const hired = await callAdmin("POST", `/api/staff/applications/${app.json.id}/hire`, { market: "texas" });
    await withCard(sam);
    const booked = await call("POST", "/api/concierge/tasks", {
      category: "run-errand", note: "Two 2x4s from the hardware store on Main",
      location: IN_TEXAS, spendCapCents: 12000, acknowledgedDisclosures: true,
      assistantId: hired.json.assistant.id,
    }, sam);
    return { taskId: booked.json.task.id, assistantId: hired.json.assistant.id };
  };

  it("sends a message and reads it back on the thread", async () => {
    const { taskId } = await bookedTask();
    const sent = await call("POST", `/api/concierge/tasks/${taskId}/messages`, {
      body: "  The 8ft ones, not the 10ft  ",
    }, sam);
    expect(sent.status).toBe(200);
    expect(sent.json.message.body).toBe("The 8ft ones, not the 10ft");
    expect(sent.json.message.sender).toBe("traveler");

    const thread = await call("GET", `/api/concierge/tasks/${taskId}/messages`, undefined, sam);
    expect(thread.json.messages).toHaveLength(1);
  });

  it("refuses an empty message rather than sending a blank bubble", async () => {
    const { taskId } = await bookedTask();
    expect((await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "   " }, sam)).status).toBe(400);
  });

  it("bounds the length", async () => {
    const { taskId } = await bookedTask();
    const res = await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "x".repeat(801) }, sam);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/under 800/i);
  });

  it("never shows another account's thread", async () => {
    const { taskId } = await bookedTask();
    await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "private" }, sam);
    // Jordan owns no such task, so it is a 404 rather than an empty thread.
    expect((await call("GET", `/api/concierge/tasks/${taskId}/messages`, undefined, jordan)).status).toBe(404);
    expect((await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "hi" }, jordan)).status).toBe(404);
  });

  it("needs a session at all", async () => {
    const { taskId } = await bookedTask();
    expect((await call("GET", `/api/concierge/tasks/${taskId}/messages`)).status).toBe(401);
  });

  it("marks the other side's messages read on open, and never your own", async () => {
    const { taskId, assistantId } = await bookedTask();
    const { cookie } = await assistantLogin(assistantId, "a-fine-assistant-password", false);

    await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "from the traveler" }, sam);
    await call("POST", `/api/assistant/tasks/${taskId}/messages`, { body: "from the assistant" }, null, cookie);

    // The traveler opening the thread marks the assistant's message read.
    await call("GET", `/api/concierge/tasks/${taskId}/messages`, undefined, sam);
    const stored = store.data.textMessages.filter((m) => m.taskId === taskId);
    expect(stored.find((m) => m.sender === "assistant")!.readAt).toBeTruthy();
    expect(stored.find((m) => m.sender === "traveler")!.readAt).toBeUndefined();
  });

  it("lets both sides see one conversation, in order", async () => {
    const { taskId, assistantId } = await bookedTask();
    const { cookie } = await assistantLogin(assistantId, "a-fine-assistant-password", false);

    await call("POST", `/api/concierge/tasks/${taskId}/messages`, { body: "first" }, sam);
    advance(1);
    await call("POST", `/api/assistant/tasks/${taskId}/messages`, { body: "second" }, null, cookie);

    const asTraveler = await call("GET", `/api/concierge/tasks/${taskId}/messages`, undefined, sam);
    const asAssistant = await call("GET", `/api/assistant/tasks/${taskId}/messages`, undefined, null, cookie);
    expect(asTraveler.json.messages.map((m: { body: string }) => m.body)).toEqual(["first", "second"]);
    expect(asAssistant.json.messages.map((m: { body: string }) => m.body)).toEqual(["first", "second"]);
  });

  it("carries a spend cap big enough to actually buy materials", async () => {
    // $120 of lumber was above the old $300 ceiling only in the sense that
    // nothing stopped it — but a bigger project needs the headroom.
    const { taskId } = await bookedTask();
    const task = store.data.conciergeTasks.find((t) => t.id === taskId)!;
    expect(task.spendCapCents).toBe(12000);
  });
});

describe("desk tasks — the assistant's job that does not need feet", () => {
  // Sam is premium-plus from the outer setup; Jordan stays free.
  it("takes a task, and never holds or charges anything for it", async () => {
    const before = store.data.charges.length;
    const res = await call("POST", "/api/desk/tasks", {
      kind: "appointment", note: "Book the dentist, any afternoon after the 12th",
    }, sam);
    expect(res.status).toBe(200);
    expect(res.json.task.status).toBe("open");
    // The whole point of this being included: no ledger entry, no hold.
    expect(store.data.charges.length).toBe(before);
    expect(store.data.holds.length).toBe(0);
    expect(res.json.task.chargeId).toBeUndefined();
    expect(res.json.task.holdId).toBeUndefined();
  });

  it("says what is left before anything is asked for", async () => {
    const res = await call("GET", "/api/desk/tasks", undefined, sam);
    expect(res.status).toBe(200);
    expect(res.json.allowance).toBeGreaterThan(0);
    expect(res.json.remaining).toBe(res.json.allowance);
    expect(res.json.resetsAt).toMatch(/^\d{4}-\d{2}-01T00:00:00/);
    expect(res.json.accessRule).toMatch(/never signs in as you/i);
  });

  it("refuses past the month's allowance, and says when it resets", async () => {
    const { allowance } = (await call("GET", "/api/desk/tasks", undefined, sam)).json;
    for (let i = 0; i < allowance; i++) {
      expect((await call("POST", "/api/desk/tasks", { kind: "reminder", note: `Thing ${i}` }, sam)).status).toBe(200);
    }
    const over = await call("POST", "/api/desk/tasks", { kind: "reminder", note: "One too many" }, sam);
    expect(over.status).toBe(429);
    expect(over.json.error).toMatch(/resets on the 1st/i);
  });

  it("gives a cancelled task's slot back", async () => {
    const made = await call("POST", "/api/desk/tasks", { kind: "research", note: "Compare the two policies" }, sam);
    const after = (await call("GET", "/api/desk/tasks", undefined, sam)).json;
    expect(after.remaining).toBe(after.allowance - 1);
    await call("POST", `/api/desk/tasks/${made.json.task.id}/cancel`, {}, sam);
    const back = (await call("GET", "/api/desk/tasks", undefined, sam)).json;
    expect(back.remaining).toBe(back.allowance);
  });

  it("is closed to the free plan, and to somebody else's task", async () => {
    expect((await call("GET", "/api/desk/tasks", undefined, jordan)).status).toBe(402);
    expect((await call("POST", "/api/desk/tasks", { kind: "reminder", note: "x" }, jordan)).status).toBe(402);

    const made = await call("POST", "/api/desk/tasks", { kind: "reminder", note: "Mine" }, sam);
    store.update((db) => { db.travelers.find((t) => t.id === jordanId)!.planId = "premium-basic"; });
    expect((await call("POST", `/api/desk/tasks/${made.json.task.id}/cancel`, {}, jordan)).status).toBe(404);
    expect((await call("GET", "/api/desk/tasks", undefined, jordan)).json.tasks).toEqual([]);
  });

  it("refuses an empty ask rather than opening an empty task", async () => {
    expect((await call("POST", "/api/desk/tasks", { kind: "reminder", note: "  " }, sam)).status).toBe(400);
    expect((await call("POST", "/api/desk/tasks", { kind: "teleport", note: "x" }, sam)).status).toBe(400);
  });
});

describe("the Wingman Club is by invitation, run by the club assistant", () => {
  useAdminKey();
  const keyed = async (role: string, email: string) => {
    const created = await callAdmin("POST", "/api/admin/master-accounts", { name: "Club Desk", email, role });
    const signedIn = await call("POST", "/api/master/auth/login", { key: created.json.key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    return { Cookie: `sh_master_session=${token}` };
  };

  it("refuses an uninvited customer, and welcomes one who was invited", async () => {
    expect((await call("GET", "/api/club/status", undefined, sam)).json.invited).toBe(false);
    expect((await call("POST", "/api/club/join", {}, sam)).status).toBe(403);
    const desk = await keyed("club-assistant", "club@example.com");
    expect((await call("POST", "/api/master/club/invite", { travelerId: samId }, null, desk)).status).toBe(200);
    expect((await call("GET", "/api/club/status", undefined, sam)).json.invited).toBe(true);
    expect((await call("POST", "/api/club/join", {}, sam)).status).toBe(200);
  });

  it("keeps the club desk away from a secretary", async () => {
    const sec = await keyed("secretary", "sec@example.com");
    expect((await call("GET", "/api/master/club/desk", undefined, null, sec)).status).toBe(401);
    expect((await call("POST", "/api/master/club/invite", { travelerId: samId }, null, sec)).status).toBe(401);
  });

  it("lets a member ask, the assistant arrange, and the member see the answer", async () => {
    const desk = await keyed("club-assistant", "club2@example.com");
    await call("POST", "/api/master/club/invite", { travelerId: samId }, null, desk);
    expect((await call("POST", "/api/club/requests", { note: "a table for six" }, sam)).status).toBe(403);
    await call("POST", "/api/club/join", {}, sam);
    const made = await call("POST", "/api/club/requests", { note: "a table for six" }, sam);
    expect(made.status).toBe(200);
    const seen = await call("GET", "/api/master/club/desk", undefined, null, desk);
    expect(seen.json.update.openClubRequests).toBe(1);
    expect(seen.json.requests[0].memberName).toBeTruthy();
    await call("POST", `/api/master/club/requests/${made.json.request.id}`, { reply: "Booked for 8pm" }, null, desk);
    const mine = await call("GET", "/api/club/requests", undefined, sam);
    expect(mine.json.requests[0]).toMatchObject({ status: "arranged", reply: "Booked for 8pm" });
    expect((await call("GET", "/api/club/requests", undefined, jordan)).json.requests).toEqual([]);
  });
});

describe("the Wingman Club — modeled economics, no billing wired to it yet", () => {
  beforeEach(() => {
    for (const t of store.data.travelers) t.clubInvited = true;
  });

  it("starts everyone out not a member, and reports the live roster count", async () => {
    const res = await call("GET", "/api/club/status", undefined, sam);
    expect(res.status).toBe(200);
    expect(res.json.isMember).toBe(false);
    expect(res.json.memberCount).toBe(0);
    expect(res.json.thisMonth.duesCents).toBeGreaterThan(0);
    expect(res.json.thisMonth.experience).toBeTruthy();
    expect(res.json.perks.length).toBeGreaterThan(0);
    expect(res.json.disclosures.length).toBeGreaterThan(0);
  });

  it("prices a lone member at the venue's regular price, so the first experience is covered", async () => {
    const res = await call("GET", "/api/club/status", undefined, sam);
    expect(res.json.memberCount).toBe(0);
    expect(res.json.thisMonth.duesCents).toBeGreaterThanOrEqual(res.json.thisMonth.experience.retailPerPersonCents);
  });

  it("charges more for a pricier pick than a cheaper one, in the same due", async () => {
    const res = await call("GET", "/api/club/status", undefined, sam);
    expect(res.json.thisMonth.duesCents).toBeGreaterThan(res.json.thisMonth.experience.negotiatedPerPersonCents);
  });

  it("lets someone join and leave, and the roster count follows them", async () => {
    const before = (await call("GET", "/api/club/status", undefined, sam)).json.memberCount;
    const joined = await call("POST", "/api/club/join", {}, sam);
    expect(joined.status).toBe(200);
    expect(joined.json.isMember).toBe(true);

    const afterJoin = await call("GET", "/api/club/status", undefined, sam);
    expect(afterJoin.json.isMember).toBe(true);
    expect(afterJoin.json.memberCount).toBe(before + 1);

    const left = await call("POST", "/api/club/leave", {}, sam);
    expect(left.json.isMember).toBe(false);
    const afterLeave = await call("GET", "/api/club/status", undefined, sam);
    expect(afterLeave.json.memberCount).toBe(before);
  });

  it("counts every member's join toward the same shared roster, not a private one each", async () => {
    await call("POST", "/api/club/join", {}, sam);
    await call("POST", "/api/club/join", {}, jordan);
    const res = await call("GET", "/api/club/status", undefined, sam);
    expect(res.json.memberCount).toBeGreaterThanOrEqual(2);
  });

  it("never charges anyone for joining", async () => {
    const before = store.data.charges.length;
    await call("POST", "/api/club/join", {}, sam);
    expect(store.data.charges.length).toBe(before);
  });

  it("shows the same monthly pick to everyone, regardless of who asks", async () => {
    const a = (await call("GET", "/api/club/status", undefined, sam)).json.thisMonth.experience.id;
    const b = (await call("GET", "/api/club/status", undefined, jordan)).json.thisMonth.experience.id;
    expect(a).toBe(b);
  });
});

describe("master access — a per-account role instead of one shared secret", () => {
  useAdminKey();

  /** Provisions a master account with the admin key, then signs it in and
   *  returns a Cookie header for it — the master portal is cookie-only, the
   *  same shape assistantLogin already uses for the employee portal. */
  const masterLogin = async (role: "owner" | "secretary", name = "Luis Garcia", email = "luis@example.com") => {
    const created = await callAdmin("POST", "/api/admin/master-accounts", { name, email, role });
    expect(created.status).toBe(200);
    const key = created.json.key as string;
    const accountId = created.json.account.id as string;

    const signedIn = await call("POST", "/api/master/auth/login", { key });
    expect(signedIn.status).toBe(200);
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    return { cookie: { Cookie: `sh_master_session=${token}` }, key, accountId, signedIn };
  };

  it("provisions an account and returns the key once, never storing it in the clear", async () => {
    const created = await callAdmin("POST", "/api/admin/master-accounts", {
      name: "Luis Garcia", email: "luis@example.com", role: "owner",
    });
    expect(created.status).toBe(200);
    expect(created.json.key).toBeTruthy();
    expect(created.json.account.role).toBe("owner");

    const stored = store.data.masterCredentials[created.json.account.id as string];
    expect(stored).toBeTruthy();
    expect(stored!.keyHash).not.toContain(created.json.key);
  });

  it("refuses to provision without the admin key or an owner session", async () => {
    const res = await call("POST", "/api/admin/master-accounts", {
      name: "Nobody", email: "nobody@example.com", role: "owner",
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown role rather than guessing", async () => {
    const res = await callAdmin("POST", "/api/admin/master-accounts", {
      name: "Luis Garcia", email: "luis@example.com", role: "wizard",
    });
    expect(res.status).toBe(400);
  });

  it("signs in with the key and rejects a wrong one", async () => {
    const { key } = await masterLogin("owner");
    expect((await call("POST", "/api/master/auth/login", { key: "not-the-key" })).status).toBe(401);
    // The real key still works — a failed attempt does not lock the account.
    expect((await call("POST", "/api/master/auth/login", { key })).status).toBe(200);
  });

  it("lists provisioned accounts with their scopes, never their keys", async () => {
    await masterLogin("owner");
    const list = await callAdmin("GET", "/api/admin/master-accounts");
    expect(list.status).toBe(200);
    expect(list.json[0].scopes).toContain("write");
    expect(JSON.stringify(list.json)).not.toMatch(/keyHash/);
  });

  it("gives the owner every section of the overview", async () => {
    const { cookie } = await masterLogin("owner");
    const res = await call("GET", "/api/master/overview", undefined, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.customers).toBeTruthy();
    expect(res.json.operations).toBeTruthy();
    expect(res.json.money).toBeTruthy();
    expect(res.json.money.pendingChargesCents).toBe(0);
    expect(res.json.money.pendingChargeCount).toBe(0);
  });

  it("counts a store-billed charge still awaiting its receipt as pending, separate from settled", async () => {
    await call("POST", "/api/account/payment-method", { brand: "Visa", last4: "4242", expMonth: 12, expYear: 2030 }, sam);
    // Starts on the card rail (the default) so it actually renews once past
    // the trial — a subscription started on the app-store rail never
    // auto-renews here (renewDueSubscriptions skips anything not "card"),
    // so it would stay "trialing" and the next plan change would charge
    // nothing at all, same as changePlan's own documented trial behavior.
    await call("POST", "/api/subscription", { planId: "premium-basic" }, sam);
    advancePastTrial();
    const ios = await call("POST", "/api/subscription", { planId: "premium-plus", platform: "ios" }, sam);
    expect(ios.json.charged.status).toBe("pending");

    const { cookie } = await masterLogin("owner");
    const res = await call("GET", "/api/master/overview", undefined, null, cookie);
    expect(res.json.money.pendingChargeCount).toBeGreaterThan(0);
    expect(res.json.money.pendingChargesCents).toBeGreaterThan(0);
  });

  it("gives the secretary customers and operations, but not money", async () => {
    const { cookie } = await masterLogin("secretary");
    const res = await call("GET", "/api/master/overview", undefined, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.customers).toBeTruthy();
    expect(res.json.operations).toBeTruthy();
    expect(res.json.money).toBeUndefined();
  });

  it("counts the real customer roster, not a hypothetical one", async () => {
    const { cookie } = await masterLogin("owner");
    const res = await call("GET", "/api/master/overview", undefined, null, cookie);
    const ids = res.json.customers.map((c: any) => c.id);
    expect(ids).toContain(samId);
    expect(ids).toContain(jordanId);
  });

  it("refuses the overview and the audit log with no session at all", async () => {
    expect((await call("GET", "/api/master/overview")).status).toBe(401);
    expect((await call("GET", "/api/master/audit-log")).status).toBe(401);
  });

  it("records who looked at what, and lets both roles read the trail back", async () => {
    const { cookie: ownerCookie } = await masterLogin("owner", "Owner One", "owner1@example.com");
    await call("GET", "/api/master/overview", undefined, null, ownerCookie);

    const log = await call("GET", "/api/master/audit-log", undefined, null, ownerCookie);
    expect(log.status).toBe(200);
    expect(log.json.length).toBeGreaterThan(0);
    expect(log.json.some((e: any) => e.scope === "customers")).toBe(true);
    expect(log.json.every((e: any) => typeof e.subject === "string")).toBe(true);

    const { cookie: secCookie } = await masterLogin("secretary", "Sec One", "sec1@example.com");
    expect((await call("GET", "/api/master/audit-log", undefined, null, secCookie)).status).toBe(200);
  });

  it("stops a revoked account from signing in or acting on an existing session", async () => {
    const { cookie, accountId, key } = await masterLogin("owner");
    const revoke = await callAdmin("POST", `/api/admin/master-accounts/${accountId}/revoke`);
    expect(revoke.status).toBe(200);

    expect((await call("POST", "/api/master/auth/login", { key })).status).toBe(401);
    expect((await call("GET", "/api/master/overview", undefined, null, cookie)).status).toBe(401);
  });

  it("signs out cleanly, after which the old cookie no longer works", async () => {
    const { cookie } = await masterLogin("owner");
    const out = await call("POST", "/api/master/auth/logout", {}, null, cookie);
    expect(out.status).toBe(200);
    expect((await call("GET", "/api/master/overview", undefined, null, cookie)).status).toBe(401);
  });

  it("now lets a master key stand in for the admin key on every admin route it covers", async () => {
    const { cookie: ownerCookie } = await masterLogin("owner");
    expect((await call("GET", "/api/staff/roster", undefined, null, ownerCookie)).status).toBe(200);
    expect((await call("GET", "/api/admin/budget", undefined, null, ownerCookie)).status).toBe(200);

    const { cookie: secCookie } = await masterLogin("secretary", "Sec Two", "sec2@example.com");
    expect((await call("GET", "/api/staff/roster", undefined, null, secCookie)).status).toBe(200);
    // Read-only: the secretary's role carries no `write`, so the budget
    // read (money-scoped) and a mutating action both stay out of reach.
    expect((await call("GET", "/api/admin/budget", undefined, null, secCookie)).status).toBe(401);
    expect((await call("POST", "/api/staff/roster/nope/stand-down", {}, null, secCookie)).status).toBe(401);
  });

  it("lets a secretary coordinate a pickup with an approved driver — dispatch, not money or a plan", async () => {
    const applied = await call("POST", "/api/drivers/apply", {
      tier: "standard", fullName: "Pat Rivera", email: "driver-pat@example.com", phone: "404-555-0199",
      city: "Atlanta", state: "GA", licenseNumber: "GA999999", licenseExpiry: "2030-01-01T00:00:00Z",
      yearsDriving: 5, vehicle: { make: "Honda", model: "Accord", year: 2022, licensePlate: "XYZ9876" },
      backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
    });
    await callAdmin("POST", `/api/drivers/applications/${applied.json.id}/review`, { status: "under-review" });
    await callAdmin("POST", `/api/drivers/applications/${applied.json.id}/review`, { status: "approved" });

    const requested = await call("POST", "/api/rides/coordinate", {
      pickup: { lat: 40.71, lng: -74.0, label: "Pickup" },
      dropoff: { lat: 40.75, lng: -73.98, label: "Home" },
    }, sam);
    expect(requested.status).toBe(200);
    expect(requested.json.request.status).toBe("requested");
    // The fee is known at request time; the fare is not, and must not be
    // guessed — see PickupRequest in ride-coordination.ts.
    expect(requested.json.request.arrangeFeeCents).toBeGreaterThan(0);
    expect(requested.json.request.rideCostCents).toBeUndefined();

    const { cookie: secCookie } = await masterLogin("secretary", "Sec Three", "sec3@example.com");
    const coordinated = await call(
      "POST", `/api/master/pickup-requests/${requested.json.request.id}/coordinate`,
      { driverId: applied.json.id }, null, secCookie,
    );
    expect(coordinated.status).toBe(200);
    expect(coordinated.json.request.status).toBe("coordinated");
    expect(coordinated.json.request.driverName).toBe("Pat Rivera");

    const mine = await call("GET", "/api/rides/coordinate", undefined, sam);
    expect(mine.json.requests[0].status).toBe("coordinated");
    expect(mine.json.requests[0].driverPhone).toBe("4045550199");
  });

  it("records what the ride actually cost, and refuses to restate it", async () => {
    const requested = await call("POST", "/api/rides/coordinate", {
      pickup: { lat: 40.71, lng: -74.0 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    const id = requested.json.request.id;
    const { cookie } = await masterLogin("owner", "Owner Cost", "ownercost@example.com");

    const ok = await call("POST", `/api/master/pickup-requests/${id}/ride-cost`,
      { costCents: 2340, bookedOn: "Uber" }, null, cookie);
    expect(ok.status).toBe(200);
    expect(ok.json.request.rideCostCents).toBe(2340);
    expect(ok.json.request.bookedOn).toBe("Uber");

    // The price the rider was told is the price they pay.
    const again = await call("POST", `/api/master/pickup-requests/${id}/ride-cost`,
      { costCents: 9900, bookedOn: "Uber" }, null, cookie);
    expect(again.status).toBe(400);
    expect(again.json.error).toMatch(/already been recorded/i);
  });

  it("refuses a nonsense ride cost, and one with no service named", async () => {
    const requested = await call("POST", "/api/rides/coordinate", {
      pickup: { lat: 40.71, lng: -74.0 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    const id = requested.json.request.id;
    const { cookie } = await masterLogin("owner", "Owner Bad", "ownerbad@example.com");
    expect((await call("POST", `/api/master/pickup-requests/${id}/ride-cost`,
      { costCents: -1, bookedOn: "Uber" }, null, cookie)).status).toBe(400);
    expect((await call("POST", `/api/master/pickup-requests/${id}/ride-cost`,
      { costCents: 2340, bookedOn: "  " }, null, cookie)).status).toBe(400);
  });

  it("needs money access to record a cost — dispatch access is not enough", async () => {
    // Coordinating says who is handling it; this decides what a customer is
    // charged, which is a different scope.
    const requested = await call("POST", "/api/rides/coordinate", {
      pickup: { lat: 40.71, lng: -74.0 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    const { cookie } = await masterLogin("secretary", "Sec Cost", "seccost@example.com");
    const res = await call("POST", `/api/master/pickup-requests/${requested.json.request.id}/ride-cost`,
      { costCents: 2340, bookedOn: "Uber" }, null, cookie);
    expect(res.status).toBe(401);
  });

  it("refuses to coordinate onto a driver who was never approved", async () => {
    const requested = await call("POST", "/api/rides/coordinate", {
      pickup: { lat: 40.71, lng: -74.0 }, dropoff: { lat: 40.75, lng: -73.98 },
    }, sam);
    const { cookie: ownerCookie } = await masterLogin("owner", "Owner Two", "owner2@example.com");
    const res = await call(
      "POST", `/api/master/pickup-requests/${requested.json.request.id}/coordinate`,
      { driverId: "asst_not_a_driver" }, null, ownerCookie,
    );
    expect(res.status).toBe(400);
  });
});

describe("master pricing controls", () => {
  useAdminKey();

  const masterLogin = async (role: "owner" | "secretary", name = "Luis Garcia", email = "luis@example.com") => {
    const created = await callAdmin("POST", "/api/admin/master-accounts", { name, email, role });
    const key = created.json.key as string;
    const signedIn = await call("POST", "/api/master/auth/login", { key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    return { cookie: { Cookie: `sh_master_session=${token}` } };
  };

  it("requires an admin session, master or shared-key", async () => {
    expect((await call("GET", "/api/master/pricing")).status).toBe(401);
    expect((await call("POST", "/api/master/pricing/override", { roleOrService: "owner", priceCents: 100 })).status)
      .toBe(401);
  });

  it("starts at the published defaults, with nothing accrued for an unset owner rate", async () => {
    const res = await callAdmin("GET", "/api/master/pricing");
    expect(res.status).toBe(200);
    expect(res.json.current.paHourlyCents).toBe(3500);
    expect(res.json.current.ownerMonthlyCents).toBe(0);
    expect(res.json.ownerAccrual).toEqual({ accruedCents: 0, dayOfMonth: 1, daysInMonth: 31 });
  });

  it("accrues the owner's own rate day by day, and the audit trail records who set it", async () => {
    const { cookie } = await masterLogin("owner");

    // The seeded clock starts 2027-01-01T20:00:00Z — day 1 of a 31-day month.
    const set = await call(
      "POST", "/api/master/pricing/override",
      { roleOrService: "owner", priceCents: 310000, reason: "Founder's draw for January" }, null, cookie,
    );
    expect(set.status).toBe(200);
    expect(set.json.current.ownerMonthlyCents).toBe(310000);
    expect(set.json.ownerAccrual).toEqual({ accruedCents: 10000, dayOfMonth: 1, daysInMonth: 31 });

    // Checked here, before the session below ages out — the audit-log
    // route takes only a real master account, with no shared-key fallback.
    const log = await call("GET", "/api/master/audit-log", undefined, null, cookie);
    expect(log.json.some((e: { subject: string }) => e.subject.includes("owner"))).toBe(true);

    // Two weeks later, the same rate has accrued proportionally more —
    // still nothing paid out, just a bigger fraction of the month elapsed.
    // The admin key, not the by-now-expired master session (12-hour TTL),
    // is what still works for this one.
    advance(14 * 24 * 60);
    const later = await callAdmin("GET", "/api/master/pricing");
    expect(later.json.ownerAccrual).toEqual({ accruedCents: 150000, dayOfMonth: 15, daysInMonth: 31 });
  });

  it("accrues the full monthly rate by the last day of the month", async () => {
    const { cookie } = await masterLogin("owner");
    await call("POST", "/api/master/pricing/override", { roleOrService: "owner", priceCents: 310000 }, null, cookie);
    advance(30 * 24 * 60); // day 1 -> day 31, the last day of January
    const res = await callAdmin("GET", "/api/master/pricing");
    expect(res.json.ownerAccrual).toEqual({ accruedCents: 310000, dayOfMonth: 31, daysInMonth: 31 });
  });

  it("resets to the new month's own fraction once the month turns over", async () => {
    const { cookie } = await masterLogin("owner");
    await call("POST", "/api/master/pricing/override", { roleOrService: "owner", priceCents: 310000 }, null, cookie);
    advance(45 * 24 * 60); // day 1 of January -> day 15 of February (28 days)
    const res = await callAdmin("GET", "/api/master/pricing");
    expect(res.json.ownerAccrual).toEqual({ accruedCents: Math.round((310000 * 15) / 28), dayOfMonth: 15, daysInMonth: 28 });
  });
});

describe("the launch plan on the master dashboard", () => {
  useAdminKey();

  const masterLogin = async (role: "owner" | "secretary", name = "Luis Garcia", email = "luis@example.com") => {
    const created = await callAdmin("POST", "/api/admin/master-accounts", { name, email, role });
    const key = created.json.key as string;
    const signedIn = await call("POST", "/api/master/auth/login", { key });
    const token = /sh_master_session=([^;]+)/.exec(signedIn.setCookie ?? "")?.[1] ?? "";
    return { cookie: { Cookie: `sh_master_session=${token}` } };
  };

  const stepsOf = (overview: { json: any }) =>
    Object.fromEntries(overview.json.money.launch.steps.map((s: any) => [s.id, s]));

  it("rides along with the money scope, so a secretary never sees it", async () => {
    // It is a view of where the business is, which is money, not operations.
    const { cookie } = await masterLogin("secretary", "Sec Launch", "seclaunch@example.com");
    const res = await call("GET", "/api/master/overview", undefined, null, cookie);
    expect(res.status).toBe(200);
    expect(res.json.money).toBeUndefined();
  });

  it("reads the roster from real state rather than a tick", async () => {
    const { cookie } = await masterLogin("owner", "Own Launch", "ownlaunch@example.com");
    const before = stepsOf(await call("GET", "/api/master/overview", undefined, null, cookie));
    expect(before["on-the-roster"].done).toBe(false);
    expect(before["first-hire"].done).toBe(false);

    const apply = (over: Record<string, unknown>) => call("POST", "/api/staff/apply", {
      role: "personal-assistant", fullName: "Rosa Delgado", email: "rosa@example.com",
      phone: "2125550147", city: "Houston", state: "TX", hoursPerWeek: 20,
      backgroundCheckConsent: true, credentials: [TEST_INSURANCE],
      experience: "Six years as a home health aide, plus weekend shifts at a shelter.",
      ...over,
    });
    const hire = async (over: Record<string, unknown>) => {
      const { json } = await apply(over);
      await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "under-review" });
      await callAdmin("POST", `/api/staff/applications/${json.id}/review`, { status: "approved" });
      await callAdmin("POST", `/api/staff/applications/${json.id}/hire`, { market: "texas" });
    };

    await hire({});
    const one = stepsOf(await call("GET", "/api/master/overview", undefined, null, cookie));
    // One body on the roster is the owner, not a hire.
    expect(one["on-the-roster"].done).toBe(true);
    expect(one["first-hire"].done).toBe(false);

    await hire({ fullName: "Kit Moreno", email: "kitlaunch@example.com" });
    const two = stepsOf(await call("GET", "/api/master/overview", undefined, null, cookie));
    expect(two["first-hire"].done).toBe(true);
  });

  it("lets the owner tick a step the app cannot see, and untick it", async () => {
    const { cookie } = await masterLogin("owner", "Own Tick", "owntick@example.com");
    expect((await call("POST", "/api/master/launch/insurance-quote", { done: true }, null, cookie)).status).toBe(200);

    const marked = stepsOf(await call("GET", "/api/master/overview", undefined, null, cookie));
    expect(marked["insurance-quote"].done).toBe(true);
    expect(marked["insurance-quote"].markedAt).toBeTruthy();

    expect((await call("POST", "/api/master/launch/insurance-quote", { done: false }, null, cookie)).status).toBe(200);
    const cleared = stepsOf(await call("GET", "/api/master/overview", undefined, null, cookie));
    expect(cleared["insurance-quote"].done).toBe(false);
    expect(cleared["insurance-quote"].markedAt).toBeUndefined();
  });

  it("refuses to let an observed step be ticked, so the dashboard cannot lie", async () => {
    // The whole value of "Connect PayPal" being observed is that saying it is
    // done does not make the dashboard say so. Enforced here, not just hidden
    // in the UI.
    const { cookie } = await masterLogin("owner", "Own Lie", "ownlie@example.com");
    const res = await call("POST", "/api/master/launch/payments-configured", { done: true }, null, cookie);
    expect(res.status).toBe(400);

    const after = stepsOf(await call("GET", "/api/master/overview", undefined, null, cookie));
    expect(after["payments-configured"].done).toBe(false);
  });

  it("refuses a secretary outright — marking is a write", async () => {
    const { cookie } = await masterLogin("secretary", "Sec Tick", "sectick@example.com");
    expect((await call("POST", "/api/master/launch/insurance-quote", { done: true }, null, cookie)).status).toBe(401);
  });

  it("records the mark in the access log", async () => {
    const { cookie } = await masterLogin("owner", "Own Log", "ownlog@example.com");
    await call("POST", "/api/master/launch/app-store", { done: true }, null, cookie);
    const log = await call("GET", "/api/master/audit-log", undefined, null, cookie);
    expect(log.json.some((e: { subject: string }) => e.subject.includes("app-store"))).toBe(true);
  });
});

describe("the renewal-terms gate", () => {
  it("refuses a paid plan with no agreement to the renewal terms", async () => {
    // California's ARL is the reason this exists; Los Angeles is a launch
    // market. A disclosure the server does not enforce is a disclosure
    // somebody eventually forgets to render.
    const res = await call("POST", "/api/subscription",
      { planId: "premium-basic", renewalConsent: null }, jordan);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/renewal terms/i);

    // And nothing was created on the way to refusing.
    const after = await call("GET", "/api/billing", undefined, jordan);
    expect(after.json.subscription?.planId ?? "free").toBe("free");
  });

  it("lets the free plan through without one, once it is on offer", async () => {
    setFlag("free-tier", true);
    try {
      const res = await call("POST", "/api/subscription", { planId: "free", renewalConsent: null }, jordan);
      expect(res.status).toBe(200);
    } finally {
      resetFlags();
    }
  });

  it("does not let anybody sign up for Free while it is not offered", async () => {
    // Nothing paid, nothing subscribed: there is nothing to cancel, so this is
    // a sign-up for a plan that is off the shelf.
    const res = await call("POST", "/api/subscription", { planId: "free", renewalConsent: null }, jordan);
    expect(res.status).toBe(404);
    expect(res.json.error).toMatch(/not being offered/i);
  });

  it("still lets a paid subscriber stop paying by moving down to Free", async () => {
    // Cancelling has to stay one tap however the shelf is arranged. A plan
    // being withdrawn from sale must never trap somebody who already pays.
    const terms = await call("GET", "/api/billing/renewal-terms?planId=premium-basic&cadence=monthly", undefined, jordan);
    const joined = await call("POST", "/api/subscription", {
      planId: "premium-basic", cadence: "monthly", renewalConsent: { priceCents: terms.json.priceCents },
    }, jordan);
    expect(joined.status, JSON.stringify(joined.json)).toBe(200);
    const stopped = await call("POST", "/api/subscription", { planId: "free" }, jordan);
    expect(stopped.status, JSON.stringify(stopped.json)).toBe(200);
  });

  it("refuses an agreement to a price that is not the price", async () => {
    const res = await call("POST", "/api/subscription",
      { planId: "premium-basic", renewalConsent: { priceCents: 1 } }, jordan);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/price changed/i);
  });

  it("serves the terms the plan screen has to show, with the real first-charge date", async () => {
    const res = await call("GET", "/api/billing/renewal-terms?planId=premium-basic&cadence=monthly",
      undefined, jordan);
    expect(res.status).toBe(200);
    expect(res.json.required).toBe(true);
    expect(res.json.priceCents).toBe(findPlan("premium-basic").monthlyCents);
    // Nobody is charged before the service is running — the disclosure has to
    // say so rather than quoting signup plus a trial.
    expect(Date.parse(res.json.firstChargeAt)).toBeGreaterThanOrEqual(Date.parse(SERVICE_LIVE_AT));
  });

  it("says the free plan has nothing to disclose", async () => {
    const res = await call("GET", "/api/billing/renewal-terms?planId=free&cadence=monthly",
      undefined, jordan);
    expect(res.json.required).toBe(false);
    expect(res.json.priceCents).toBe(0);
  });

  it("records the agreement on the subscription, where it can be produced later", async () => {
    await call("POST", "/api/subscription", { planId: "premium-basic" }, jordan);
    const billing = await call("GET", "/api/billing", undefined, jordan);
    expect(billing.json.subscription.renewalTermsAcceptedAt).toBeTruthy();
  });
});

describe("watching one task change", () => {
  // Same fixture shape as the voice-message suite above: booking always hands
  // off in tests, so the task is seeded into the running server's own store.
  const taskId = "ct_watch1";
  const assistantId = "asst_watch1";

  beforeEach(() => {
    store.update((db) => {
      db.conciergeTasks.push({
        id: taskId, travelerId: samId, assistantId, category: "grab-something", note: "A coffee",
        location: { lat: 29.76, lng: -95.37 }, spendCapCents: 1000, serviceFeeCents: 500,
        assistantPayoutCents: 400, peopleCount: 1, status: "in-progress",
        provider: "Nearby Aide", providerTaskId: "provider-watch-1",
        chargeId: "ch_watch", holdId: "hold_watch",
        createdAt: clock.toISOString(),
      });
    });
  });

  it("serves one task, so an open thread need not pull every other one down", async () => {
    // The list route carries every task's identity selfies, receipts and
    // completion photos — all base64. A screen re-reading it every few
    // seconds would drag all of that along to learn one thing.
    const res = await call("GET", `/api/concierge/tasks/${taskId}`, undefined, sam);
    expect(res.status).toBe(200);
    expect(res.json.task.id).toBe(taskId);
  });

  it("shows the assistant's selfie once they have taken it", async () => {
    // What stops "No photo from them yet" being permanent on the customer's
    // screen: the popup re-reads this route, so the photo arrives without
    // anyone closing and reopening anything.
    const before = await call("GET", `/api/concierge/tasks/${taskId}`, undefined, sam);
    expect(before.json.task.identityPhotos?.assistant).toBeUndefined();

    const { cookie } = await assistantLogin(assistantId);
    const up = await call("POST", `/api/assistant/tasks/${taskId}/selfie`,
      { base64: "AAAA", mimeType: "image/png" }, null, cookie);
    expect(up.status).toBe(200);

    const after = await call("GET", `/api/concierge/tasks/${taskId}`, undefined, sam);
    expect(after.json.task.identityPhotos.assistant.base64).toBe("AAAA");
  });

  it("will not hand over somebody else's task, and does not admit it exists", async () => {
    const res = await call("GET", `/api/concierge/tasks/${taskId}`, undefined, jordan);
    expect(res.status).toBe(404);
  });

  it("needs a session like every other read here", async () => {
    expect((await call("GET", `/api/concierge/tasks/${taskId}`)).status).toBe(401);
  });
});
