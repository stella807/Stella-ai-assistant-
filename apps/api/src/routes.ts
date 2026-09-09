import {
  PLANS, REWARD_CATALOG, DRINK_CATALOG,
  activeGrantsFor, alcoholicDrinks, answerCheckIn, award, balance, buildRecoveryPlan,
  canRead, createGrant, deriveAlerts, estimateBac, hasFeature, leaderboard, logDrink, redeem,
  reportWorriedText, retimePendingCheckIn, revokeGrant, scheduleCheckIn, sosAlert, startWorriedTextRound,
  sweepMissedCheckIns, totalCalories, totalStandardDrinks,
  canActOnNight, canReadAccount, canReadScope, canRevokeGrant, canSeeGrant, claimGrant,
} from "@safehubby/core";
import type { Feature, NightOut } from "@safehubby/core";
import { mockDelivery, mockRides, mockRoutes, mockVenues } from "./adapters/mock-providers.ts";
import { newId, type Store } from "./store.ts";
import {
  RateLimiter, hashPassword, newSessionToken, normalizeEmail, SESSION_TTL_MS,
  validatePassword, verifyPassword,
} from "./auth.ts";

export class HttpError extends Error {
  status: number;

  // Written out longhand: Node's type-stripping mode does not support
  // TypeScript parameter properties, and this file runs under it directly.
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Route params are untrusted input; a missing one is a 400, never a crash. */
function req(params: Params, name: string): string {
  const value = params[name];
  if (!value) throw new HttpError(400, `Missing required parameter: ${name}`);
  return value;
}

export interface Ctx {
  store: Store;
  now: () => Date;
  /**
   * The authenticated user for this request, resolved from the session cookie
   * or bearer token by the server layer. Null when signed out. Routes must take
   * identity from here and never from the request body.
   */
  actorId: string | null;
  /** Set by a route to make the server emit or clear the session cookie. */
  setSession?: (token: string | null) => void;
  /** The presented session token, so logout can delete exactly this session. */
  sessionToken?: string | null;
  clientKey: string;
  /** Per-instance, not module-global: one server's traffic must not throttle
   *  another's, and tests need isolation between instances. */
  limiters: { login: RateLimiter; signup: RateLimiter };
}

const unauthorized = () => new HttpError(401, "Sign in to continue.");
const forbidden = () => new HttpError(403, "You do not have access to that.");

/** Every authenticated route starts here. */
function actor(ctx: Ctx): string {
  if (!ctx.actorId) throw unauthorized();
  return ctx.actorId;
}

/** Six characters from an unambiguous alphabet — no O/0, I/1 — read aloud in a bar. */
function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export function makeLimiters() {
  return {
    login: new RateLimiter(8, 15 * 60_000),
    signup: new RateLimiter(5, 60 * 60_000),
  };
}

function publicTraveler(t: { id: string; email: string; displayName: string; planId: string; homeLabel: string }) {
  // The password hash never leaves the server, even to its owner.
  return { id: t.id, email: t.email, displayName: t.displayName, planId: t.planId, homeLabel: t.homeLabel };
}

/** Feature gating lives at the API boundary so the UI cannot be the only guard. */
function requireFeature(ctx: Ctx, travelerId: string, feature: Feature): void {
  const traveler = ctx.store.data.travelers.find((t) => t.id === travelerId);
  if (!traveler) throw notFound("Traveler");
  if (!hasFeature(traveler.planId, feature)) {
    throw new HttpError(402, `Your plan does not include "${feature}". Upgrade to unlock it.`);
  }
}

function getNight(ctx: Ctx, nightId: string): NightOut {
  const night = ctx.store.data.nights.find((n) => n.id === nightId);
  if (!night) throw notFound("Night");
  return night;
}

/** A night the signed-in user owns. Anything else is a 404, not a 403 — a
 *  stranger should not be able to probe which night ids exist. */
function ownNight(ctx: Ctx, nightId: string): NightOut {
  const night = getNight(ctx, nightId);
  if (!canActOnNight(actor(ctx), night)) throw notFound("Night");
  return night;
}

/** Recomputes derived state (missed check-ins, new alerts) before any read. */
function refresh(ctx: Ctx, night: NightOut): NightOut {
  const now = ctx.now();
  ctx.store.update((db) => {
    const target = db.nights.find((n) => n.id === night.id)!;
    target.checkIns = sweepMissedCheckIns(target.checkIns, now);
    const raised = new Set(db.alerts.filter((a) => a.nightId === target.id).map((a) => a.id));
    db.alerts.push(...deriveAlerts({ night: target, now, alreadyRaised: raised }));
  });
  return getNight(ctx, night.id);
}

function nightSummary(ctx: Ctx, night: NightOut) {
  const now = ctx.now();
  const bac = estimateBac({ body: night.body, drinks: night.drinks, now });
  const pending = night.checkIns.find((c) => c.status === "pending");
  return {
    night,
    bac,
    stats: {
      alcoholicDrinks: alcoholicDrinks(night.drinks).length,
      standardDrinks: Math.round(totalStandardDrinks(night.drinks) * 10) / 10,
      calories: totalCalories(night.drinks),
      missedCheckIns: night.checkIns.filter((c) => c.status === "missed").length,
    },
    pendingCheckIn: pending ?? null,
    lastPing: night.pings.at(-1) ?? null,
    alerts: ctx.store.data.alerts.filter((a) => a.nightId === night.id),
  };
}

export type Params = Record<string, string | undefined>;

type Handler = (ctx: Ctx, params: Params, body: any) => Promise<unknown> | unknown;

export const routes: Record<string, Handler> = {
  "GET /api/health": () => ({ ok: true }),

  "POST /api/auth/signup": async (ctx, _p, body) => {
    if (ctx.limiters.signup.hit(ctx.clientKey)) throw new HttpError(429, "Too many sign-up attempts. Try again later.");
    const email = normalizeEmail(body?.email);
    if (!email) throw new HttpError(400, "Enter a valid email address.");
    const pwError = validatePassword(body?.password);
    if (pwError) throw new HttpError(400, pwError);
    const displayName = String(body?.displayName ?? "").trim();
    if (!displayName) throw new HttpError(400, "Enter the name your people will see.");
    if (ctx.store.data.travelers.some((t) => t.email === email)) {
      throw new HttpError(409, "An account already exists for that email.");
    }

    const traveler = {
      id: newId("usr"),
      email,
      passwordHash: await hashPassword(body.password),
      displayName,
      planId: "free" as const,
      homeLabel: String(body?.homeLabel ?? "Home"),
      emergencyContacts: [],
    };
    const token = newSessionToken();
    const now = ctx.now();
    ctx.store.update((db) => {
      db.travelers.push(traveler);
      db.sessions.push({
        token, userId: traveler.id, createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      });
    });
    ctx.setSession?.(token);
    return { traveler: publicTraveler(traveler) };
  },

  "POST /api/auth/login": async (ctx, _p, body) => {
    if (ctx.limiters.login.hit(ctx.clientKey)) throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    const email = normalizeEmail(body?.email);
    const traveler = email ? ctx.store.data.travelers.find((t) => t.email === email) : undefined;

    // Verify against a dummy hash when the account is unknown so response time
    // does not reveal which emails are registered.
    const hash = traveler?.passwordHash ?? "scrypt$00$00";
    const ok = await verifyPassword(String(body?.password ?? ""), hash);
    if (!traveler || !ok) throw new HttpError(401, "That email and password do not match.");

    const token = newSessionToken();
    const now = ctx.now();
    ctx.store.update((db) => {
      db.sessions.push({
        token, userId: traveler.id, createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      });
    });
    ctx.limiters.login.reset(ctx.clientKey);
    ctx.setSession?.(token);
    return { traveler: publicTraveler(traveler) };
  },

  "POST /api/auth/logout": (ctx, _p, _body) => {
    const token = ctx.sessionToken;
    if (token) ctx.store.update((db) => { db.sessions = db.sessions.filter((s) => s.token !== token); });
    ctx.setSession?.(null);
    return { ok: true };
  },

  "GET /api/auth/me": (ctx) => {
    if (!ctx.actorId) return { traveler: null };
    const t = ctx.store.data.travelers.find((x) => x.id === ctx.actorId);
    return { traveler: t ? publicTraveler(t) : null };
  },

  "GET /api/catalog": () => ({
    drinks: DRINK_CATALOG,
    plans: PLANS,
    rewards: REWARD_CATALOG,
  }),

  "GET /api/travelers/:travelerId": (ctx, p) => {
    const travelerId = req(p, "travelerId");
    if (!canReadAccount(actor(ctx), travelerId)) throw notFound("Traveler");
    const traveler = ctx.store.data.travelers.find((t) => t.id === travelerId);
    if (!traveler) throw notFound("Traveler");
    const entries = ctx.store.data.points[traveler.id] ?? [];
    const redemptions = ctx.store.data.redemptions[traveler.id] ?? [];
    return {
      traveler: publicTraveler(traveler),
      points: { balance: balance(entries, redemptions), entries, redemptions },
      grants: activeGrantsFor(ctx.store.data.grants, traveler.id, ctx.now()),
    };
  },

  "POST /api/nights": (ctx, _p, body) => {
    const travelerId = actor(ctx);
    const { weightKg, widmarkRatio, drinkLimit, homeAddressLabel } = body ?? {};
    if (!(weightKg > 0)) throw new HttpError(400, "weightKg must be a positive number");

    const now = ctx.now();
    const night: NightOut = {
      id: newId("night"),
      travelerId,
      startedAt: now.toISOString(),
      status: "active",
      body: { weightKg, widmarkRatio: widmarkRatio ?? 0.68 },
      drinks: [], checkIns: [], pings: [],
      drinkLimit: drinkLimit ?? 4,
      homeAddressLabel,
    };
    night.checkIns.push(scheduleCheckIn(night, now, newId("chk")));
    ctx.store.update((db) => void db.nights.push(night));
    return nightSummary(ctx, night);
  },

  "GET /api/nights/:nightId": (ctx, p) => nightSummary(ctx, refresh(ctx, ownNight(ctx, req(p, "nightId")))),

  "POST /api/nights/:nightId/drinks": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    const drink = logDrink({
      id: newId("drk"),
      drinkId: body?.drinkId,
      servings: body?.servings,
      loggedAt: ctx.now().toISOString(),
      venueId: body?.venueId,
      venueName: body?.venueName,
    });
    ctx.store.update((db) => {
      const target = db.nights.find((n) => n.id === night.id)!;
      target.drinks.push(drink);
      // A new drink can shorten the cadence; re-time the outstanding check-in
      // rather than waiting for the current one to come due.
      target.checkIns = retimePendingCheckIn(target, ctx.now());
      const reason = drink.category === "non-alcoholic" ? "loggedWaterBetweenDrinks" : "logDrink";
      (db.points[night.travelerId] ??= []).push(award(newId("pt"), reason, ctx.now(), drink.name));
    });
    return nightSummary(ctx, refresh(ctx, getNight(ctx, night.id)));
  },

  "POST /api/nights/:nightId/check-ins/:checkInId/answer": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    const checkIn = night.checkIns.find((c) => c.id === req(p, "checkInId"));
    if (!checkIn) throw notFound("Check-in");
    if (checkIn.status === "answered") throw new HttpError(409, "Check-in already answered");

    const now = ctx.now();
    ctx.store.update((db) => {
      const target = db.nights.find((n) => n.id === night.id)!;
      target.checkIns = answerCheckIn(target.checkIns, req(p, "checkInId"), now, body?.reportedDrinkIds ?? [], body?.feelingRating);
      if (target.status === "active") target.checkIns.push(scheduleCheckIn(target, now, newId("chk")));
      if (checkIn.status === "pending") {
        (db.points[night.travelerId] ??= []).push(award(newId("pt"), "checkInOnTime", now));
      }
    });
    return nightSummary(ctx, refresh(ctx, getNight(ctx, night.id)));
  },

  "POST /api/nights/:nightId/location": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    const { lat, lng, accuracyMeters, venueName } = body ?? {};
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new HttpError(400, "lat and lng are required numbers");
    }
    ctx.store.update((db) => {
      db.nights.find((n) => n.id === night.id)!.pings.push({
        lat, lng, accuracyMeters: accuracyMeters ?? 25, at: ctx.now().toISOString(), venueName,
      });
    });
    return nightSummary(ctx, getNight(ctx, night.id));
  },

  "POST /api/nights/:nightId/status": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    const status = body?.status as NightOut["status"];
    if (!["active", "heading-home", "home-safe", "ended"].includes(status)) {
      throw new HttpError(400, "Invalid status");
    }
    const now = ctx.now();
    ctx.store.update((db) => {
      const target = db.nights.find((n) => n.id === night.id)!;
      target.status = status;
      if (status === "home-safe" || status === "ended") {
        target.endedAt = now.toISOString();
        // Stop pinging the moment the night is over; the grant expiring on its
        // own is a backstop, not the primary way sharing ends.
        for (const g of db.grants) {
          if (g.travelerId === target.travelerId && !g.revokedAt) g.revokedAt = now.toISOString();
        }
      }
      if (status === "home-safe") {
        const entries = (db.points[target.travelerId] ??= []);
        entries.push(award(newId("pt"), "homeSafe", now));
        if (alcoholicDrinks(target.drinks).length <= target.drinkLimit) {
          entries.push(award(newId("pt"), "completedNightUnderLimit", now));
        }
      }
    });
    return nightSummary(ctx, refresh(ctx, getNight(ctx, night.id)));
  },

  "POST /api/nights/:nightId/sos": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    const alert = sosAlert(night, ctx.now(), Boolean(body?.silent));
    ctx.store.update((db) => void db.alerts.push(alert));
    return { alert, lastPing: night.pings.at(-1) ?? null };
  },

  "GET /api/nights/:nightId/recovery": (ctx, p, _body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    requireFeature(ctx, night.travelerId, "recovery-plan");
    const bac = estimateBac({ body: night.body, drinks: night.drinks, now: ctx.now() });
    const phase = night.status === "ended" || night.status === "home-safe" ? "next-morning" : "during";
    return buildRecoveryPlan(phase, bac);
  },

  "POST /api/grants": (ctx, _p, body) => {
    const travelerId = actor(ctx);
    const grant = createGrant({
      id: newId("grant"),
      travelerId,
      // Unclaimed: the guardian binds it to their own account with the code.
      guardianId: null,
      inviteCode: newInviteCode(),
      scopes: body?.scopes ?? ["location", "drinks", "check-ins"],
      now: ctx.now(),
      hours: body?.hours ?? 8,
      createdBy: travelerId,
    });
    ctx.store.update((db) => void db.grants.push(grant));
    return grant;
  },

  "POST /api/grants/claim": (ctx, _p, body) => {
    const guardianId = actor(ctx);
    const code = String(body?.inviteCode ?? "").trim().toUpperCase();
    const grant = ctx.store.data.grants.find((g) => g.inviteCode === code);
    // Same error whether the code is wrong or already spent, so the endpoint
    // cannot be used to enumerate live invites.
    if (!grant) throw new HttpError(404, "That code is not valid.");
    const claimed = claimGrant(grant, guardianId, ctx.now());
    ctx.store.update((db) => {
      const i = db.grants.findIndex((g) => g.id === grant.id);
      db.grants[i] = claimed;
    });
    return claimed;
  },

  "POST /api/grants/:grantId/revoke": (ctx, p, _body) => {
    const me = actor(ctx);
    const grant = ctx.store.data.grants.find((g) => g.id === req(p, "grantId"));
    if (!grant || !canSeeGrant(me, grant)) throw notFound("Grant");
    if (!canRevokeGrant(me, grant)) throw forbidden();
    const revoked = revokeGrant(grant, ctx.now(), me);
    ctx.store.update((db) => {
      const i = db.grants.findIndex((g) => g.id === req(p, "grantId"));
      db.grants[i] = revoked;
    });
    return revoked;
  },

  /** The guardian's view. Every field is gated on a live, scoped grant. */
  "GET /api/watch/:grantId": (ctx, p) => {
    const me = actor(ctx);
    const grant = ctx.store.data.grants.find((g) => g.id === req(p, "grantId"));
    if (!grant || grant.guardianId !== me) throw notFound("Grant");
    const now = ctx.now();
    const night = ctx.store.data.nights
      .filter((n) => n.travelerId === grant.travelerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!night) throw notFound("Night");

    refresh(ctx, night);
    const fresh = getNight(ctx, night.id);
    const summary = nightSummary(ctx, fresh);

    return {
      grant,
      sharingActive: canReadScope(me, grant, "location", now),
      traveler: ctx.store.data.travelers.find((t) => t.id === grant.travelerId) ?? null,
      night: {
        id: fresh.id,
        status: fresh.status,
        startedAt: fresh.startedAt,
        drinkLimit: fresh.drinkLimit,
        drinks: canReadScope(me, grant, "drinks", now) ? fresh.drinks : [],
        checkIns: canReadScope(me, grant, "check-ins", now) ? fresh.checkIns : [],
      },
      lastPing: canReadScope(me, grant, "location", now) ? summary.lastPing : null,
      bac: canReadScope(me, grant, "drinks", now) ? summary.bac : null,
      stats: summary.stats,
      alerts: summary.alerts,
    };
  },

  "GET /api/venues": async (ctx, _p, _b) => {
    const lat = Number(_p.lat ?? 40.714);
    const lng = Number(_p.lng ?? -74.003);
    return mockVenues.nearby({ lat, lng });
  },

  "POST /api/rides/quote": async (ctx, _p, body) => {
    requireFeature(ctx, actor(ctx), "ride-booking");
    return mockRides.quote({ pickup: body.pickup, dropoff: body.dropoff, waypoint: body.waypoint });
  },

  "POST /api/rides/book": async (ctx, _p, body) => {
    const travelerId = actor(ctx);
    requireFeature(ctx, travelerId, "ride-booking");
    const booking = await mockRides.book(
      { pickup: body.pickup, dropoff: body.dropoff, waypoint: body.waypoint },
      body.providerId,
    );
    ctx.store.update((db) => {
      (db.points[travelerId] ??= []).push(
        award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Booked a ride home"),
      );
    });
    return booking;
  },

  "GET /api/supplies": async (ctx, p) => mockDelivery.catalog({ lat: Number(p.lat ?? 40.714), lng: Number(p.lng ?? -74.003) }),

  "POST /api/supplies/order": async (ctx, _p, body) => {
    requireFeature(ctx, actor(ctx), "supply-delivery");
    return mockDelivery.order(body.items ?? [], { label: body.to ?? "Home" });
  },

  "POST /api/routes": async (ctx, _p, body) => {
    requireFeature(ctx, actor(ctx), "safe-routes");
    return mockRoutes.safeRoutes(body.from, body.to);
  },

  "POST /api/points/redeem": (ctx, _p, body) => {
    const travelerId = actor(ctx);
    const entries = ctx.store.data.points[travelerId] ?? [];
    const redemptions = ctx.store.data.redemptions[travelerId] ?? [];
    const r = redeem(body?.rewardId, entries, redemptions, newId("rdm"), ctx.now());
    ctx.store.update((db) => void (db.redemptions[travelerId] ??= []).push(r));
    return { redemption: r, balance: balance(entries, [...redemptions, r]) };
  },

  "POST /api/games/worried-text": (ctx, _p, body) => {
    requireFeature(ctx, actor(ctx), "group-games");
    const round = startWorriedTextRound(newId("round"), body?.players ?? [], ctx.now(), body?.forfeit);
    ctx.store.update((db) => void db.rounds.push(round));
    return round;
  },

  "POST /api/games/worried-text/:roundId/report": (ctx, p, body) => {
    const round = ctx.store.data.rounds.find((r) => r.id === req(p, "roundId"));
    if (!round) throw notFound("Round");
    const updated = reportWorriedText(round, body?.playerId, ctx.now());
    ctx.store.update((db) => {
      const i = db.rounds.findIndex((r) => r.id === req(p, "roundId"));
      db.rounds[i] = updated;
    });
    return updated;
  },

  /** Only the signed-in player and the people they share a live round with. */
  "GET /api/games/leaderboard": (ctx) => {
    const me = actor(ctx);
    const ids = new Set<string>([me]);
    for (const round of ctx.store.data.rounds) {
      if (round.players.some((p) => p.id === me)) for (const p of round.players) ids.add(p.id);
    }
    const players = ctx.store.data.travelers
      .filter((t) => ids.has(t.id))
      .map((t) => ({ id: t.id, displayName: t.displayName }));
    const points = Object.fromEntries(
      players.map((p) => [p.id, balance(ctx.store.data.points[p.id] ?? [], ctx.store.data.redemptions[p.id] ?? [])]),
    );
    return leaderboard(players, points);
  },
};
