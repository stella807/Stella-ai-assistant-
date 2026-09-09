import {
  PLANS, REWARD_CATALOG, DRINK_CATALOG,
  activeGrantsFor, alcoholicDrinks, answerCheckIn, award, balance, buildRecoveryPlan,
  canRead, createGrant, deriveAlerts, estimateBac, hasFeature, leaderboard, logDrink, redeem,
  retimePendingCheckIn, revokeGrant, scheduleCheckIn, sosAlert,
  sweepMissedCheckIns, totalCalories, totalStandardDrinks,
  canActOnNight, canReadAccount, canReadScope, canRevokeGrant, canSeeGrant, claimGrant,
  BASKETS, DEFAULT_CAP_CENTS, authorizeCarePackage, basketTotalCents, buildOrder, findBasket,
  shouldSendAutomatically,
  activeMembers, createCrew, crewView, everyoneHome, isCrewActive, isMember, joinCrew, leaveCrew,
  setSharesCount, findPlan, TRIAL_DAYS,
  GAMES, findGame, recordGuess, settleGuessTheTab, settleRound, settleWithWinner, startRound,
  PARTY_CATALOG, PARTY_CATEGORIES, suggestForGuests, summarizeCart,
  askableOrders, confirmOrder, declineOrder, queueOrder, sweepExpired,
  isEnabled, flagNote, ridesFor, deliverySearch, pharmacySearch,
  isAutomatic, SECURE_TRANSPORT_DISCLOSURES,
  RED_FLAGS, assess, assessNonEmergency, dispatcherScript, emergencyNumberFor,
  shouldPromptEmergencyCheck, totalStandardDrinks as sumStandardDrinks,
} from "@safehubby/core";
import type { CartLine, CrewMemberFacts, Feature, GameId, NightOut, OrderProvider, PlanId, RedFlagId, TriggerBand } from "@safehubby/core";
import { mockDelivery, mockRides, mockRoutes } from "./adapters/mock-providers.ts";
import { venues as venuePort, venueSource } from "./adapters/venues.ts";
import {
  deliveryDispatcher, fulfillmentStatus, secureTransport, uberCancel, uberEstimates, uberForBusiness,
} from "./adapters/fulfillment.ts";
import { walmartLink } from "./adapters/grocery.ts";
import { newId, type StoreLike } from "./store.ts";
import {
  RateLimiter, hashPassword, newSessionToken, normalizeEmail, SESSION_TTL_MS,
  validatePassword, verifyPassword,
} from "./auth.ts";
import { deleteAccount, exportAccount } from "./account.ts";

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
  store: StoreLike;
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

/** Plan and display name for the signed-in actor, used by the fulfilment paths. */
function planOf(ctx: Ctx, userId: string): PlanId {
  return (ctx.store.data.travelers.find((t) => t.id === userId)?.planId ?? "free") as PlanId;
}
function nameOf(ctx: Ctx, userId: string): string {
  return ctx.store.data.travelers.find((t) => t.id === userId)?.displayName ?? "Safehubby rider";
}
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
/** A release flag, distinct from a paid-plan feature. */
function requireFlag(flag: Parameters<typeof isEnabled>[0]): void {
  if (!isEnabled(flag)) throw new HttpError(404, flagNote(flag));
}

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

/**
 * A night the signed-in user owns.
 *
 * Identity is resolved *before* existence is checked, deliberately: doing it
 * the other way round lets an unauthenticated caller tell a real night id (401)
 * from a made-up one (404) and enumerate them. Signed in but not the owner is a
 * 404 rather than a 403, for the same reason.
 */
function ownNight(ctx: Ctx, nightId: string): NightOut {
  const me = actor(ctx);
  const night = getNight(ctx, nightId);
  if (!canActOnNight(me, night)) throw notFound("Night");
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

    // A pre-authorized pharmacy run goes out here, once, when the estimate
    // crosses the band the traveler set while sober.
    const care = db.carePackages[target.id];
    if (care) {
      const band = estimateBac({ body: target.body, drinks: target.drinks, now }).band;
      if (shouldSendAutomatically({ auth: care.auth, band, existingOrders: care.orders })) {
        care.orders.push(buildOrder(newId("cp"), care.auth!.basketId, care.auth!.deliverTo, "auto", now));
      }
    }
  });
  return getNight(ctx, night.id);
}

/**
 * Care-package state, plus how it can actually be fulfilled.
 *
 * With no pharmacy or delivery partnership there is no way to place the order,
 * so the run "prepares" a basket and hands off to the store rather than
 * charging a card it cannot charge. Prices are the store's list prices and are
 * labelled approximate — the real total is whatever the store rings up.
 */
function carePackageState(ctx: Ctx, nightId: string) {
  const state = ctx.store.data.carePackages[nightId] ?? { auth: null, orders: [] };
  const ordered = isAutomatic(deliveryDispatcher().status) || isEnabled("pharmacy-ordering-api");
  return {
    ...state,
    mode: ordered ? "ordered" : "prepared",
    note: ordered ? null : deliveryDispatcher().status.requires,
    // Walmart is the tracked fallback when no fulfiller is configured; it
    // earns commission and needs no approval, unlike a bare pharmacy search.
    handoff: ordered ? null : walmartLink("electrolytes water crackers"),
  };
}

function crewFacts(ctx: Ctx, travelerIds: string[], now: Date): CrewMemberFacts[] {
  return travelerIds.map((travelerId) => {
    const night = ctx.store.data.nights
      .filter((n) => n.travelerId === travelerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!night) return { travelerId, drinks: 0, missedCheckIns: 0, nightStatus: "none" as const };
    return {
      travelerId,
      drinks: alcoholicDrinks(night.drinks).length,
      missedCheckIns: sweepMissedCheckIns(night.checkIns, now).filter((c) => c.status === "missed").length,
      nightStatus: night.status,
    };
  });
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
    carePackage: carePackageState(ctx, night.id),
    promptEmergencyCheck: shouldPromptEmergencyCheck(
      bac.band,
      night.checkIns.filter((c) => c.status === "missed").length,
    ),
  };
}

export type Params = Record<string, string | undefined>;

type Handler = (ctx: Ctx, params: Params, body: any) => Promise<unknown> | unknown;

export const routes: Record<string, Handler> = {
  "GET /api/health": () => ({ ok: true, venueSource }),

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

  /**
   * Everything held about the signed-in person. Right of access, and the thing
   * that makes deletion a decision rather than a leap.
   */
  "GET /api/account/export": (ctx) => exportAccount(ctx.store.data, actor(ctx), ctx.now()),

  /**
   * Permanent erasure. Required by App Store guideline 5.1.1(v) and by the
   * right to erasure. Re-authentication is required: a borrowed unlocked phone
   * should not be able to destroy someone's account, and anyone being coerced
   * has one more moment to stop.
   */
  "POST /api/account/delete": async (ctx, _p, body) => {
    const me = actor(ctx);
    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    if (!traveler) throw notFound("Traveler");

    if (ctx.limiters.login.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many attempts. Try again later.");
    }
    const ok = await verifyPassword(String(body?.password ?? ""), traveler.passwordHash);
    if (!ok) throw new HttpError(401, "That password is not right.");
    if (String(body?.confirm ?? "").trim().toUpperCase() !== "DELETE") {
      throw new HttpError(400, 'Type DELETE to confirm.');
    }

    let summary!: ReturnType<typeof deleteAccount>;
    ctx.store.update((db) => { summary = deleteAccount(db, me, ctx.now()); });
    ctx.setSession?.(null);
    return {
      deleted: true,
      summary,
      note: "Your account and everything on it are gone. Location history cannot be recovered.",
    };
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

  /** The signed-in user's night in progress, so a reload or a new device picks
   *  the evening back up instead of offering to start a second one. */
  "GET /api/nights/current": (ctx) => {
    const me = actor(ctx);
    const night = ctx.store.data.nights
      .filter((n) => n.travelerId === me && n.status !== "ended" && n.status !== "home-safe")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!night) return { night: null };
    return nightSummary(ctx, refresh(ctx, night));
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

  /* ---------------- crew: buddies out together ---------------- */

  "POST /api/crews": (ctx, _p, body) => {
    const me = actor(ctx);
    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    if (!traveler) throw notFound("Traveler");
    const crew = createCrew({
      id: newId("crew"),
      name: String(body?.name ?? "Tonight"),
      joinCode: newInviteCode(),
      createdBy: me,
      displayName: traveler.displayName,
      now: ctx.now(),
      hours: body?.hours,
    });
    ctx.store.update((db) => void db.crews.push(crew));
    return crew;
  },

  "POST /api/crews/join": (ctx, _p, body) => {
    const me = actor(ctx);
    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    if (!traveler) throw notFound("Traveler");
    const code = String(body?.joinCode ?? "").trim().toUpperCase();
    const crew = ctx.store.data.crews.find((c) => c.joinCode === code);
    if (!crew) throw new HttpError(404, "That code is not valid.");
    const joined = joinCrew(crew, me, traveler.displayName, ctx.now());
    ctx.store.update((db) => {
      const i = db.crews.findIndex((c) => c.id === crew.id);
      db.crews[i] = joined;
    });
    return joined;
  },

  /** Crew state. Members only — a join code is not a spectator pass. */
  "GET /api/crews/:crewId": (ctx, p) => {
    const me = actor(ctx);
    const crew = ctx.store.data.crews.find((c) => c.id === req(p, "crewId"));
    if (!crew || !isMember(crew, me)) throw notFound("Crew");
    const now = ctx.now();
    const members = crewView(crew, crewFacts(ctx, activeMembers(crew).map((m) => m.travelerId), now));
    return { crew, members, everyoneHome: everyoneHome(members), active: isCrewActive(crew, now) };
  },

  "GET /api/crews": (ctx) => {
    const me = actor(ctx);
    const now = ctx.now();
    return ctx.store.data.crews.filter((c) => isMember(c, me) && isCrewActive(c, now));
  },

  "POST /api/crews/:crewId/leave": (ctx, p) => {
    const me = actor(ctx);
    const crew = ctx.store.data.crews.find((c) => c.id === req(p, "crewId"));
    if (!crew || !isMember(crew, me)) throw notFound("Crew");
    const left = leaveCrew(crew, me, ctx.now());
    ctx.store.update((db) => {
      const i = db.crews.findIndex((c) => c.id === crew.id);
      db.crews[i] = left;
    });
    return left;
  },

  /** Opt in or out of showing your count to the table. Yourself only. */
  "POST /api/crews/:crewId/share-count": (ctx, p, body) => {
    const me = actor(ctx);
    const crew = ctx.store.data.crews.find((c) => c.id === req(p, "crewId"));
    if (!crew || !isMember(crew, me)) throw notFound("Crew");
    const updated = setSharesCount(crew, me, Boolean(body?.sharesCount));
    ctx.store.update((db) => {
      const i = db.crews.findIndex((c) => c.id === crew.id);
      db.crews[i] = updated;
    });
    return updated;
  },

  /* ---------------- pharmacy run ---------------- */

  "GET /api/care-package/baskets": () => ({ baskets: BASKETS, defaultCapCents: DEFAULT_CAP_CENTS }),

  "POST /api/nights/:nightId/care-package/authorize": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    requireFeature(ctx, night.travelerId, "supply-delivery");
    const now = ctx.now();
    const auth = authorizeCarePackage({
      basketId: body?.basketId ?? "hydration",
      capCents: body?.capCents ?? DEFAULT_CAP_CENTS,
      triggerBand: (body?.triggerBand ?? "high") as TriggerBand,
      deliverTo: String(body?.deliverTo ?? night.homeAddressLabel ?? ""),
      now,
      // Checked against the live estimate: an impaired person cannot authorize
      // spending, so this refuses rather than accepting a late opt-in.
      currentBand: estimateBac({ body: night.body, drinks: night.drinks, now }).band,
    });
    ctx.store.update((db) => {
      const state = (db.carePackages[night.id] ??= { auth: null, orders: [] });
      state.auth = auth;
    });
    return carePackageState(ctx, night.id);
  },

  "POST /api/nights/:nightId/care-package/cancel": (ctx, p) => {
    const night = ownNight(ctx, req(p, "nightId"));
    ctx.store.update((db) => {
      const state = (db.carePackages[night.id] ??= { auth: null, orders: [] });
      state.auth = state.auth ? { ...state.auth, enabled: false } : null;
    });
    return carePackageState(ctx, night.id);
  },

  /**
   * Send one by hand. The traveler can do this for themselves; so can the
   * guardian, who is sober and paying — which is why this path needs no
   * pre-authorization.
   */
  "POST /api/nights/:nightId/care-package/send": (ctx, p, body) => {
    const me = actor(ctx);
    const night = getNight(ctx, req(p, "nightId"));
    const mine = canActOnNight(me, night);
    const asGuardian = ctx.store.data.grants.some(
      (g) => g.travelerId === night.travelerId && g.guardianId === me && !g.revokedAt,
    );
    if (!mine && !asGuardian) throw notFound("Night");

    const basket = findBasket(body?.basketId ?? "hydration");
    const order = buildOrder(
      newId("cp"), basket.id,
      String(body?.deliverTo ?? night.homeAddressLabel ?? "Home"),
      mine ? "traveler" : "guardian",
      ctx.now(),
    );
    ctx.store.update((db) => {
      const state = (db.carePackages[night.id] ??= { auth: null, orders: [] });
      state.orders.push(order);
    });
    return { order, totalCents: basketTotalCents(basket) };
  },

  /* ---------------- subscription ---------------- */

  /**
   * Switches the plan. Billing is NOT connected — no card is taken and nothing
   * is charged. Kept explicit in the response so no caller can mistake this
   * for a completed purchase.
   */
  "POST /api/subscription": (ctx, _p, body) => {
    const me = actor(ctx);
    const planId = body?.planId as PlanId;
    const cadence = body?.cadence === "annual" ? "annual" : "monthly";
    const plan = findPlan(planId);
    ctx.store.update((db) => {
      const traveler = db.travelers.find((t) => t.id === me)!;
      traveler.planId = plan.id;
    });
    return {
      plan,
      cadence,
      trialDays: TRIAL_DAYS,
      billingConnected: false,
      note: "Plan switched. Billing is not connected in this build — no payment method was taken and nothing was charged.",
    };
  },

  "GET /api/venues": async (ctx, _p, _b) => {
    const lat = Number(_p.lat ?? 40.714);
    const lng = Number(_p.lng ?? -74.003);
    return venuePort.nearby({ lat, lng });
  },

  /**
   * Hand-off links, not quotes.
   *
   * Uber and Lyft both closed their public ride APIs to third-party developers,
   * so nothing outside a formal partnership can book a ride or read a fare.
   * Returning invented fares would be a lie told on the screen where the user
   * is least able to check it, so this returns links that open the real app
   * with the destination filled in, and says so.
   */
  "POST /api/rides/quote": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "ride-booking");
    const dropoff = { lat: body?.dropoff?.lat, lng: body?.dropoff?.lng, label: body?.dropoff?.label };
    const automatic = isAutomatic(uberForBusiness.status) && hasFeature(planOf(ctx, me), "automatic-rides");

    // Secure transport is offered only where the provider says it operates.
    let secure = null;
    if (hasFeature(planOf(ctx, me), "secure-transport") && isAutomatic(secureTransport.status)) {
      secure = await secureTransport
        .quote({ pickup: body.pickup, dropoff, riderName: nameOf(ctx, me) })
        .catch(() => null);
    }

    if (automatic) {
      // Real fares, from Uber's own estimates endpoint. Safehubby still never
      // computes one — it displays what the provider quoted.
      const estimates = await uberEstimates({
        pickup: body.pickup, dropoff, riderName: nameOf(ctx, me),
      }).catch(() => []);
      return { mode: "automatic", provider: uberForBusiness.status.name, estimates, secure };
    }
    return {
      mode: "handoff",
      note: uberForBusiness.status.requires,
      handoffs: ridesFor(dropoff),
      secure,
    };
  },

  /** Cancels a booked ride, so a change of plan does not leave a car waiting. */
  "POST /api/rides/:tripId/cancel": async (ctx, p) => {
    actor(ctx);
    await uberCancel(req(p, "tripId"));
    return { cancelled: true };
  },

  /** What is switched on, and what each missing piece needs. */
  "GET /api/fulfillment/status": (ctx) => {
    actor(ctx);
    const { rides, delivery, walmart, secureTransport: secure } = fulfillmentStatus();
    return { rides, delivery, walmart, secureTransport: secure, disclosures: SECURE_TRANSPORT_DISCLOSURES };
  },

  /**
   * Books a secure-transport trip. Separate from the ordinary ride route
   * because it is a different product with different law behind it, and
   * because the disclosures must be acknowledged first — a passenger who did
   * not realise their driver is armed is in a situation they did not consent to.
   */
  "POST /api/rides/secure": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "secure-transport");
    // Validate the request before checking whether the service can run it: a
    // malformed booking is a 400 whether or not a provider happens to be up.
    if (body?.acknowledgedDisclosures !== true) {
      throw new HttpError(400, "The disclosures have to be acknowledged before booking.");
    }
    if (!isAutomatic(secureTransport.status)) {
      throw new HttpError(503, secureTransport.status.requires);
    }

    const booked = await secureTransport.book({
      pickup: body.pickup,
      dropoff: body.dropoff,
      riderName: nameOf(ctx, me),
      riderPhone: body?.phone,
      note: body?.note,
    });
    ctx.store.update((db) => {
      (db.points[me] ??= []).push(award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Secure ride home"));
    });
    return booked;
  },

  /** Records that a ride was taken instead of driving; the booking happens in
   *  the provider's own app until an API partnership exists. */
  "POST /api/rides/book": async (ctx, _p, body) => {
    const travelerId = actor(ctx);
    requireFeature(ctx, travelerId, "ride-booking");

    // Automatic: Safehubby books it on their behalf and the car is actually
    // coming. Only claimed when the provider really answered.
    if (isAutomatic(uberForBusiness.status) && hasFeature(planOf(ctx, travelerId), "automatic-rides")) {
      const booked = await uberForBusiness.book({
        pickup: body.pickup,
        dropoff: body.dropoff,
        riderName: nameOf(ctx, travelerId),
        riderPhone: body?.phone,
        note: body?.note,
      });
      ctx.store.update((db) => {
        (db.points[travelerId] ??= []).push(
          award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Booked a ride home"),
        );
      });
      return { mode: "automatic", ...booked };
    }

    if (!isEnabled("ride-booking-api")) {
      ctx.store.update((db) => {
        (db.points[travelerId] ??= []).push(
          award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Took a ride home"),
        );
      });
      return { mode: "handoff", recorded: true, note: flagNote("ride-booking-api") };
    }
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

  /**
   * Builds the basket for real.
   *
   * With Instacart configured this returns a cart that is already assembled —
   * the customer taps once to check out. The basket is put together by the app
   * rather than typed by someone at 1am, which is the whole point; the payment
   * still happens in their account, which keeps the consent rule intact.
   */
  "POST /api/supplies/order": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "supply-delivery");
    const dispatcher = deliveryDispatcher();
    const to = String(body?.to ?? "Home");

    const items = (body?.items ?? []).map((i: { id: string; qty?: number; name?: string; priceCents?: number }) => ({
      sku: i.id,
      name: i.name ?? i.id,
      qty: i.qty ?? 1,
      priceCents: i.priceCents ?? 0,
    }));

    if (isAutomatic(dispatcher.status)) {
      try {
        const dispatched = await dispatcher.dispatch({ items, dropoff: { label: to } });
        return { mode: "cart-ready", ...dispatched };
      } catch (err) {
        // A provider outage must not swallow the request silently; fall back to
        // the tracked link and say what happened.
        return {
          mode: "handoff",
          provider: dispatcher.status.name,
          error: err instanceof Error ? err.message : "Provider unavailable",
          handoff: walmartLink(items.map((i: { name: string }) => i.name).join(" ") || "electrolytes water"),
        };
      }
    }

    return {
      mode: "handoff",
      note: dispatcher.status.requires,
      handoff: walmartLink(items.map((i: { name: string }) => i.name).join(" ") || "electrolytes water"),
    };
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

  /* ---------------- medical escalation ----------------
     Never plan-gated, and deliberately not part of the ride picker: a rideshare
     is not an ambulance, and an app that blurs the two costs the minutes that
     matter. */

  "GET /api/emergency": (ctx, p) => {
    const region = typeof p.region === "string" ? p.region : null;
    return {
      redFlags: RED_FLAGS,
      emergency: emergencyNumberFor(region),
      // Said plainly rather than implied, so no client can render a softer
      // version of it.
      notAnAmbulanceService:
        "Safehubby cannot dispatch an ambulance. Call your local emergency number — a rideshare is not emergency medical transport.",
    };
  },

  "POST /api/nights/:nightId/emergency/assess": (ctx, p, body) => {
    const me = actor(ctx);
    const night = getNight(ctx, req(p, "nightId"));
    const asGuardian = ctx.store.data.grants.some(
      (g) => g.travelerId === night.travelerId && g.guardianId === me && !g.revokedAt,
    );
    if (!canActOnNight(me, night) && !asGuardian) throw notFound("Night");

    const checked = (body?.flags ?? []) as RedFlagId[];
    const assessment = checked.length > 0 || body?.emergency
      ? assess(checked)
      : assessNonEmergency(body?.concerns ?? []);

    const now = ctx.now();
    const emergency = emergencyNumberFor(body?.region ?? null);
    const ping = night.pings.at(-1) ?? null;
    const hours = (now.getTime() - new Date(night.startedAt).getTime()) / 3_600_000;

    return {
      assessment,
      emergency,
      script: assessment.escalation === "call-emergency"
        ? dispatcherScript({
            emergencyNumber: emergency?.number ?? null,
            locationLabel: ping?.venueName ?? night.homeAddressLabel ?? null,
            lat: ping?.lat,
            lng: ping?.lng,
            standardDrinks: sumStandardDrinks(night.drinks),
            hoursDrinking: hours,
            flagged: assessment.flagged,
          })
        : [],
    };
  },

  /**
   * A ride to urgent care — the legitimate rideshare use, for someone who needs
   * looking at but is not in danger. Kept on its own route so it can never be
   * mistaken for, or rendered alongside, an emergency response.
   */
  "POST /api/rides/urgent-care": async (ctx, _p, body) => {
    const travelerId = actor(ctx);
    requireFeature(ctx, travelerId, "ride-booking");
    const quotes = await mockRides.quote({ pickup: body.pickup, dropoff: body.dropoff });
    return {
      quotes,
      warning:
        "For anything life-threatening call your local emergency number instead. This is a normal ride, with a normal driver.",
    };
  },

  /* ---------------- games ---------------- */

  "GET /api/games": () => ({ games: GAMES }),

  "POST /api/games/rounds": (ctx, _p, body) => {
    requireFeature(ctx, actor(ctx), "group-games");
    const round = startRound(newId("round"), body?.gameId as GameId, body?.players ?? [], ctx.now());
    ctx.store.update((db) => void db.rounds.push(round));
    return round;
  },

  "GET /api/games/rounds": (ctx) => {
    const me = actor(ctx);
    return ctx.store.data.rounds.filter((r) => r.players.some((p) => p.id === me));
  },

  /** Settles on the first report; later reports are ignored, not applied. */
  "POST /api/games/rounds/:roundId/settle": (ctx, p, body) => {
    const me = actor(ctx);
    const roundId = req(p, "roundId");
    const round = ctx.store.data.rounds.find((r) => r.id === roundId);
    if (!round || !round.players.some((x) => x.id === me)) throw notFound("Round");

    const game = findGame(round.gameId);
    let updated = round;
    if (round.gameId === "guess-the-tab") {
      updated = settleGuessTheTab(round, Number(body?.actualStandardDrinks ?? 0), ctx.now());
    } else if (game.id === "ride-home-race" || game.id === "last-one-standing") {
      updated = settleWithWinner(round, String(body?.winnerId ?? ""), ctx.now());
    } else {
      updated = settleRound(round, String(body?.loserId ?? ""), ctx.now());
    }

    ctx.store.update((db) => {
      const i = db.rounds.findIndex((r) => r.id === roundId);
      db.rounds[i] = updated;
      // The winner takes the game's reward; nobody is ever paid for drinking.
      if (updated.winnerId) {
        (db.points[updated.winnerId] ??= []).push(
          award(newId("pt"), "completedNightUnderLimit", ctx.now(), `Won ${game.name}`),
        );
      }
    });
    return updated;
  },

  "POST /api/games/rounds/:roundId/guess": (ctx, p, body) => {
    const me = actor(ctx);
    const roundId = req(p, "roundId");
    const round = ctx.store.data.rounds.find((r) => r.id === roundId);
    if (!round || !round.players.some((x) => x.id === me)) throw notFound("Round");

    const night = ctx.store.data.nights
      .filter((n) => n.travelerId === me)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const drinksLogged = night ? alcoholicDrinks(night.drinks).length : 0;

    const updated = recordGuess(round, me, Number(body?.guess), drinksLogged);
    ctx.store.update((db) => {
      const i = db.rounds.findIndex((r) => r.id === roundId);
      db.rounds[i] = updated;
    });
    return updated;
  },

  /* ---------------- food orders, confirmed sober ---------------- */

  /**
   * Queues a delivery order. Nothing is charged here: the order sits until the
   * estimate says the person can actually decide about spending money, which in
   * practice means the next morning.
   */
  "POST /api/orders": (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "supply-delivery");
    const order = queueOrder({
      id: newId("ord"),
      provider: (body?.provider ?? "doordash") as OrderProvider,
      vendorName: String(body?.vendorName ?? "Local kitchen"),
      lines: body?.lines ?? [],
      deliverTo: String(body?.deliverTo ?? "Home"),
      now: ctx.now(),
      queuedBecause: String(body?.queuedBecause ?? "You lined this up during a night out."),
    });
    ctx.store.update((db) => void (db.pendingOrders[me] ??= []).push(order));
    return order;
  },

  /**
   * The notification payload: what to ask, and whether now is the moment. The
   * client polls this; a production build pushes it instead.
   */
  "GET /api/orders/pending": (ctx) => {
    const me = actor(ctx);
    const now = ctx.now();
    ctx.store.update((db) => {
      db.pendingOrders[me] = sweepExpired(db.pendingOrders[me] ?? [], now);
    });

    const night = ctx.store.data.nights
      .filter((n) => n.travelerId === me)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const band = night
      ? estimateBac({ body: night.body, drinks: night.drinks, now }).band
      : "none";

    const all = ctx.store.data.pendingOrders[me] ?? [];
    return { band, askNow: askableOrders(all, band, now), waiting: all.filter((o) => o.status === "waiting") };
  },

  "POST /api/orders/:orderId/confirm": (ctx, p) => {
    const me = actor(ctx);
    const orderId = req(p, "orderId");
    const orders = ctx.store.data.pendingOrders[me] ?? [];
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw notFound("Order");

    const now = ctx.now();
    const night = ctx.store.data.nights
      .filter((n) => n.travelerId === me)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    const band = night ? estimateBac({ body: night.body, drinks: night.drinks, now }).band : "none";

    const updated = confirmOrder(order, band, now);
    ctx.store.update((db) => {
      const list = db.pendingOrders[me]!;
      list[list.findIndex((o) => o.id === orderId)] = updated;
    });
    return updated;
  },

  "POST /api/orders/:orderId/decline": (ctx, p) => {
    const me = actor(ctx);
    const orderId = req(p, "orderId");
    const orders = ctx.store.data.pendingOrders[me] ?? [];
    const order = orders.find((o) => o.id === orderId);
    if (!order) throw notFound("Order");
    const updated = declineOrder(order, ctx.now());
    ctx.store.update((db) => {
      const list = db.pendingOrders[me]!;
      list[list.findIndex((o) => o.id === orderId)] = updated;
    });
    return updated;
  },

  /* ---------------- party supply ---------------- */

  "GET /api/party/catalog": () => { requireFlag("party-supply"); return { categories: PARTY_CATEGORIES, items: PARTY_CATALOG }; },

  "GET /api/party/suggest": (ctx, p) => {
    requireFlag("party-supply");
    const guests = Number(p.guests ?? 12);
    const lines = suggestForGuests(guests);
    return { guests, lines, summary: summarizeCart(lines) };
  },

  "GET /api/party/cart": (ctx) => {
    requireFlag("party-supply");
    const me = actor(ctx);
    const lines = ctx.store.data.partyCarts[me] ?? [];
    return { lines, summary: summarizeCart(lines) };
  },

  "POST /api/party/cart": (ctx, _p, body) => {
    requireFlag("party-supply");
    const me = actor(ctx);
    const lines = (body?.lines ?? []) as CartLine[];
    // summarizeCart validates every sku, so a bad cart is rejected before it is
    // stored rather than blowing up on the next read.
    const summary = summarizeCart(lines);
    ctx.store.update((db) => { db.partyCarts[me] = lines; });
    return { lines, summary };
  },

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
