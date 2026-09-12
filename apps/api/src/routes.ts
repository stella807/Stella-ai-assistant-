import {
  PLANS, REWARD_CATALOG, DRINK_CATALOG,
  activeGrantsFor, alcoholicDrinks, answerCheckIn, award, balance, buildRecoveryPlan,
  createGrant, deriveAlerts, estimateBac, hasFeature, leaderboard, logDrink, redeem,
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
  isEnabled, flagNote, ridesFor,
  isAutomatic, SECURE_TRANSPORT_DISCLOSURES,
  RED_FLAGS, assess, assessNonEmergency, dispatcherScript, emergencyNumberFor,
  shouldPromptEmergencyCheck, totalStandardDrinks as sumStandardDrinks,
  validateBody, validateDrinkLimit,
  attachPaymentMethod, authorizeExactHold, authorizeHold, canBookAutomatically, captureHold, releaseHold,
  CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES, conciergeCategoryLabel, validateConciergeRequest,
  isAssistantAvailable, recordVoiceMessage, voiceMessagesFor, serviceFeeFor, totalChargeCents,
  isQuickTaskEligible, validateIdentityPhoto,
  earningsFor, previousPayoutPeriod, totalEarningsCents, unpaidEarningsCents, validatePayoutDestination,
  isInLaunchMarket, launchMarketNames,
  buildStatement, chargesFor, describeRail, failCharge, recordCharge, settleCharge,
  kindLabel, railsUsed,
  cancelSubscription, changePlan, describeSubscription, effectivePlan, startSubscription,
  devicesFor, registerDevice, upsertDevice,
  submitApplication, reviewApplication, withdrawApplication,
} from "@safehubby/core";
import type {
  Alert, ApplicationStatus, AssistantProfile, Basket, Cadence, CartLine, ChargeKind, ConciergeCategory,
  ConciergeTask, CrewMemberFacts, DriverTier, Feature, GameId, IdentityPhoto, NightOut,
  OrderProvider, Platform, PlanId, RedFlagId, Subscription, TriggerBand,
} from "@safehubby/core";
import { mockDelivery, mockRides, mockRoutes } from "./adapters/mock-providers.ts";
import { venues as venuePort, venueSource } from "./adapters/venues.ts";
import {
  concierge, deliveryDispatcher, fulfillmentStatus, secureTransport, uberCancel, uberEstimates,
  uberForBusiness,
} from "./adapters/fulfillment.ts";
import { revolutCards } from "./adapters/cards.ts";
import { revolutPayouts } from "./adapters/payouts.ts";
import { placeSearch } from "./adapters/places-search.ts";
import { buildStoreNote, storeLocator, walmartLink } from "./adapters/grocery.ts";
import { push } from "./adapters/push.ts";
import { guardianMessages } from "./notify.ts";
import { renewDueSubscriptions } from "./billing.ts";
import { newId, type StoreLike } from "./store.ts";
import {
  ASSISTANT_SESSION_TTL_MS, RateLimiter, hashPassword, newSessionToken, newTempPassword, normalizeEmail,
  SESSION_TTL_MS, sweepExpiredSessions, validatePassword, verifyPassword,
} from "./auth.ts";
import { cipherFromEnv, openPayoutDestination, sealPayoutDestination } from "./crypto.ts";
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
  /**
   * The signed-in assistant for this request (the employee portal),
   * resolved from an entirely separate cookie and session table — see
   * `AssistantSession` in store.ts. Never conflated with `actorId`: an
   * assistant is not a traveler, and the two identity spaces share nothing.
   */
  assistantActorId: string | null;
  setAssistantSession?: (token: string | null) => void;
  assistantSessionToken?: string | null;
  clientKey: string;
  /** Per-instance, not module-global: one server's traffic must not throttle
   *  another's, and tests need isolation between instances. */
  limiters: {
    login: RateLimiter; assistantLogin: RateLimiter; signup: RateLimiter; applications: RateLimiter;
    codes: RateLimiter; places: RateLimiter;
  };
  /** The one header a route needs directly: the admin key, checked constant-time
   *  against SAFEHUBBY_ADMIN_KEY rather than a session, since driver-application
   *  review has no per-account identity to hang a role off yet. */
  adminKey: string | null;
  /** The concierge partner network's shared secret, for the one inbound
   *  webhook a partner calls rather than us calling them — see
   *  requirePartnerNetwork below. Not a session; the caller is a server, not
   *  a signed-in traveler. */
  partnerKey: string | null;
}

const unauthorized = () => new HttpError(401, "Sign in to continue.");

/** What actually happened to the user's money, said plainly. */
function noteFor(sub: Subscription, rail: string | null, dueCents: number): string {
  if (sub.planId === "free") return "You are on the free plan. Nothing is charged.";
  if (sub.status === "trialing") {
    // Same date format describeSubscription uses: two spellings of the same
    // day on one screen reads like two different dates.
    const when = new Date(sub.currentPeriodEnd)
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return `Free for ${TRIAL_DAYS} days. Nothing has been charged — the first payment is on ${when}.`;
  }
  if (dueCents === 0) return "Plan changed. Nothing owed — the part of this period you already paid for covers it.";
  if (rail === "card") return `Plan changed. $${(dueCents / 100).toFixed(2)} charged to your card, with any unused part of the old period credited.`;
  return `Plan changed. $${(dueCents / 100).toFixed(2)} is due through the store's billing; confirm the purchase to finish.`;
}

/** Plan and display name for the signed-in actor, used by the fulfilment paths. */
function planOf(ctx: Ctx, userId: string): PlanId {
  return (ctx.store.data.travelers.find((t) => t.id === userId)?.planId ?? "free") as PlanId;
}
function nameOf(ctx: Ctx, userId: string): string {
  return ctx.store.data.travelers.find((t) => t.id === userId)?.displayName ?? "Safehubby rider";
}
const forbidden = () => new HttpError(403, "You do not have access to that.");

/**
 * Whether a live, unexpired card is on file for automatic booking. Checked
 * against the same instant a hold would be authorized at — a card can expire
 * between requests, and the check has to be live, not cached at login.
 */
function hasLivePaymentMethod(ctx: Ctx, userId: string): boolean {
  const method = ctx.store.data.paymentMethods[userId] ?? null;
  return canBookAutomatically(method !== null, method, ctx.now());
}

function requirePaymentMethod(ctx: Ctx, userId: string): void {
  if (!hasLivePaymentMethod(ctx, userId)) {
    throw new HttpError(
      402,
      "Add a payment method before Safehubby can book this automatically. Nothing is charged until a trip is actually booked.",
    );
  }
}

/**
 * The platform the request came from, which decides the rail a subscription
 * settles on (see wallet.ts).
 *
 * Self-reported, and it has to be: only the client knows whether it is running
 * inside the App Store build. A client that lied would be routing an in-app
 * subscription around Apple's billing — which is the operator's compliance
 * problem, not a way to take a user's money twice or reach anyone else's data,
 * so it is not a boundary worth failing requests over. It is stored on the
 * subscription so the rail is auditable after the fact.
 */
function platformFrom(value: unknown): Platform {
  return value === "ios" || value === "android" ? value : "web";
}

/**
 * Turns over any period that has run out before answering a billing question.
 *
 * The hourly sweep in main.ts catches accounts nobody touches, but it cannot be
 * the only thing that renews: a trial that ended an hour ago has to be over the
 * moment the user opens the billing screen, not whenever a timer next fires.
 * Doing it on read as well as on a timer means the answer is the same either
 * way, which is also what makes it testable without a clock running.
 */
function catchUpBilling(ctx: Ctx): void {
  ctx.store.update((db) => void renewDueSubscriptions(db, ctx.now()));
}

function subscriptionOf(ctx: Ctx, userId: string): Subscription | null {
  return ctx.store.data.subscriptions[userId] ?? null;
}

/**
 * Adds a line to the one ledger. Every charge in the product goes through
 * here — subscription, ride, secure transport, pharmacy run — so there is a
 * single place that knows what someone has been billed and a single screen
 * that can show it.
 */
function addCharge(ctx: Ctx, input: {
  travelerId: string;
  kind: ChargeKind;
  description: string;
  amountCents: number;
  platform?: Platform;
  reference?: string;
  holdId?: string;
}) {
  const charge = recordCharge({
    id: newId("ch"),
    travelerId: input.travelerId,
    kind: input.kind,
    platform: input.platform ?? "web",
    description: input.description,
    amountCents: input.amountCents,
    now: ctx.now(),
    reference: input.reference,
    holdId: input.holdId,
  });
  ctx.store.update((db) => void db.charges.push(charge));
  return charge;
}

function updateCharge(ctx: Ctx, chargeId: string, fn: (c: NonNullable<typeof ctx.store.data.charges[number]>) => typeof c): void {
  ctx.store.update((db) => {
    const target = db.charges.find((c) => c.id === chargeId);
    if (target) Object.assign(target, fn(target));
  });
}

/** What the whole account looks like right now, in one object. */
function billingState(ctx: Ctx, userId: string) {
  catchUpBilling(ctx);
  const now = ctx.now();
  const method = ctx.store.data.paymentMethods[userId] ?? null;
  const subscription = subscriptionOf(ctx, userId);
  const mine = chargesFor(ctx.store.data.charges, userId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    method,
    live: hasLivePaymentMethod(ctx, userId),
    subscription,
    plan: findPlan(effectivePlan(subscription, now)),
    planNote: describeSubscription(subscription, now),
    statement: buildStatement(ctx.store.data.charges, userId, now),
    charges: mine.slice(0, 50).map((c) => ({ ...c, kindLabel: kindLabel(c.kind), railNote: describeRail(c.rail) })),
    rails: railsUsed(mine).map((rail) => ({ rail, note: describeRail(rail) })),
    trialDays: TRIAL_DAYS,
  };
}

/** Reads a concierge task request out of an untrusted body. Validated by the
 *  caller via `validateConciergeRequest` right after — this only shapes it. */
function conciergeInputFrom(body: any): { category: ConciergeCategory; note: string; location: { lat: number; lng: number; label?: string }; spendCapCents: number; quickTask?: boolean } {
  return {
    category: body?.category,
    note: String(body?.note ?? ""),
    location: { lat: body?.location?.lat, lng: body?.location?.lng, label: body?.location?.label },
    spendCapCents: Number(body?.spendCapCents),
    quickTask: body?.quickTask === true,
  };
}

/** A traveler's own concierge task, or a 404 — never another account's. */
function conciergeTaskOf(ctx: Ctx, travelerId: string, taskId: string): ConciergeTask {
  const task = ctx.store.data.conciergeTasks.find((t) => t.id === taskId && t.travelerId === travelerId);
  if (!task) throw notFound("Task");
  return task;
}

/**
 * Provisions the employee-portal account for an assistant the first time
 * they're booked, reused after — one account an assistant keeps, rather than
 * a fresh link every task, so the portal works as an ongoing organizer. The
 * temp password is returned only on creation: it exists in plaintext for
 * exactly this one moment, to be relayed to the assistant the same way a
 * portal link used to be (see `ConciergeTaskRequest.assistantPortalCredentials`)
 * — it is never stored and can never be recovered, only reset.
 */
async function provisionAssistantCredentials(
  ctx: Ctx, assistantId: string,
): Promise<{ username: string; tempPassword?: string }> {
  const existing = ctx.store.data.assistantCredentials[assistantId];
  if (existing) return { username: existing.username };
  const username = assistantId;
  const tempPassword = newTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  ctx.store.update((db) => {
    db.assistantCredentials[assistantId] = {
      username, passwordHash, mustChangePassword: true, createdAt: ctx.now().toISOString(),
    };
  });
  return { username, tempPassword };
}

/** Every assistant-portal route starts here — the employee-portal analogue
 *  of `actor(ctx)`, resolved from its own session, never from a token in the
 *  request. */
function assistantActor(ctx: Ctx): string {
  if (!ctx.assistantActorId) throw unauthorized();
  return ctx.assistantActorId;
}

/**
 * Pays every assistant what they earned in the most recently closed
 * biweekly period. Safe to call more than once for the same period: a task
 * already tagged with a `payoutId` never shows up in `earningsFor` again,
 * so a repeat run (the hourly sweep in main.ts, or a manual admin trigger)
 * only ever pays what is still actually owed — including retrying a payout
 * that failed last time, since a failed attempt never tags its tasks.
 */
export async function runPayroll(ctx: Ctx): Promise<{ paid: number; failed: number; totalCents: number }> {
  const period = previousPayoutPeriod(ctx.now());
  const cipher = cipherFromEnv();
  const assistantIds = new Set(
    ctx.store.data.conciergeTasks.map((t) => t.assistantId).filter((id): id is string => Boolean(id)),
  );

  let paid = 0;
  let failed = 0;
  let totalCents = 0;

  for (const assistantId of assistantIds) {
    const earnings = earningsFor(ctx.store.data.conciergeTasks, assistantId, period);
    if (earnings.length === 0) continue;

    const amountCents = totalEarningsCents(earnings);
    const taskIds = earnings.map((e) => e.taskId);
    const payoutId = newId("payout");
    const base = {
      id: payoutId, assistantId, periodStart: period.start.toISOString(), periodEnd: period.end.toISOString(),
      taskIds, totalCents: amountCents, createdAt: ctx.now().toISOString(),
    };

    const destination = ctx.store.data.assistantPayoutDestinations[assistantId];
    const reason = !destination
      ? "No payout destination on file for this assistant."
      : !cipher
        ? "Payout encryption key not configured on this server."
        : !isAutomatic(revolutPayouts.status) ? revolutPayouts.status.requires : null;

    if (reason) {
      ctx.store.update((db) => void db.payouts.push({ ...base, status: "failed", failureReason: reason }));
      failed += 1;
      continue;
    }

    try {
      const recipient = openPayoutDestination(destination!, cipher!);
      const result = await revolutPayouts.payOut({
        amountCents, currency: "USD", recipient, reference: payoutId,
      });
      ctx.store.update((db) => {
        db.payouts.push({ ...base, status: "paid", paidAt: ctx.now().toISOString(), providerReference: result.payoutId });
        for (const t of db.conciergeTasks) if (taskIds.includes(t.id)) t.payoutId = payoutId;
      });
      paid += 1;
      totalCents += amountCents;
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : "Payout failed.";
      ctx.store.update((db) => void db.payouts.push({ ...base, status: "failed", failureReason }));
      failed += 1;
    }
  }

  return { paid, failed, totalCents };
}

/** An assistant's own task, or 404 — never another assistant's, and never a
 *  task nobody picked a specific assistant for. */
function assistantTaskOf(ctx: Ctx, assistantId: string, taskId: string): ConciergeTask {
  const task = ctx.store.data.conciergeTasks.find((t) => t.id === taskId && t.assistantId === assistantId);
  if (!task) throw notFound("Task");
  return task;
}

/**
 * Settles a task's charge — shared by the traveler's own "mark done" and the
 * assistant portal's, so the two paths can never drift into different rules
 * for what gets captured. The service fee is owed in full regardless of what
 * the reimbursable purchase came to; only the purchase side is capped by what
 * was actually reported.
 */
function settleConciergeTask(ctx: Ctx, task: ConciergeTask, billedCents: unknown): ConciergeTask {
  if (task.status !== "in-progress") throw new HttpError(400, `This task is already ${task.status}.`);
  const reported = Number(billedCents);
  const purchaseCents = Number.isFinite(reported) && reported >= 0
    ? Math.min(Math.round(reported), task.spendCapCents)
    : task.spendCapCents;
  const totalCents = purchaseCents + task.serviceFeeCents;

  if (task.card) revolutCards.cancelCard(task.card.id).catch(() => {});
  ctx.store.update((db) => {
    const target = db.holds.find((h) => h.id === task.holdId);
    if (target) Object.assign(target, captureHold(target, totalCents, ctx.now()));
  });
  updateCharge(ctx, task.chargeId, (c) => settleCharge(c, ctx.now(), totalCents));
  ctx.store.update((db) => {
    const t = db.conciergeTasks.find((x) => x.id === task.id)!;
    t.status = "completed"; t.completedAt = ctx.now().toISOString(); t.billedCents = purchaseCents;
  });
  return { ...task, status: "completed" as const, completedAt: ctx.now().toISOString(), billedCents: purchaseCents };
}

/** Releases a task's hold with nothing captured — shared by a subscriber's
 *  own cancel and the assistant portal's decline. */
function releaseConciergeTask(ctx: Ctx, task: ConciergeTask, declinedByAssistant: boolean): ConciergeTask {
  if (task.status !== "in-progress") throw new HttpError(400, `This task is already ${task.status}.`);
  if (task.card) revolutCards.cancelCard(task.card.id).catch(() => {});
  ctx.store.update((db) => {
    const target = db.holds.find((h) => h.id === task.holdId);
    if (target) Object.assign(target, releaseHold(target));
  });
  updateCharge(ctx, task.chargeId, (c) =>
    failCharge(c, declinedByAssistant ? "Declined by the assistant." : "Task canceled before completion.", ctx.now()));
  ctx.store.update((db) => {
    const t = db.conciergeTasks.find((x) => x.id === task.id)!;
    t.status = "canceled";
    if (declinedByAssistant) t.declinedByAssistant = true;
  });
  return { ...task, status: "canceled" as const, ...(declinedByAssistant ? { declinedByAssistant: true } : {}) };
}

/** Reads and validates a captured selfie from an untrusted body. */
function identityPhotoFrom(body: any, now: Date): IdentityPhoto {
  const input = { base64: String(body?.base64 ?? ""), mimeType: String(body?.mimeType ?? "") };
  validateIdentityPhoto(input);
  return { ...input, capturedAt: now.toISOString() };
}

/**
 * A pharmacy run only reaches the ledger when Safehubby is the one paying for
 * it. Without a fulfilment partnership the run hands off to the store and the
 * user pays there, so putting a line on their Safehubby statement would be
 * inventing a charge we never made — see carePackageState.
 */
function chargeForSupplies(ctx: Ctx, travelerId: string, basket: Basket, deliverTo: string): void {
  if (!(isAutomatic(deliveryDispatcher().status) || isEnabled("pharmacy-ordering-api"))) return;
  const cents = basketTotalCents(basket);
  if (cents <= 0) return;
  const charge = addCharge(ctx, {
    travelerId,
    kind: "supplies",
    description: `${basket.name} to ${deliverTo}`,
    amountCents: cents,
  });
  updateCharge(ctx, charge.id, (c) => settleCharge(c, ctx.now()));
}

/**
 * Runs a pay-then-bill booking behind a hold: reserve the estimate first,
 * capture only what the provider actually charges, release everything if the
 * booking fails. This is the mechanism that let per-transaction risk replace a
 * margin baked into the subscription price — see payment.ts.
 *
 * The hold and the ledger line are created together and resolved together: a
 * user should never see a hold on their card with nothing on their statement
 * explaining it, or a line on their statement that no hold backs.
 */
async function bookWithHold<T extends { fareEstimateCents: number | null }>(
  ctx: Ctx,
  travelerId: string,
  estimateCents: number,
  doBook: () => Promise<T>,
  line: { kind: ChargeKind; description: string },
): Promise<T> {
  const hold = authorizeHold({ id: newId("hold"), travelerId, estimateCents, now: ctx.now() });
  ctx.store.update((db) => void db.holds.push(hold));
  const charge = addCharge(ctx, {
    travelerId,
    kind: line.kind,
    description: line.description,
    amountCents: hold.amountCents,
    holdId: hold.id,
  });

  try {
    const result = await doBook();
    let captured = hold.amountCents;
    ctx.store.update((db) => {
      const target = db.holds.find((h) => h.id === hold.id);
      if (!target) return;
      const actual = result.fareEstimateCents ?? target.amountCents;
      captured = Math.min(actual, target.amountCents);
      Object.assign(target, captureHold(target, captured, ctx.now()));
    });
    updateCharge(ctx, charge.id, (c) => settleCharge(c, ctx.now(), captured));
    return result;
  } catch (err) {
    ctx.store.update((db) => {
      const target = db.holds.find((h) => h.id === hold.id);
      if (target) Object.assign(target, releaseHold(target));
    });
    updateCharge(ctx, charge.id, (c) =>
      failCharge(c, err instanceof Error ? err.message : "The booking did not go through.", ctx.now()));
    throw err;
  }
}

/**
 * Admin gate for driver-application review. Checked live against the
 * environment rather than a stored role, because there is no admin-account
 * system yet — this is the minimum that keeps the review endpoints from being
 * open to the internet, not a real access-control system. A production
 * deployment should replace it with per-account roles before real applicant
 * data is stored here.
 */
function requireAdmin(ctx: Ctx): void {
  const expected = process.env.SAFEHUBBY_ADMIN_KEY;
  if (!expected) throw new HttpError(503, "Admin access is not configured on this server.");
  if (!ctx.adminKey || ctx.adminKey !== expected) throw new HttpError(401, "Bad or missing admin key.");
}

/**
 * Gate for the one route the partner network calls into rather than being
 * called — an assistant's voice-message reply has nowhere else to arrive
 * from. Checked against `CONCIERGE_API_KEY`, the same secret the outbound
 * adapter authenticates with, on the theory that whoever holds it is the
 * partner. No separate webhook secret exists to verify this against yet; a
 * real deployment should give the partner network its own, rotatable one
 * rather than reusing the API key in both directions.
 */
function requirePartnerNetwork(ctx: Ctx): void {
  const expected = process.env.CONCIERGE_API_KEY;
  if (!expected) throw new HttpError(503, "The concierge partner network is not configured on this server.");
  if (!ctx.partnerKey || ctx.partnerKey !== expected) throw new HttpError(401, "Bad or missing partner key.");
}

/** Every authenticated route starts here. */
function actor(ctx: Ctx): string {
  if (!ctx.actorId) throw unauthorized();
  return ctx.actorId;
}

/**
 * Coordinates off a query string.
 *
 * `Number("banana")` is NaN, and NaN sails through `?? default` because it is
 * not nullish — so without this an unparseable query reached the provider as
 * a malformed request that still counted against the billed quota.
 */
function coordsFrom(p: Record<string, string | undefined>): { lat: number; lng: number } {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const valid = Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!valid) throw new HttpError(400, "lat and lng must be real coordinates.");
  return { lat, lng };
}

/**
 * Personal concierge is a deliberate, phased-rollout gate on top of whatever
 * the partner network itself covers — see `service-area.ts`. Checked before
 * the partner network's own coverage, since this is Safehubby's own launch
 * decision, not something a configured partner could override by claiming
 * coverage somewhere this app isn't ready to operate yet.
 */
function requireLaunchMarket(location: { lat: number; lng: number }): void {
  if (!isInLaunchMarket(location)) {
    throw new HttpError(503, `Personal concierge is only available in ${launchMarketNames()} for now.`);
  }
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
    // Its own budget, not shared with traveler login: an attacker hammering
    // employee sign-in should never be able to throttle a real traveler
    // trying to sign in from the same address, or vice versa.
    assistantLogin: new RateLimiter(8, 15 * 60_000),
    signup: new RateLimiter(5, 60 * 60_000),
    // Public and unauthenticated — a driver application needs no account —
    // so it gets its own budget rather than borrowing signup's.
    applications: new RateLimiter(10, 60 * 60_000),
    /**
     * Redeeming a code — a share invite or a crew join.
     *
     * A six-character code is the only thing between a stranger and a named
     * person's live location. The alphabet is 32 characters, so guessing one
     * is a long job at human speed and a short one at machine speed. Legitimate
     * use is one or two attempts, someone reading it off a phone across a
     * table, so the budget is deliberately tight.
     */
    codes: new RateLimiter(10, 15 * 60_000),
    /**
     * Location lookups. Places and Yelp bill per search, so an open endpoint
     * is somebody else's invoice. Generous enough for a night of moving
     * between bars, tight enough that it cannot be farmed.
     */
    places: new RateLimiter(60, 60 * 60_000),
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

/** The wider pharmacy-run menu is a Family-only perk, not something every basket needs. */
function requireBasketAccess(ctx: Ctx, travelerId: string, basket: Basket): void {
  if (basket.tier === "premium" && !hasFeature(planOf(ctx, travelerId), "extended-menu")) {
    throw new HttpError(402, `"${basket.name}" is part of the Family plan's extended menu. Upgrade to unlock it.`);
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

/**
 * Tells whoever is watching, on the phone in their pocket.
 *
 * Entitlement is re-read from the live grants at send time rather than from
 * anything cached: a revoked grant, an expired one, or a night that has ended
 * must stop the buzzing immediately. A notification channel that outlives the
 * consent that created it is exactly the covert-tracking failure this app
 * refuses everywhere else.
 *
 * Fire-and-forget. A push provider having a bad minute must not fail the
 * request that raised the alert — the alert is already stored, and the
 * guardian's own screen will show it either way.
 */
function notifyGuardians(ctx: Ctx, alerts: Alert[]): void {
  if (alerts.length === 0) return;
  void push.send(guardianMessages(ctx.store.data, alerts, ctx.now())).catch(() => {});
}

/** Recomputes derived state (missed check-ins, new alerts) before any read. */
function refresh(ctx: Ctx, night: NightOut): NightOut {
  const now = ctx.now();
  // Only the alerts raised by *this* pass are pushed. deriveAlerts already
  // dedupes by id against what is stored, so a standing condition notifies
  // once rather than on every poll.
  const fresh: Alert[] = [];
  // Collected here rather than charged inside the transaction: addCharge opens
  // its own store update, and nesting one inside another is how you get a
  // half-written document.
  const autoSent: { basket: Basket; deliverTo: string }[] = [];
  ctx.store.update((db) => {
    const target = db.nights.find((n) => n.id === night.id)!;
    target.checkIns = sweepMissedCheckIns(target.checkIns, now);
    const raised = new Set(db.alerts.filter((a) => a.nightId === target.id).map((a) => a.id));
    fresh.push(...deriveAlerts({ night: target, now, alreadyRaised: raised }));
    db.alerts.push(...fresh);

    // A pre-authorized pharmacy run goes out here, once, when the estimate
    // crosses the band the traveler set while sober.
    const care = db.carePackages[target.id];
    if (care) {
      const band = estimateBac({ body: target.body, drinks: target.drinks, now }).band;
      if (shouldSendAutomatically({ auth: care.auth, band, existingOrders: care.orders })) {
        care.orders.push(buildOrder(newId("cp"), care.auth!.basketId, care.auth!.deliverTo, "auto", now));
        autoSent.push({ basket: findBasket(care.auth!.basketId), deliverTo: care.auth!.deliverTo });
      }
    }
  });
  for (const auto of autoSent) chargeForSupplies(ctx, night.travelerId, auto.basket, auto.deliverTo);
  notifyGuardians(ctx, fresh);
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
      db.sessions = sweepExpiredSessions(db.sessions, ctx.now());
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
      db.sessions = sweepExpiredSessions(db.sessions, ctx.now());
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

  /**
   * The card that lets automatic booking happen without Safehubby fronting
   * the money. Never returns a full card number — there is nothing here to
   * leak past the last four digits and an expiry.
   */
  "GET /api/account/payment-method": (ctx) => {
    const me = actor(ctx);
    const method = ctx.store.data.paymentMethods[me] ?? null;
    return { method, live: hasLivePaymentMethod(ctx, me) };
  },

  "POST /api/account/payment-method": (ctx, _p, body) => {
    const me = actor(ctx);
    const method = attachPaymentMethod({
      id: newId("pm"),
      brand: String(body?.brand ?? ""),
      last4: String(body?.last4 ?? ""),
      expMonth: Number(body?.expMonth),
      expYear: Number(body?.expYear),
      now: ctx.now(),
    });
    ctx.store.update((db) => { db.paymentMethods[me] = method; });
    return { method };
  },

  "POST /api/account/payment-method/remove": (ctx) => {
    const me = actor(ctx);
    ctx.store.update((db) => { delete db.paymentMethods[me]; });
    return { removed: true };
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
    // Validated here rather than trusted: estimateBac guards by throwing, and
    // it runs on every read, so a night stored with a bad profile is a night
    // that 500s forever with no way to fix it through the API.
    const profile = validateBody({ weightKg, widmarkRatio });
    const limit = validateDrinkLimit(drinkLimit);

    const now = ctx.now();
    const night: NightOut = {
      id: newId("night"),
      travelerId,
      startedAt: now.toISOString(),
      status: "active",
      body: profile,
      drinks: [], checkIns: [], pings: [],
      drinkLimit: limit,
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
    notifyGuardians(ctx, [alert]);
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
    if (ctx.limiters.codes.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many code attempts. Wait a few minutes and try again.");
    }
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
    if (ctx.limiters.codes.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many code attempts. Wait a few minutes and try again.");
    }
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

  "GET /api/care-package/baskets": (ctx) => {
    const unlocked = ctx.actorId ? hasFeature(planOf(ctx, ctx.actorId), "extended-menu") : false;
    return {
      baskets: BASKETS.map((b) => ({ ...b, locked: b.tier === "premium" && !unlocked })),
      defaultCapCents: DEFAULT_CAP_CENTS,
    };
  },

  "POST /api/nights/:nightId/care-package/authorize": (ctx, p, body) => {
    const night = ownNight(ctx, req(p, "nightId"));
    requireFeature(ctx, night.travelerId, "supply-delivery");
    const basket = findBasket(body?.basketId ?? "hydration");
    requireBasketAccess(ctx, night.travelerId, basket);
    const now = ctx.now();
    const auth = authorizeCarePackage({
      basketId: basket.id,
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
    requireBasketAccess(ctx, night.travelerId, basket);
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
    chargeForSupplies(ctx, night.travelerId, basket, order.deliverTo);
    return { order, totalCents: basketTotalCents(basket) };
  },

  /* ---------------- subscription ---------------- */

  /**
   * Everything about this account's money, in one response.
   *
   * Deliberately one endpoint rather than three: the card, the subscription and
   * the per-trip charges are one account, and a UI that has to stitch them
   * together from separate calls ends up showing them as separate things. The
   * rail each line settled on is included, but it is a footnote on a line, not
   * a division of the response.
   */
  "GET /api/billing": (ctx) => billingState(ctx, actor(ctx)),

  /**
   * Starts or changes the subscription.
   *
   * Charges land on the same ledger as a ride home. What differs is only the
   * rail: inside a store app, Apple or Google have to settle a digital
   * subscription, so the line is recorded against that rail and marked pending
   * until the store's receipt confirms it (`POST /api/billing/charges/:id/confirm`).
   * On the web it is the card on file, and the card is required up front for
   * the same reason a ride is: there is no point starting a trial that cannot
   * convert.
   */
  "POST /api/subscription": (ctx, _p, body) => {
    const me = actor(ctx);
    const planId = body?.planId as PlanId;
    const cadence: Cadence = body?.cadence === "annual" ? "annual" : "monthly";
    const platform = platformFrom(body?.platform);
    const plan = findPlan(planId);
    catchUpBilling(ctx);
    const existing = subscriptionOf(ctx, me);

    const change = existing
      ? changePlan({ subscription: existing, planId: plan.id, cadence, platform, now: ctx.now() })
      : startSubscription({ travelerId: me, planId: plan.id, cadence, platform, now: ctx.now() });

    const charge = change.due
      ? addCharge(ctx, {
        travelerId: me,
        kind: "subscription",
        description: change.due.description,
        amountCents: change.due.cents,
        platform,
      })
      : null;

    ctx.store.update((db) => {
      db.subscriptions[me] = change.subscription;
      const traveler = db.travelers.find((t) => t.id === me)!;
      traveler.planId = effectivePlan(change.subscription, ctx.now());
    });

    // A card charge settles inline here because there is no processor wired in
    // yet; a store charge cannot, because only the store's receipt can say it
    // happened. Both are explicit in the response rather than implied.
    if (charge && charge.rail === "card") {
      updateCharge(ctx, charge.id, (c) => settleCharge(c, ctx.now()));
    }

    return {
      ...billingState(ctx, me),
      charged: charge,
      awaitingStoreReceipt: charge?.rail !== "card" && charge !== null,
      note: noteFor(change.subscription, charge?.rail ?? null, change.due?.cents ?? 0),
    };
  },

  /** Cancels without cutting anyone off mid-period — see subscription.ts. */
  "POST /api/subscription/cancel": (ctx) => {
    const me = actor(ctx);
    const existing = subscriptionOf(ctx, me);
    if (!existing) throw new HttpError(404, "There is no subscription to cancel.");
    const canceled = cancelSubscription(existing, ctx.now());
    ctx.store.update((db) => {
      db.subscriptions[me] = canceled;
      const traveler = db.travelers.find((t) => t.id === me)!;
      traveler.planId = effectivePlan(canceled, ctx.now());
    });
    return { ...billingState(ctx, me), note: describeSubscription(canceled, ctx.now()) };
  },

  /**
   * Confirms a store purchase against a pending ledger line.
   *
   * The client hands back the App Store or Play receipt it got. This build
   * records it and settles the line; a real deployment verifies the receipt
   * with Apple or Google first, and this is the single place that has to
   * change when it does. It refuses to settle a card line, so nothing can be
   * marked paid by claiming a receipt for it.
   */
  "POST /api/billing/charges/:chargeId/confirm": (ctx, p, body) => {
    const me = actor(ctx);
    const chargeId = req(p, "chargeId");
    const charge = ctx.store.data.charges.find((c) => c.id === chargeId);
    if (!charge || charge.travelerId !== me) throw notFound("Charge");
    if (charge.rail === "card") throw new HttpError(400, "A card charge is not settled by a store receipt.");
    const receipt = String(body?.receipt ?? "").trim();
    if (!receipt) throw new HttpError(400, "Missing the store receipt for this purchase.");

    updateCharge(ctx, chargeId, (c) => settleCharge(c, ctx.now(), undefined, receipt));
    return {
      ...billingState(ctx, me),
      verified: false,
      note: "Recorded against your account. Receipt verification with the store is not wired in this build — see docs/billing.md.",
    };
  },

  /**
   * Nearby venues. Signed-in and rate limited, because with a Places or Yelp
   * key configured every call is billed to the operator — an open endpoint is
   * somebody else's invoice, and the only caller is the signed-in traveler
   * screen anyway.
   */
  "GET /api/venues": async (ctx, _p, _b) => {
    actor(ctx);
    if (ctx.limiters.places.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many location lookups. Try again shortly.");
    }
    return venuePort.nearby(coordsFrom(_p));
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
    const providerReady = isAutomatic(uberForBusiness.status) && hasFeature(planOf(ctx, me), "automatic-rides");
    const hasCard = hasLivePaymentMethod(ctx, me);
    const automatic = providerReady && hasCard;

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
    // The card, not the provider, is the only thing standing between this
    // account and automatic booking — say that instead of a generic note.
    const needsPaymentMethod = providerReady && !hasCard;
    return {
      mode: "handoff",
      note: needsPaymentMethod
        ? "Add a payment method to book automatically. Nothing is charged until a ride is booked."
        : uberForBusiness.status.requires,
      needsPaymentMethod,
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
    const { rides, delivery, walmart, secureTransport: secure, concierge: aide, cardIssuing } = fulfillmentStatus();
    return {
      rides, delivery, walmart, secureTransport: secure, concierge: aide, cardIssuing, push: push.status,
      placeSearch: placeSearch.status, payouts: revolutPayouts.status,
      disclosures: SECURE_TRANSPORT_DISCLOSURES,
      conciergeDisclosures: CONCIERGE_DISCLOSURES,
      launchMarkets: launchMarketNames(),
    };
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
    // A protective-service trip costs multiples of a normal ride, so the
    // pre-authorization matters here even more than on an ordinary ride.
    requirePaymentMethod(ctx, me);

    const dropoff = { lat: body?.dropoff?.lat, lng: body?.dropoff?.lng, label: body?.dropoff?.label };
    const quote = await secureTransport.quote({ pickup: body.pickup, dropoff, riderName: nameOf(ctx, me) });
    if (!quote) throw new HttpError(503, `${secureTransport.status.name} does not operate where you are right now.`);

    const booked = await bookWithHold(ctx, me, quote.fareEstimateCents, () =>
      secureTransport.book({
        pickup: body.pickup,
        dropoff: body.dropoff,
        riderName: nameOf(ctx, me),
        riderPhone: body?.phone,
        note: body?.note,
      }),
      { kind: "secure-transport", description: `Secure transport to ${body?.dropoff?.label ?? "your drop-off"}` },
    );
    ctx.store.update((db) => {
      (db.points[me] ??= []).push(award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Secure ride home"));
    });
    return booked;
  },

  /* ---------------- personal concierge ---------------- */

  /**
   * Free-text place search — "whatever the customer needs": a specific
   * pharmacy, a wine store, a named restaurant. Rate limited the same as the
   * venue and store pickers, since a configured key is billed per call.
   */
  "GET /api/concierge/places": async (ctx, p) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "personal-concierge");
    if (ctx.limiters.places.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many location lookups. Try again shortly.");
    }
    const query = String(p.query ?? "").trim();
    if (!query) throw new HttpError(400, "Enter what you're looking for.");
    if (!isAutomatic(placeSearch.status)) throw new HttpError(503, placeSearch.status.requires);
    const places = await placeSearch.search(query, coordsFrom(p));
    return { places };
  },

  /**
   * The roster for a category near a location, so a subscriber can pick a
   * specific assistant instead of leaving assignment entirely to the
   * network's own dispatch. An empty list is a normal answer — no fake
   * candidates are ever invented when the network is unconfigured or has
   * nobody to show.
   */
  "GET /api/concierge/assistants": async (ctx, p) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "personal-concierge");
    const category = p.category ?? "";
    if (!CONCIERGE_CATEGORIES.some((c) => c.id === category)) throw new HttpError(400, "Unknown task type.");
    const location = coordsFrom(p);
    requireLaunchMarket(location);
    if (!isAutomatic(concierge.status)) throw new HttpError(503, concierge.status.requires);

    const listing = await concierge.listAssistants({ category, location });
    const assistants: AssistantProfile[] = listing.map((a) => ({
      id: a.id, name: a.name, bio: a.bio, photoUrl: a.photoUrl,
      categories: a.categories as ConciergeCategory[],
      maxConcurrentCustomers: a.maxConcurrentCustomers,
      currentCustomers: a.currentCustomers,
    }));
    return { assistants, available: assistants.filter(isAssistantAvailable).length };
  },

  /**
   * Quotes a concierge task before booking, and is also how the app learns
   * whether the partner network covers this location — the same two-step as
   * secure transport, and for the same reason: never offer a task that cannot
   * actually be accepted.
   */
  "POST /api/concierge/quote": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "personal-concierge");
    const input = conciergeInputFrom(body);
    validateConciergeRequest(input);
    requireLaunchMarket(input.location);
    if (!isAutomatic(concierge.status)) throw new HttpError(503, concierge.status.requires);

    const quote = await concierge.quote({
      category: input.category, note: input.note, location: input.location,
      spendCapCents: input.spendCapCents, requesterName: nameOf(ctx, me),
    });
    if (!quote) throw new HttpError(503, `${concierge.status.name} does not operate where you are right now.`);
    return {
      quote, disclosures: CONCIERGE_DISCLOSURES,
      serviceFeeCents: serviceFeeFor(input.category, input.quickTask),
      totalCents: totalChargeCents(input.category, input.spendCapCents, input.quickTask),
      quickTaskEligible: isQuickTaskEligible(input.category),
    };
  },

  /**
   * Books a concierge task. The hold is exact, not padded — see
   * `authorizeExactHold` — because the spend cap here is a promise made to a
   * stranger doing the spending, not a fare estimate with genuine slack in it.
   */
  "POST /api/concierge/tasks": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "personal-concierge");
    const input = conciergeInputFrom(body);
    validateConciergeRequest(input);
    requireLaunchMarket(input.location);
    if (body?.acknowledgedDisclosures !== true) {
      throw new HttpError(400, "The disclosures have to be acknowledged before booking.");
    }
    if (!isAutomatic(concierge.status)) throw new HttpError(503, concierge.status.requires);
    requirePaymentMethod(ctx, me);
    const assistantId = body?.assistantId ? String(body.assistantId) : undefined;
    const serviceFeeCents = serviceFeeFor(input.category, input.quickTask);
    const totalCents = totalChargeCents(input.category, input.spendCapCents, input.quickTask);
    const portalCredentials = assistantId ? await provisionAssistantCredentials(ctx, assistantId) : undefined;

    const quote = await concierge.quote({
      category: input.category, note: input.note, location: input.location,
      spendCapCents: input.spendCapCents, requesterName: nameOf(ctx, me), assistantId,
    });
    if (!quote) throw new HttpError(503, `${concierge.status.name} does not operate where you are right now.`);

    // The hold covers both the reimbursable purchase and the service fee
    // that pays the assistant — one exact number, never padded, same as
    // either piece would be on its own.
    const hold = authorizeExactHold({ id: newId("hold"), travelerId: me, capCents: totalCents, now: ctx.now() });
    ctx.store.update((db) => void db.holds.push(hold));
    const charge = addCharge(ctx, {
      travelerId: me,
      kind: "concierge",
      description: `${conciergeCategoryLabel(input.category)} — ${input.note} ($${(serviceFeeCents / 100).toFixed(2)} service fee included)`.slice(0, 160),
      amountCents: totalCents,
      holdId: hold.id,
    });

    // Issuing a card is an add-on, not a precondition for the task itself: the
    // partner may bill Safehubby directly with no card in the loop at all, so
    // a Revolut outage or a missing key should not block dispatch. Whether one
    // was actually issued is independently visible via `cardIssuing.mode` on
    // `/api/fulfillment/status`, the same "each capability reports for
    // itself" rule as every other adapter here.
    let issuedCard: Awaited<ReturnType<typeof revolutCards.issueCard>> | null = null;
    if (isAutomatic(revolutCards.status)) {
      try {
        issuedCard = await revolutCards.issueCard({
          capCents: input.spendCapCents,
          currency: "USD",
          label: `Concierge: ${conciergeCategoryLabel(input.category)}`,
          // A task that never finishes should not leave a live card behind
          // indefinitely — 4 hours comfortably covers a bounded, in-person task.
          expiresAt: new Date(ctx.now().getTime() + 4 * 3_600_000).toISOString(),
        });
      } catch {
        issuedCard = null;
      }
    }

    try {
      const booked = await concierge.book({
        category: input.category, note: input.note, location: input.location,
        spendCapCents: input.spendCapCents, requesterName: nameOf(ctx, me), requesterPhone: body?.phone,
        assistantId,
        ...(portalCredentials?.tempPassword
          ? { assistantPortalCredentials: { username: portalCredentials.username, tempPassword: portalCredentials.tempPassword } }
          : {}),
        // The reveal link goes to the partner's own dispatch system so it can
        // reach the assistant — never back to the traveler's browser.
        ...(issuedCard ? { card: { last4: issuedCard.last4, revealUrl: issuedCard.revealUrl ?? "" } } : {}),
      });
      const task: ConciergeTask = {
        id: newId("ct"), travelerId: me, category: input.category, note: input.note,
        location: input.location, spendCapCents: input.spendCapCents, serviceFeeCents,
        quickTask: input.quickTask, status: "in-progress",
        provider: booked.provider, providerTaskId: booked.taskId, assistantId,
        assistantName: booked.assistant?.name, chargeId: charge.id, holdId: hold.id,
        createdAt: ctx.now().toISOString(),
        ...(issuedCard
          ? { card: { id: issuedCard.id, last4: issuedCard.last4, network: issuedCard.network, expMonth: issuedCard.expMonth, expYear: issuedCard.expYear } }
          : {}),
      };
      ctx.store.update((db) => void db.conciergeTasks.push(task));
      ctx.store.update((db) => {
        (db.points[me] ??= []).push(award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Sent a concierge instead of going alone"));
      });
      return { task, booked };
    } catch (err) {
      // A card issued for a task that never actually got booked is a live,
      // spend-capped card sitting around for nothing — kill it, best-effort.
      if (issuedCard) revolutCards.cancelCard(issuedCard.id).catch(() => {});
      ctx.store.update((db) => {
        const target = db.holds.find((h) => h.id === hold.id);
        if (target) Object.assign(target, releaseHold(target));
      });
      updateCharge(ctx, charge.id, (c) =>
        failCharge(c, err instanceof Error ? err.message : "The task could not be booked.", ctx.now()));
      throw err;
    }
  },

  "GET /api/concierge/tasks": (ctx) => {
    const me = actor(ctx);
    return {
      tasks: ctx.store.data.conciergeTasks
        .filter((t) => t.travelerId === me)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },

  /**
   * Marks a task done and settles what it actually cost. The partner network
   * is the one source of truth for the purchase amount; until its
   * receipt-reporting is wired, this trusts what is passed in and otherwise
   * settles at the full cap — never less by guesswork, because inventing a
   * lower number would be fabricating a discount nobody earned. The service
   * fee is never in question — it's owed in full for the time spent, whatever
   * the purchase came to.
   */
  "POST /api/concierge/tasks/:taskId/complete": (ctx, p, body) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    return { task: settleConciergeTask(ctx, task, body?.billedCents) };
  },

  /** Releases the hold on a task that never happened — a change of plan
   *  should not leave money reserved against nothing. */
  "POST /api/concierge/tasks/:taskId/cancel": (ctx, p) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    return { task: releaseConciergeTask(ctx, task, false) };
  },

  /**
   * The subscriber's own selfie for this task, shown to the assistant in the
   * portal so they can confirm who they're meeting before they arrive. Never
   * required to book; a missing one just means this side skipped it.
   */
  "POST /api/concierge/tasks/:taskId/selfie": (ctx, p, body) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    const photo = identityPhotoFrom(body, ctx.now());
    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      t.identityPhotos = { ...t.identityPhotos, traveler: photo };
    });
    return { photo };
  },

  /* ---------------- employee portal ---------------- */
  // A distinct area from everything above: its own sign-in, its own session
  // cookie, its own identity space. A traveler's session never reaches here
  // and an assistant's session never reaches a traveler route — see
  // `assistantActor` and the `Ctx.assistantActorId`/`actorId` split.

  /**
   * Signs an assistant into the employee portal. Rate-limited the same as
   * traveler login, and checked against a dummy hash on an unknown username
   * for the same timing reason.
   */
  "POST /api/assistant/auth/login": async (ctx, _p, body) => {
    if (ctx.limiters.assistantLogin.hit(ctx.clientKey)) throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    const username = String(body?.username ?? "").trim();
    const entry = username
      ? Object.entries(ctx.store.data.assistantCredentials).find(([, c]) => c.username === username)
      : undefined;

    const hash = entry?.[1].passwordHash ?? "scrypt$00$00";
    const ok = await verifyPassword(String(body?.password ?? ""), hash);
    if (!entry || !ok) throw new HttpError(401, "That username and password do not match.");
    const [assistantId, credential] = entry;

    const token = newSessionToken();
    const now = ctx.now();
    ctx.store.update((db) => {
      db.assistantSessions = sweepExpiredSessions(db.assistantSessions, ctx.now());
      db.assistantSessions.push({
        token, assistantId, createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ASSISTANT_SESSION_TTL_MS).toISOString(),
      });
    });
    ctx.limiters.assistantLogin.reset(ctx.clientKey);
    ctx.setAssistantSession?.(token);
    return { assistantId, mustChangePassword: credential.mustChangePassword };
  },

  "POST /api/assistant/auth/logout": (ctx) => {
    const token = ctx.assistantSessionToken;
    if (token) ctx.store.update((db) => { db.assistantSessions = db.assistantSessions.filter((s) => s.token !== token); });
    ctx.setAssistantSession?.(null);
    return { ok: true };
  },

  /**
   * Required before anything else in the portal is usable when
   * `mustChangePassword` is set — a system-generated temp password should
   * never quietly become someone's permanent one.
   */
  "POST /api/assistant/auth/change-password": async (ctx, _p, body) => {
    const assistantId = assistantActor(ctx);
    const credential = ctx.store.data.assistantCredentials[assistantId];
    if (!credential) throw notFound("Account");
    const ok = await verifyPassword(String(body?.currentPassword ?? ""), credential.passwordHash);
    if (!ok) throw new HttpError(401, "That current password is not right.");
    const pwError = validatePassword(body?.newPassword);
    if (pwError) throw new HttpError(400, pwError);

    const passwordHash = await hashPassword(String(body.newPassword));
    ctx.store.update((db) => {
      db.assistantCredentials[assistantId] = { ...credential, passwordHash, mustChangePassword: false };
    });
    return { ok: true };
  },

  /**
   * Everything assigned to one assistant, in one call — the "organizer" this
   * exists to be. Session-authenticated like everything else in the portal;
   * see the employee-portal section header above.
   */
  "GET /api/assistant/portal": (ctx) => {
    const assistantId = assistantActor(ctx);
    const mustChangePassword = ctx.store.data.assistantCredentials[assistantId]?.mustChangePassword ?? false;
    const tasks = ctx.store.data.conciergeTasks
      .filter((t) => t.assistantId === assistantId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({ ...t, requesterName: nameOf(ctx, t.travelerId) }));
    return {
      assistantId, mustChangePassword, tasks,
      unpaidEarningsCents: unpaidEarningsCents(ctx.store.data.conciergeTasks, assistantId),
    };
  },

  /**
   * Where a biweekly payout is actually sent — entered by the assistant
   * themselves, never by Safehubby staff. Requires encryption to be
   * configured at all: a bank account number is not something this app will
   * accept and store in the clear, so an unconfigured server refuses the
   * write outright rather than silently downgrading to plaintext.
   */
  "POST /api/assistant/payout-destination": async (ctx, _p, body) => {
    const assistantId = assistantActor(ctx);
    const input = {
      accountHolderName: String(body?.accountHolderName ?? "").trim(),
      routingNumber: String(body?.routingNumber ?? "").trim(),
      accountNumber: String(body?.accountNumber ?? "").trim(),
    };
    validatePayoutDestination(input);
    const cipher = cipherFromEnv();
    if (!cipher) throw new HttpError(503, "Payout details require SAFEHUBBY_ENCRYPTION_KEY to be set on this server.");

    const sealed = sealPayoutDestination(input, cipher);
    ctx.store.update((db) => {
      db.assistantPayoutDestinations[assistantId] = { ...sealed, updatedAt: ctx.now().toISOString() };
    });
    return { accountHolderName: sealed.accountHolderName, accountNumberLast4: sealed.accountNumberLast4 };
  },

  /** Never returns the encrypted fields, let alone the plaintext account
   *  number — only what the portal needs to show "on file, ending in 1234". */
  "GET /api/assistant/payout-destination": (ctx) => {
    const assistantId = assistantActor(ctx);
    const on = ctx.store.data.assistantPayoutDestinations[assistantId];
    return { destination: on ? { accountHolderName: on.accountHolderName, accountNumberLast4: on.accountNumberLast4 } : null };
  },

  /** An assistant's own record of what they were actually paid, biweekly —
   *  see payroll.ts. */
  "GET /api/assistant/payouts": (ctx) => {
    const assistantId = assistantActor(ctx);
    const payouts = ctx.store.data.payouts
      .filter((p) => p.assistantId === assistantId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { payouts, unpaidEarningsCents: unpaidEarningsCents(ctx.store.data.conciergeTasks, assistantId) };
  },

  "GET /api/assistant/tasks/:taskId/voice-messages": (ctx, p) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    return { messages: voiceMessagesFor(ctx.store.data.voiceMessages, task.id) };
  },

  "POST /api/assistant/tasks/:taskId/voice-messages": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    const message = recordVoiceMessage({
      id: newId("vm"), taskId: task.id, travelerId: task.travelerId, sender: "assistant",
      audioBase64: String(body?.audioBase64 ?? ""), mimeType: String(body?.mimeType ?? ""),
      durationSeconds: Number(body?.durationSeconds), now: ctx.now(),
    });
    ctx.store.update((db) => void db.voiceMessages.push(message));
    return { id: message.id, createdAt: message.createdAt };
  },

  /** The assistant's own selfie, shown to the subscriber so they can confirm
   *  who's arriving — the other half of the same disclosure. */
  "POST /api/assistant/tasks/:taskId/selfie": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    const photo = identityPhotoFrom(body, ctx.now());
    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      t.identityPhotos = { ...t.identityPhotos, assistant: photo };
    });
    return { photo };
  },

  "POST /api/assistant/tasks/:taskId/complete": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    return { task: settleConciergeTask(ctx, task, body?.billedCents) };
  },

  /** The assistant's own way to say no — see CONCIERGE_DISCLOSURES: they can
   *  decline anything unsafe, illegal, or outside what they agreed to do. */
  "POST /api/assistant/tasks/:taskId/decline": (ctx, p) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    return { task: releaseConciergeTask(ctx, task, true) };
  },

  /**
   * The one route the partner network's own system calls into rather than a
   * person on the portal — for an integration that posts messages
   * server-to-server instead of using Safehubby's UI. Kept alongside the
   * portal, not instead of it: a partner network is free to use either.
   */
  "POST /api/concierge/webhooks/voice-message": (ctx, _p, body) => {
    requirePartnerNetwork(ctx);
    const providerTaskId = String(body?.providerTaskId ?? "");
    const task = ctx.store.data.conciergeTasks.find((t) => t.providerTaskId === providerTaskId);
    if (!task) throw notFound("Task");

    const message = recordVoiceMessage({
      id: newId("vm"),
      taskId: task.id,
      travelerId: task.travelerId,
      sender: "assistant",
      audioBase64: String(body?.audioBase64 ?? ""),
      mimeType: String(body?.mimeType ?? ""),
      durationSeconds: Number(body?.durationSeconds),
      now: ctx.now(),
    });
    ctx.store.update((db) => void db.voiceMessages.push(message));
    return { id: message.id, received: true };
  },

  /**
   * A voice message to the assistant on a specific task. Async, not a live
   * call — see voice-messages.ts for why — so the assistant is never expected
   * to have their hands free the instant this arrives.
   */
  "POST /api/concierge/tasks/:taskId/voice-messages": (ctx, p, body) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    const message = recordVoiceMessage({
      id: newId("vm"),
      taskId: task.id,
      travelerId: me,
      sender: "traveler",
      audioBase64: String(body?.audioBase64 ?? ""),
      mimeType: String(body?.mimeType ?? ""),
      durationSeconds: Number(body?.durationSeconds),
      now: ctx.now(),
    });
    ctx.store.update((db) => void db.voiceMessages.push(message));
    // The recording itself is never worth logging or echoing back at length —
    // only what a caller needs to keep its own thread in order.
    return { id: message.id, createdAt: message.createdAt };
  },

  "GET /api/concierge/tasks/:taskId/voice-messages": (ctx, p) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    return { messages: voiceMessagesFor(ctx.store.data.voiceMessages, task.id) };
  },

  /** Records that a ride was taken instead of driving; the booking happens in
   *  the provider's own app until an API partnership exists. */
  "POST /api/rides/book": async (ctx, _p, body) => {
    const travelerId = actor(ctx);
    requireFeature(ctx, travelerId, "ride-booking");

    // Automatic: Safehubby books it on their behalf and the car is actually
    // coming. Only claimed when the provider really answered.
    if (isAutomatic(uberForBusiness.status) && hasFeature(planOf(ctx, travelerId), "automatic-rides")) {
      requirePaymentMethod(ctx, travelerId);

      const dropoff = { lat: body?.dropoff?.lat, lng: body?.dropoff?.lng, label: body?.dropoff?.label };
      const estimates = await uberEstimates({ pickup: body.pickup, dropoff, riderName: nameOf(ctx, travelerId) });
      const estimate = estimates.find((e) => e.productId === body?.providerId) ?? estimates[0];
      if (!estimate?.fareCents) throw new HttpError(502, "Could not get a fare estimate right now — try again.");

      const booked = await bookWithHold(ctx, travelerId, estimate.fareCents, () =>
        uberForBusiness.book({
          pickup: body.pickup,
          dropoff: body.dropoff,
          riderName: nameOf(ctx, travelerId),
          riderPhone: body?.phone,
          note: body?.note,
        }),
        { kind: "ride", description: `Ride to ${body?.dropoff?.label ?? "home"}` },
      );
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

  /* ---------------- push ---------------- */

  "POST /api/push/devices": (ctx, _p, body) => {
    const me = actor(ctx);
    const device = registerDevice({
      token: String(body?.token ?? ""),
      platform: String(body?.platform ?? ""),
      userId: me,
      now: ctx.now(),
    });
    ctx.store.update((db) => { db.pushDevices = upsertDevice(db.pushDevices, device); });
    return { registered: true, platform: device.platform, delivery: push.status };
  },

  "POST /api/push/devices/remove": (ctx, _p, body) => {
    const me = actor(ctx);
    const token = String(body?.token ?? "");
    ctx.store.update((db) => {
      db.pushDevices = db.pushDevices.filter((d) => !(d.token === token && d.userId === me));
    });
    return { removed: true };
  },

  /** Whether this account would actually be reached, and whether push is configured at all. */
  "GET /api/push/status": (ctx) => {
    const me = actor(ctx);
    return { devices: devicesFor(ctx.store.data.pushDevices, me).length, delivery: push.status };
  },

  "GET /api/supplies": async (ctx, p) => mockDelivery.catalog({ lat: Number(p.lat ?? 40.714), lng: Number(p.lng ?? -74.003) }),

  /** Real, nearby, named stores — Google Maps when configured — to prefer for the basket below. */
  "GET /api/supplies/stores": async (ctx, p) => {
    actor(ctx);
    if (ctx.limiters.places.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many location lookups. Try again shortly.");
    }
    return storeLocator.nearby(coordsFrom(p));
  },

  /**
   * Builds the basket for real.
   *
   * With Instacart configured this returns a cart that is already assembled —
   * the customer taps once to check out. The basket is put together by the app
   * rather than typed by someone at 1am, which is the whole point; the payment
   * still happens in their account, which keeps the consent rule intact.
   *
   * An optional chosen store (from GET /api/supplies/stores) is passed along
   * as a note the shopper sees, not a guaranteed reroute — see grocery.ts for
   * why Google Places can name a nearby store but cannot select it for real.
   */
  "POST /api/supplies/order": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "supply-delivery");
    const dispatcher = deliveryDispatcher();
    const to = String(body?.to ?? "Home");
    const note = buildStoreNote(body?.store ? { name: String(body.store.name ?? ""), address: body.store.address ? String(body.store.address) : undefined } : null);

    const items = (body?.items ?? []).map((i: { id: string; qty?: number; name?: string; priceCents?: number }) => ({
      sku: i.id,
      name: i.name ?? i.id,
      qty: i.qty ?? 1,
      priceCents: i.priceCents ?? 0,
    }));

    if (isAutomatic(dispatcher.status)) {
      try {
        const dispatched = await dispatcher.dispatch({ items, dropoff: { label: to }, note });
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
    } else if (game.id === "ride-home-race" || game.id === "last-one-standing" || game.id === "open-mic") {
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

  /* ---------------- driver applications ----------------
     A place for real people to sign up to drive — separate from the Uber and
     Instacart integrations, which bring their own drivers and shoppers. This
     is the intake for whatever Safehubby vets and staffs directly, which
     today is nothing, but which the secure-transport tier cannot be real
     without: that tier has to be staffed by name and licence, not an API key. */

  /** Public — applying needs no account. Rate limited on its own budget. */
  "POST /api/drivers/apply": (ctx, _p, body) => {
    if (ctx.limiters.applications.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many applications from this connection. Try again later.");
    }
    const app = submitApplication({
      id: newId("drv"),
      tier: (body?.tier ?? "standard") as DriverTier,
      fullName: String(body?.fullName ?? ""),
      email: String(body?.email ?? ""),
      phone: String(body?.phone ?? ""),
      city: String(body?.city ?? ""),
      state: String(body?.state ?? ""),
      licenseNumber: String(body?.licenseNumber ?? ""),
      licenseExpiry: String(body?.licenseExpiry ?? ""),
      yearsDriving: Number(body?.yearsDriving),
      vehicle: {
        make: String(body?.vehicle?.make ?? ""),
        model: String(body?.vehicle?.model ?? ""),
        year: Number(body?.vehicle?.year),
        licensePlate: String(body?.vehicle?.licensePlate ?? ""),
      },
      protectiveLicenseNumber: body?.protectiveLicenseNumber ? String(body.protectiveLicenseNumber) : undefined,
      protectiveLicenseState: body?.protectiveLicenseState ? String(body.protectiveLicenseState) : undefined,
      yearsProtectiveExperience:
        body?.yearsProtectiveExperience !== undefined ? Number(body.yearsProtectiveExperience) : undefined,
      backgroundCheckConsent: body?.backgroundCheckConsent === true,
      now: ctx.now(),
    });
    ctx.store.update((db) => void db.driverApplications.push(app));
    // The full record (licence numbers, etc.) is not echoed back to the
    // submitter's own browser response beyond what they already typed — this
    // just confirms receipt and gives them their id to reference.
    return { id: app.id, status: app.status, submittedAt: app.submittedAt };
  },

  /** An applicant checking or withdrawing their own application, identified by
   *  the id they were given plus the email they applied with — the minimum
   *  needed since applicants have no account. */
  "POST /api/drivers/applications/:id/withdraw": (ctx, p, body) => {
    const id = req(p, "id");
    const app = ctx.store.data.driverApplications.find((a) => a.id === id);
    if (!app || app.email !== String(body?.email ?? "").trim().toLowerCase()) throw notFound("Application");
    const withdrawn = withdrawApplication(app, ctx.now());
    ctx.store.update((db) => {
      const i = db.driverApplications.findIndex((a) => a.id === id);
      db.driverApplications[i] = withdrawn;
    });
    return { id: withdrawn.id, status: withdrawn.status };
  },

  /**
   * Admin: run the biweekly payout immediately rather than waiting for the
   * hourly sweep in main.ts to get to it — mainly for verifying the pipeline
   * end to end. Safe to call any time; see `runPayroll`'s doc comment for
   * why repeat calls never double-pay.
   */
  "POST /api/admin/payroll/run": async (ctx) => {
    requireAdmin(ctx);
    return runPayroll(ctx);
  },

  /** Admin: the review queue. Applicant contact and licence details are real
   *  personal data, so this is the one place in the app gated by a shared
   *  secret rather than a per-account role — see requireAdmin. */
  "GET /api/drivers/applications": (ctx) => {
    requireAdmin(ctx);
    return ctx.store.data.driverApplications;
  },

  "POST /api/drivers/applications/:id/review": (ctx, p, body) => {
    requireAdmin(ctx);
    const id = req(p, "id");
    const app = ctx.store.data.driverApplications.find((a) => a.id === id);
    if (!app) throw notFound("Application");
    const status = String(body?.status ?? "") as Exclude<ApplicationStatus, "withdrawn">;
    const reviewed = reviewApplication(app, status, ctx.now(), body?.note ? String(body.note) : undefined);
    ctx.store.update((db) => {
      const i = db.driverApplications.findIndex((a) => a.id === id);
      db.driverApplications[i] = reviewed;
    });
    return reviewed;
  },
};
