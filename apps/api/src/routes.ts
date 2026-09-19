import {
  REWARD_CATALOG, DRINK_CATALOG,
  isPlanReleased, releasedPlans,
  LAUNCH_DISCOUNT_RATE, LAUNCH_WINDOW_END, LAUNCH_WINDOW_START, joinedDuringLaunch,
  newReferralCode, normalizeReferralCode, shareMessage, launchOfferFor,
  SERVICE_LIVE_AT, serviceIsLive,
  HIRING_BENEFITS, PRELAUNCH_HEADCOUNT, SOLO_HEADCOUNT, STAFF_ROLES, monthlyRosterCents, prelaunchBudget,
  subscribersToCarryRoster,
  reviewStaffApplication, submitStaffApplication, withdrawStaffApplication,
  addSubscriber, activeSubscribers, newUnsubscribeToken, unsubscribe,
  type NewsletterSource, type StaffRole,
  ELITE_SERVICES, commissionCentsFor, disclosuresFor, doctorAvailableFor, findEliteService,
  validateEliteRequest, findEliteEvent, upcomingEliteEvents, eliteEventHasRoom,
  activeGrantsFor, alcoholicDrinks, answerCheckIn, award, balance, buildRecoveryPlan,
  PLANS,
  createGrant, deriveAlerts, estimateBac, hasFeature, isElitePlan, leaderboard, logDrink, redeem,
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
  isEnabled, flagNote, ridesFor, featureLabel,
  isAutomatic, SECURE_TRANSPORT_DISCLOSURES, FLIGHT_TRACKING_DISCLOSURES, diffFlight, hasLanded,
  buildManualFlightInfo,
  RED_FLAGS, assess, assessNonEmergency, dispatcherScript, emergencyNumberFor,
  shouldPromptEmergencyCheck, totalStandardDrinks as sumStandardDrinks,
  validateBody, validateDrinkLimit,
  attachPaymentMethod, authorizeExactHold, authorizeHold, canBookAutomatically, captureHold, releaseHold,
  CARD_NETWORKS, PAY_BRANDS, PAY_BRAND_LABEL, PAY_BRAND_SPEC, PROCESSOR_FOR_BRAND,
  CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES, conciergeCategoryLabel, validateConciergeRequest,
  isAssistantAvailable, recordVoiceMessage, voiceMessagesFor, serviceFeeFor, assistantPayoutFor, totalChargeCents,
  clampHours, defaultHoursFor, isHourlyCategory,
  DESK_TASK_ACCESS_RULE, DESK_TASK_KINDS, deskTaskAllowanceFor, deskTasksUsedIn, monthBoundsFor,
  remainingDeskTasks, validateDeskTask,
  CLUB_DISCLOSURES, CLUB_EXPERIENCES, CLUB_PERKS, duesForCents,
  minMembersForOverhead, overheadCovered, pickMonthlyExperience, clubMonthKey,
  eliteSpendingAllowanceCents, eliteUnlockThresholdCents, eliteUnlockedByRevenue, eliteUnlockProgressPercent,
  ELITE_UNLOCK_TARGET_CLIENTS_LOW, ELITE_UNLOCK_TARGET_CLIENTS_HIGH, ELITE_UNLOCK_SAFETY_MULTIPLE,
  validatePickupRequest, ARRANGE_RIDE_FEE_CENTS, recordRideCost,
  validateAiDraftInstruction,
  markRead, messagesForTask, sendTextMessage,
  isQuickTaskEligible, validateIdentityPhoto, validateDisputeReason,
  canRevealCard, remainingSpendCents, unaccountedSpendCents, validateSpendChange, validateSpendRequest,
  earningsFor, previousPayoutPeriod, totalEarningsCents, unpaidEarningsCents, validatePayoutDestination,
  applyAdjustments, outstandingClawbackCents,
  isInLaunchMarket, launchMarketFor, launchMarketNames, LAUNCH_MARKETS, REFERENCE_MARKET,
  type LaunchMarketId,
  hireFromApplication, isOnRoster, rosterFor, standDown,
  canAccess, isActive as isMasterAccountActive, recordAccess, revoke as revokeMasterAccess, scopesFor,
  type MasterAccount, type MasterAuditEntry, type MasterScope,
  buildStatement, chargesFor, describeRail, failCharge, recordCharge, refundCharge, settleCharge,
  kindLabel, railsUsed,
  cancelSubscription, changePlan, describeSubscription, effectivePlan, startSubscription,
  requiresHelpDeskToDowngrade,
  devicesFor, registerDevice, upsertDevice, messagesForAssistantTask,
  submitApplication, reviewApplication, withdrawApplication,
  compilePricing, ownerAccruedCentsFor, type CurrentPricing, type PriceOverride,
} from "@safehubby/core";
import type {
  Alert, ApplicationStatus, AssistantProfile, Basket, Cadence, CartLine, ChargeKind, ConciergeCategory,
  ConciergeTask, ConciergeTaskInput, CrewMemberFacts, DeskTask, DeskTaskKind, DriverTier, EliteBooking, EliteServiceId,
  PickupRequest, Resume,
  Feature, GameId, IdentityPhoto, NightOut,
  SpendRequest,
  OrderProvider, Platform, PlanId, PushMessage, RedFlagId, Subscription, TriggerBand,
  PaymentProcessor, PayBrand, ChargeProcessorPort,
} from "@safehubby/core";
import { mockDelivery, mockRides, mockRoutes } from "./adapters/mock-providers.ts";
import { venues as venuePort, venueSource } from "./adapters/venues.ts";
import {
  concierge, deliveryDispatcher, fulfillmentStatus, secureTransport, uberCancel, uberEstimates,
  uberForBusiness,
} from "./adapters/fulfillment.ts";
import { flightTracking } from "./adapters/flight-tracking.ts";
import { revolutCards } from "./adapters/cards.ts";
import { revolutPayouts } from "./adapters/payouts.ts";
import { createSetupIntent, ensureStripeCustomer, stripeProcessor } from "./adapters/stripe.ts";
import { eliteDesk } from "./adapters/elite-desk.ts";
import { aiAssist } from "./adapters/ai-assist.ts";
import { paypalProcessor } from "./adapters/paypal.ts";
import { athMovilProcessor } from "./adapters/ath-movil.ts";
import { placeSearch } from "./adapters/places-search.ts";
import { buildStoreNote, storeLocator, walmartLink } from "./adapters/grocery.ts";
import { push } from "./adapters/push.ts";
import { email } from "./adapters/email.ts";
import { guardianMessages } from "./notify.ts";
import { renewDueSubscriptions } from "./billing.ts";
import { newId, type StoreLike } from "./store.ts";
import {
  ASSISTANT_SESSION_TTL_MS, MASTER_SESSION_TTL_MS, RateLimiter, hashPassword, newSessionToken, newTempPassword,
  normalizeEmail, SESSION_TTL_MS, secureFraction, sweepExpiredSessions, validatePassword, verifyPassword,
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
  /**
   * The signed-in master (owner/secretary) account for this request — a
   * third identity space, resolved from its own cookie and session table
   * (`MasterSession` in store.ts), never conflated with `actorId` or
   * `assistantActorId`. See master-access.ts for what the role can reach.
   */
  masterActorId: string | null;
  setMasterSession?: (token: string | null) => void;
  masterSessionToken?: string | null;
  clientKey: string;
  /** Per-instance, not module-global: one server's traffic must not throttle
   *  another's, and tests need isolation between instances. */
  limiters: {
    login: RateLimiter; assistantLogin: RateLimiter; masterLogin: RateLimiter; signup: RateLimiter;
    applications: RateLimiter; codes: RateLimiter; places: RateLimiter; flights: RateLimiter;
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

/** Settled revenue in the trailing 30 days — a rolling window rather than a
 *  calendar month, so the Elite unlock gate (see billing.ts) doesn't fall
 *  back to zero for a few days every month and misrepresent progress. */
function trailingRevenueCents(ctx: Ctx): number {
  const cutoff = ctx.now().getTime() - 30 * 86_400_000;
  return ctx.store.data.charges
    .filter((c) => c.status === "settled" && c.settledAt && Date.parse(c.settledAt) >= cutoff)
    .reduce((sum, c) => sum + c.amountCents, 0);
}

function eliteUnlockStatus(ctx: Ctx) {
  const trailing = trailingRevenueCents(ctx);
  return {
    thresholdCents: eliteUnlockThresholdCents(),
    trailingRevenueCents: trailing,
    unlocked: eliteUnlockedByRevenue(trailing),
    percent: eliteUnlockProgressPercent(trailing),
    targetClientsLow: ELITE_UNLOCK_TARGET_CLIENTS_LOW,
    targetClientsHigh: ELITE_UNLOCK_TARGET_CLIENTS_HIGH,
    safetyMultiple: ELITE_UNLOCK_SAFETY_MULTIPLE,
  };
}

/** An optional résumé attached to a job application — see resume.ts for why
 *  this is the one place either apply route accepts a file at all. Absent
 *  entirely rather than a half-filled object when the applicant skipped it. */
function resumeFrom(body: any, now: Date): Resume | undefined {
  if (!body?.resume) return undefined;
  return {
    base64: String(body.resume.base64 ?? ""),
    mimeType: String(body.resume.mimeType ?? ""),
    fileName: String(body.resume.fileName ?? ""),
    uploadedAt: now.toISOString(),
  };
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
 * Every processor Safehubby holds an account with, keyed by the id stored on
 * a payment method. Keeping it as one table is what lets the status endpoint
 * and the attach handler stay in agreement — the previous pair of ternaries
 * had to be edited in two places to add a third processor, and silently
 * defaulted anything unrecognised to Stripe.
 */
const PROCESSOR_PORTS: Record<PaymentProcessor, ChargeProcessorPort> = {
  stripe: stripeProcessor,
  paypal: paypalProcessor,
  "ath-movil": athMovilProcessor,
};

/**
 * Stripe's own `payment_method_types` enum for each brand it settles. Their
 * spelling, not ours — `cashapp` and `amazon_pay` are what the API expects,
 * and guessing at either produces a SetupIntent Stripe rejects.
 */
const STRIPE_PAYMENT_METHOD_TYPE: Partial<Record<PayBrand, string>> = {
  klarna: "klarna",
  cashapp: "cashapp",
  "amazon-pay": "amazon_pay",
  link: "link",
};

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
function conciergeInputFrom(body: any): ConciergeTaskInput {
  return {
    category: body?.category,
    note: String(body?.note ?? ""),
    location: { lat: body?.location?.lat, lng: body?.location?.lng, label: body?.location?.label },
    spendCapCents: Number(body?.spendCapCents),
    quickTask: body?.quickTask === true,
    ...(body?.peopleCount === undefined ? {} : { peopleCount: Number(body.peopleCount) }),
    ...(body?.hours === undefined ? {} : { hours: Number(body.hours) }),
    ...(body?.flight === undefined
      ? {}
      : { flight: { flightNumber: String(body.flight?.flightNumber ?? ""), date: String(body.flight?.date ?? "") } }),
  };
}

/** The hours a booking is priced on: what was asked for on hourly work, the
 *  category's standard block when the client sent none, and nothing at all
 *  for an errand, which is priced per task. Kept here rather than defaulted
 *  inside the pricing functions so the number stamped on the task is the
 *  number the quote was computed from. */
function bookedHoursFor(input: ConciergeTaskInput): number | undefined {
  if (!isHourlyCategory(input.category)) return undefined;
  return clampHours(input.hours ?? defaultHoursFor(input.category));
}

/**
 * How many people a task may be priced for: what the subscriber asked for,
 * capped at the seats their plan actually includes. A two-seat Premium plan
 * cannot book a six-person task, so the household multiplier can never be
 * inflated past what someone is paying for — and the cap is applied here,
 * where the plan is known, rather than in `packages/core`, which
 * deliberately knows nothing about the plan catalogue.
 */
function peopleCountFor(ctx: Ctx, travelerId: string, input: ConciergeTaskInput): number {
  const seats = findPlan(planOf(ctx, travelerId)).seats;
  return Math.max(1, Math.min(input.peopleCount ?? 1, seats));
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
 * Refreshes the tracked flight on every airport pickup still in progress, and
 * tells the customer what actually changed.
 *
 * Why this is a server sweep rather than the client polling: the moment that
 * matters most — the plane is on the ground and the person is walking out —
 * is the moment nobody is looking at their phone. A refresh button (which the
 * request detail screen still has) only works for someone already watching.
 *
 * The provider is asked only about flights there is still something to learn
 * about. Once a flight has landed, been cancelled or been diverted, its story
 * is over and re-asking spends quota to be told the same thing, so those are
 * skipped. `diffFlight` reports transitions only, so a task whose flight has
 * not moved produces no push at all, however often this runs.
 *
 * A provider miss never disturbs the task: the stored snapshot is simply left
 * as the last thing known to be true, which is the same rule booking follows
 * when the lookup fails outright.
 */
export async function runFlightSweep(ctx: Ctx): Promise<{ checked: number; changed: number; pushed: number }> {
  if (!isAutomatic(flightTracking.status)) return { checked: 0, changed: 0, pushed: 0 };

  const live = ctx.store.data.conciergeTasks.filter((t) =>
    t.status === "in-progress"
    && t.category === "airport-pickup"
    && t.flightNumber && t.flightDate
    // Nothing further to learn once the flight has resolved one way or another.
    && !(t.flight && (hasLanded(t.flight) || t.flight.status === "cancelled" || t.flight.status === "diverted")));

  let checked = 0;
  let changed = 0;
  const messages: PushMessage[] = [];

  for (const task of live) {
    const fresh = await flightTracking
      .lookup({ flightNumber: task.flightNumber!, date: task.flightDate! })
      .catch(() => null);
    checked += 1;
    if (!fresh) continue;

    const previous = task.flight;
    const updates = previous ? diffFlight(previous, fresh) : [];

    ctx.store.update((db) => {
      const row = db.conciergeTasks.find((t) => t.id === task.id);
      if (row) row.flight = fresh;
    });
    if (updates.length === 0) continue;
    changed += 1;

    // Only the most urgent change per sweep. Three separate buzzes about one
    // flight in one minute is how a useful channel becomes one people mute,
    // and `diffFlight` already returns them worst-first.
    const top = updates[0]!;
    for (const device of devicesFor(ctx.store.data.pushDevices, task.travelerId)) {
      messages.push({
        token: device.token,
        platform: device.platform,
        title: `${fresh.airlineName} ${fresh.flightNumber}`,
        body: top.message,
        interruption: top.urgency,
        alertId: `flight:${task.id}:${top.kind}`,
        taskId: task.id,
      });
    }
  }

  const pushed = messages.length;
  if (pushed > 0) await push.send(messages).catch((err) => console.error("[safehubby] Flight push failed:", err));
  return { checked, changed, pushed };
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

    const earnedCents = totalEarningsCents(earnings);
    const taskIds = earnings.map((e) => e.taskId);
    // Any open clawback (see AssistantAdjustment, disputeConciergeTask) comes
    // out of this period's earnings before a cent is actually paid out.
    const openAdjustments = ctx.store.data.assistantAdjustments.filter(
      (a) => a.assistantId === assistantId && a.remainingCents > 0,
    );
    const { payableCents, consumed } = applyAdjustments(earnedCents, openAdjustments);

    const payoutId = newId("payout");
    const base = {
      id: payoutId, assistantId, periodStart: period.start.toISOString(), periodEnd: period.end.toISOString(),
      taskIds, totalCents: payableCents, createdAt: ctx.now().toISOString(),
    };
    const applyConsumed = (db: typeof ctx.store.data) => {
      for (const c of consumed) {
        const adj = db.assistantAdjustments.find((a) => a.id === c.id);
        if (adj) adj.remainingCents -= c.amountCents;
      }
    };

    // Fully or partially absorbed by an outstanding clawback — nothing to
    // transfer, so this settles immediately with no payout provider involved.
    // The underlying tasks' earnings are still spent, just against debt
    // instead of a bank transfer, so they're tagged the same as a real payout.
    if (payableCents === 0) {
      ctx.store.update((db) => {
        db.payouts.push({ ...base, status: "paid", paidAt: ctx.now().toISOString() });
        applyConsumed(db);
        for (const t of db.conciergeTasks) if (taskIds.includes(t.id)) t.payoutId = payoutId;
      });
      paid += 1;
      continue;
    }

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
        amountCents: payableCents, currency: "USD", recipient, reference: payoutId,
      });
      ctx.store.update((db) => {
        db.payouts.push({ ...base, status: "paid", paidAt: ctx.now().toISOString(), providerReference: result.payoutId });
        applyConsumed(db);
        for (const t of db.conciergeTasks) if (taskIds.includes(t.id)) t.payoutId = payoutId;
      });
      paid += 1;
      totalCents += payableCents;
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

  // Spend nobody answered for comes out of the assistant's pay, through the
  // same clawback ledger a customer dispute uses. A receipt answers for a
  // purchase; so does a change note — see `isSpendAccountedFor`. The
  // assistant is warned about this in the portal before they mark a task
  // done, so it is never a surprise deduction.
  const unaccounted = unaccountedSpendCents(task);
  if (unaccounted > 0 && task.assistantId) {
    const assistantId = task.assistantId;
    ctx.store.update((db) => {
      db.assistantAdjustments.push({
        id: newId("adj"), assistantId, taskId: task.id,
        reason: `No receipt or explanation for $${(unaccounted / 100).toFixed(2)} of spend on this task.`,
        totalCents: unaccounted, remainingCents: unaccounted, createdAt: ctx.now().toISOString(),
      });
    });
  }

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

/**
 * A customer's dispute over a completed task — never delivered, or the
 * assistant kept the money — upheld and refunded. Policy: the loss comes
 * out of the assistant's own future pay, not Safehubby's margin, so this
 * both refunds the charge in full and opens an `AssistantAdjustment` for
 * the same amount against whichever assistant was assigned. A task with no
 * assistant on record (the network's own generic dispatch, no specific
 * person picked) still gets refunded — there's simply no one to claw the
 * loss back from, which is said in the response rather than silently
 * skipped.
 */
function disputeConciergeTask(ctx: Ctx, task: ConciergeTask, reason: string): { task: ConciergeTask; refundedCents: number; clawedBack: boolean } {
  if (task.status !== "completed") {
    throw new HttpError(400, "Only a completed task can be disputed — cancel one still in progress instead.");
  }
  if (task.disputed) throw new HttpError(400, "This task has already been disputed.");
  validateDisputeReason(reason);

  const charge = ctx.store.data.charges.find((c) => c.id === task.chargeId);
  if (!charge || charge.status !== "settled") {
    throw new HttpError(400, "This task's charge can't be refunded — it may already be refunded elsewhere.");
  }
  const refundedCents = charge.amountCents;

  updateCharge(ctx, task.chargeId, (c) => refundCharge(c, ctx.now()));
  ctx.store.update((db) => {
    const t = db.conciergeTasks.find((x) => x.id === task.id)!;
    t.disputed = true; t.disputeReason = reason; t.refundedCents = refundedCents;
    if (t.assistantId) {
      db.assistantAdjustments.push({
        id: newId("adj"), assistantId: t.assistantId, taskId: t.id, reason: `Customer dispute: ${reason}`.slice(0, 300),
        totalCents: refundedCents, remainingCents: refundedCents, createdAt: ctx.now().toISOString(),
      });
    }
  });

  const updated = ctx.store.data.conciergeTasks.find((t) => t.id === task.id)!;
  return { task: updated, refundedCents, clawedBack: Boolean(task.assistantId) };
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
 * The launch party, as the API reports it. One place that knows whether the
 * window is open, so the landing page, the share sheet and the plans screen
 * cannot disagree about it.
 */
function launchStatus(now: Date) {
  const open = joinedDuringLaunch(now.toISOString());
  // Three states, not two: before the window opens, "the discount has closed"
  // is simply untrue, and it is the state the app is actually in for every
  // day between shipping this and the launch date.
  const phase = open ? "open" : now.getTime() < Date.parse(LAUNCH_WINDOW_START) ? "upcoming" : "closed";
  const pct = `${(LAUNCH_DISCOUNT_RATE * 100).toFixed(0)}%`;
  const note = phase === "open"
    ? `Launch party: sign up before ${new Date(LAUNCH_WINDOW_END).toDateString()} and take ${pct} off your first year.`
    : phase === "upcoming"
      ? `Launch party opens ${new Date(LAUNCH_WINDOW_START).toDateString()}: ${pct} off your first year for everyone who joins in the window.`
      : "The launch-party discount has closed.";
  return { open, phase, discountRate: LAUNCH_DISCOUNT_RATE, startsAt: LAUNCH_WINDOW_START, endsAt: LAUNCH_WINDOW_END, note };
}

/**
 * The Elite desk is gated twice on purpose: the release flag and the plan
 * feature. The flag check comes first, so a deployment that has not shipped
 * Elite answers "no such thing" rather than "upgrade your plan".
 */
/**
 * The Elite desk, gated on both things that have to be true: the ladder is
 * released, and the caller is actually on one of its rungs.
 *
 * The plan check is the half that was missing. While the flag was off this
 * route 404'd for everyone, so nothing exercised it — `requireElite` took a
 * ctx it did not read and checked only the flag, which meant releasing the
 * ladder would have opened the desk to every signed-in account regardless of
 * plan. Booking was still covered by `requireFeature` downstream, but the
 * catalogue was not: it answered 200 to anyone and handed back the partner
 * desk's configuration status with it.
 *
 * 402 rather than 404 for the plan half, matching `requireFeature`. Hiding
 * the desk behind a "not found" made sense while the ladder was unreleased
 * and the tier did not publicly exist; now that it is in the catalogue and
 * openly priced, a member who could simply upgrade should be told so rather
 * than shown a dead end. The flag half stays 404 — an unreleased ladder
 * genuinely is not there.
 */
function requireElite(ctx: Ctx): void {
  if (!isEnabled("elite-tier")) throw new HttpError(404, flagNote("elite-tier"));
  if (!isElitePlan(planOf(ctx, actor(ctx)))) {
    throw new HttpError(402, "The luxury desk is part of Elite. Upgrade to reach it.");
  }
}

/** The signed-in master account for this request, or null — resolved from
 *  `ctx.masterActorId`, which the server layer already checked against a
 *  live, unexpired session. */
function masterAccountOf(ctx: Ctx): MasterAccount | null {
  if (!ctx.masterActorId) return null;
  return ctx.store.data.masterAccounts.find((a) => a.id === ctx.masterActorId) ?? null;
}

/**
 * Admin gate, with two ways in.
 *
 * The original version checked only `SAFEHUBBY_ADMIN_KEY` — one shared
 * secret with no idea who used it, "the minimum that keeps the review
 * endpoints from being open to the internet, not a real access-control
 * system," by its own former doc comment. That per-account system now
 * exists (master-access.ts) — see `POST /api/admin/master-accounts` — so
 * this accepts either: the legacy shared key (kept for scripts and the
 * bootstrap route itself, which cannot yet hold a master session), or a
 * signed-in master account whose role actually carries `scope`. The
 * shared-key path stays unattributed on purpose — it always was — which is
 * exactly the gap a real master account closes.
 */
/**
 * Where the master pricing dashboard starts before any override — mirrors
 * the real rates in concierge.ts, driver-pay.ts and staffing.ts (PA
 * $35/hr, a $4 quick task — $24/hr at the ten-minute typical length,
 * see QUICK_TASK_ASSISTANT_PAYOUT_CENTS's own comment — drivers' rate
 * card, the desk roles' $22/hr). Kept as one constant, rather than typed
 * out at each pricing route, so "someone edits one copy and the
 * dashboard now disagrees with itself about a starting rate" cannot
 * happen.
 */
function defaultPricing(): CurrentPricing {
  return {
    paHourlyCents: 3500,
    errandRunnerTaskCents: 400,
    driverStandard: { baseCents: 300, perMileCents: 90, perMinuteCents: 18 },
    driverSecureTransport: { baseCents: 1500, perMileCents: 450, perMinuteCents: 60 },
    secretaryHourlyCents: 2200,
    socialMediaManagerHourlyCents: 2200,
    ownerMonthlyCents: 0,
  };
}

/** Owner accrual plus the day-count context the dashboard needs to show it
 *  as "$X so far (day N of M)" rather than a bare, unexplained number. */
function ownerAccrualFor(
  ownerMonthlyCents: number, now: Date,
): { accruedCents: number; dayOfMonth: number; daysInMonth: number } {
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    accruedCents: ownerAccruedCentsFor(ownerMonthlyCents, now),
    dayOfMonth: Math.min(now.getUTCDate(), daysInMonth),
    daysInMonth,
  };
}

function requireAdmin(ctx: Ctx, scope: MasterScope = "operations"): void {
  const expected = process.env.SAFEHUBBY_ADMIN_KEY;
  if (expected && ctx.adminKey === expected) return;

  const account = masterAccountOf(ctx);
  if (account && isMasterAccountActive(account, ctx.now()) && canAccess(account, scope, ctx.now())) return;

  if (!expected && !account) throw new HttpError(503, "Admin access is not configured on this server.");
  throw new HttpError(401, "Bad or missing admin key.");
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

/**
 * Nothing that dispatches a real person runs before the service is live.
 *
 * The pre-launch window is two months of hiring with no roster to dispatch
 * from, and the promise made at signup is explicit: you are not charged, and
 * you are not served, until launch day. Billing already honours the first
 * half (`billingStartsAt`); this is the second.
 *
 * Without it these routes still fail — no fulfilment provider is configured
 * — but they fail with "the concierge partner is not configured", which is
 * an operator's sentence, not an answer to the person asking. Somebody who
 * signed up during the launch party should be told when the service starts,
 * because that is a date we chose and they agreed to.
 *
 * Deliberately not applied to quotes, plan changes, check-ins, SOS or
 * location sharing. The safety basics are free and live from day one — the
 * app's own rule — and a launch window is no reason to stop someone telling
 * a friend where they are.
 */
function requireServiceLive(ctx: Ctx): void {
  if (serviceIsLive(ctx.now())) return;
  const when = new Date(SERVICE_LIVE_AT).toDateString();
  throw new HttpError(
    503,
    `Safehubby's dispatch service starts on ${when}. You're signed up and nothing is being charged until then — check-ins, location sharing and SOS work now.`,
  );
}

/**
 * Which market a task happens in. No longer used for pay — that is one
 * universal rate now (see market-pay.ts) — but still what decides which
 * assistants on the roster can be offered for it.
 */
function payMarketFor(location: { lat: number; lng: number }): LaunchMarketId {
  return launchMarketFor(location)?.id ?? REFERENCE_MARKET;
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
    // Tighter than either login above: a master key reaches every customer's
    // data across every scope its role carries, the single highest-value
    // credential in this system, on an account count small enough that a
    // legitimate person is never going to need many tries.
    masterLogin: new RateLimiter(5, 15 * 60_000),
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
    /** Flight lookups bill per call the same way places do. Generous enough
     *  to check a delayed flight every few minutes while waiting on it. */
    flights: new RateLimiter(30, 60 * 60_000),
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
    throw new HttpError(402, `Your plan does not include "${featureLabel(feature)}". Upgrade to unlock it.`);
  }
}

/**
 * The concierge gate, split in two.
 *
 * `personal-concierge` covers the whole catalogue and is a paid-tier feature.
 * `quick-tasks` is free-tier and covers only the bounded, ten-minute pickups
 * — `grab-something` and `run-errand` — booked with `quickTask: true`, at the
 * discounted rate `QUICK_TASK_ASSISTANT_PAYOUT_CENTS` pays for. Anything else
 * (waiting with someone, checking on someone, book-and-buy, airport pickup,
 * or a standard-rate grab/errand) still needs the paid feature: those are
 * open-ended time with a person, not a quick pickup, and giving that away
 * free would just be `personal-concierge` under a different name.
 */
function requireConciergeAccess(
  ctx: Ctx, travelerId: string, category: ConciergeCategory, quickTask: boolean | undefined,
): void {
  const traveler = ctx.store.data.travelers.find((t) => t.id === travelerId);
  if (!traveler) throw notFound("Traveler");
  if (quickTask && isQuickTaskEligible(category) && hasFeature(traveler.planId, "quick-tasks")) return;
  requireFeature(ctx, travelerId, "personal-concierge");
}

/** The wider pharmacy-run menu comes with Premium Plus and Family, not with
 *  every plan — see `extended-menu` in billing.ts. Reachable in practice
 *  only from the hand-send path: the authorize path requires
 *  `supply-delivery` first, and every plan that has that now also has the
 *  extended menu. Kept rather than deleted because the two features are
 *  separate decisions and could be priced apart again. */
function requireBasketAccess(ctx: Ctx, travelerId: string, basket: Basket): void {
  if (basket.tier === "premium" && !hasFeature(planOf(ctx, travelerId), "extended-menu")) {
    throw new HttpError(402, `"${basket.name}" is part of the extended menu, included with Premium Plus and Family. Upgrade to unlock it.`);
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
      referralCode: newReferralCode(),
    };
    const token = newSessionToken();
    const now = ctx.now();

    // Who sent them, if anyone. An unknown or self-referring code is simply
    // ignored rather than failing the signup — losing an account over a
    // mistyped invite would be the most expensive possible validation.
    const offered = normalizeReferralCode(String(body?.referralCode ?? ""));
    const referrer = offered
      ? ctx.store.data.travelers.find((t) => t.referralCode === offered)
      : undefined;

    ctx.store.update((db) => {
      db.travelers.push(traveler);
      if (referrer) {
        db.referrals.push({
          id: newId("ref"), referrerId: referrer.id, referredId: traveler.id,
          code: offered, createdAt: now.toISOString(),
        });
        (db.points[referrer.id] ??= []).push(
          award(newId("pt"), "referredAFriend", now, `${traveler.displayName} joined with your code`),
        );
      }
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
  /**
   * Which processors can actually verify a payment method right now. Apple
   * Pay and Google Pay aren't listed separately — both are wallets Stripe
   * surfaces on its own, so their availability is a client-side capability
   * check (`PaymentRequest.canMakePayment()`) against the same `stripe`
   * entry, not a separate backend integration. See stripe.ts's doc comment.
   */
  "GET /api/payment/processors": () => ({
    processors: Object.values(PROCESSOR_PORTS).map((p) => p.status),
    // The brands each configured processor can surface, and the card
    // networks the card path already accepts. Both are display data the
    // payment sheet reads rather than hardcoding — see `PayBrand` and
    // `CARD_NETWORKS` in payment.ts for why neither is a processor.
    brands: PAY_BRANDS.map((id) => ({
      id, label: PAY_BRAND_LABEL[id], processor: PROCESSOR_FOR_BRAND[id],
      available: isAutomatic(PROCESSOR_PORTS[PROCESSOR_FOR_BRAND[id]].status),
    })),
    cardNetworks: CARD_NETWORKS,
  }),

  /**
   * A SetupIntent for the Payment Element, so a method that is not a typed
   * card can be collected without charging anything.
   *
   * The card and wallet paths do not come through here — Stripe.js tokenizes
   * those directly — but Klarna, Cash App Pay, Amazon Pay and Link all need
   * an intent to render against. `brand` picks which, and is checked against
   * core's own table rather than passed through: a brand that cannot be
   * saved off-session, or that settles somewhere other than Stripe, has no
   * business creating a Stripe SetupIntent.
   */
  "POST /api/payment/setup-intent": async (ctx, _p, body) => {
    const me = actor(ctx);
    const brand = body?.brand as PayBrand | undefined;
    const spec = brand ? PAY_BRAND_SPEC[brand] : undefined;
    const type = brand ? STRIPE_PAYMENT_METHOD_TYPE[brand] : undefined;
    // `type` is the narrower check and the one that matters: Apple Pay and
    // Google Pay are savable Stripe brands with no entry here on purpose,
    // because they are collected through the Payment Request sheet instead
    // and never need an intent from this route.
    if (!spec || !type || spec.processor !== "stripe" || !spec.savable) {
      throw new HttpError(400, "That isn't a payment method this screen collects with a SetupIntent.");
    }
    if (!isAutomatic(stripeProcessor.status)) {
      throw new HttpError(503, `Stripe isn't configured. ${stripeProcessor.status.requires}`);
    }

    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    if (!traveler) throw new HttpError(404, "No such traveler.");

    const customerId = await ensureStripeCustomer({
      existingId: ctx.store.data.stripeCustomers[me],
      email: traveler.email,
      name: traveler.displayName,
    });
    ctx.store.update((db) => { db.stripeCustomers[me] = customerId; });

    const { clientSecret } = await createSetupIntent({
      customerId,
      paymentMethodType: type,
    });
    return { clientSecret };
  },

  "GET /api/account/payment-method": (ctx) => {
    const me = actor(ctx);
    const method = ctx.store.data.paymentMethods[me] ?? null;
    return { method, live: hasLivePaymentMethod(ctx, me) };
  },

  "POST /api/account/payment-method": async (ctx, _p, body) => {
    const me = actor(ctx);
    const processor: PaymentProcessor =
      body?.processor === "paypal" || body?.processor === "ath-movil" ? body.processor : "stripe";
    // A brand the client does not recognise is dropped rather than rejected —
    // it is display-only. One that settles through a different processor is
    // not dropped, though: `attachPaymentMethod` refuses it, since claiming
    // Venmo against Stripe would misreport where the money actually went.
    const payWith: PayBrand | undefined =
      PAY_BRANDS.includes(body?.payWith) ? body.payWith : undefined;
    const port = PROCESSOR_PORTS[processor];

    let brand = String(body?.brand ?? "");
    let last4 = String(body?.last4 ?? "");
    let expMonth = body?.expMonth === undefined ? undefined : Number(body.expMonth);
    let expYear = body?.expYear === undefined ? undefined : Number(body.expYear);

    // When the real processor is configured, trust only what it reports back
    // for a token the browser's own SDK produced — never the brand/last4/expiry
    // a client claims. Without real credentials, this falls back to the typed
    // mock form the UI has always offered, the same handoff discipline every
    // other adapter in this app follows.
    if (isAutomatic(port.status)) {
      const token = String(body?.token ?? "");
      if (!token) throw new HttpError(400, `Missing ${port.status.name} payment token.`);
      const verified = await port.verifyMethod(token);
      brand = verified.brand;
      last4 = verified.last4;
      expMonth = verified.expMonth;
      expYear = verified.expYear;
    }

    const method = attachPaymentMethod({
      id: newId("pm"),
      processor,
      ...(payWith ? { payWith } : {}),
      brand,
      last4,
      ...(expMonth === undefined ? {} : { expMonth }),
      ...(expYear === undefined ? {} : { expYear }),
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

  /**
   * A real, coordinate-backed home address, saved once and reused — the
   * missing piece behind sending a real person somewhere. `homeLabel` (set
   * at signup) was always just a name on a screen; nothing before this
   * turned it into a place a driver or an errand runner could actually be
   * sent to.
   */
  "GET /api/account/address": (ctx) => {
    const me = actor(ctx);
    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    return { address: traveler?.homeAddress ?? null };
  },

  "POST /api/account/address": (ctx, _p, body) => {
    const me = actor(ctx);
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const label = String(body?.label ?? "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new HttpError(400, "Pick a real location — drag the pin, or search for the address.");
    }
    if (!label) throw new HttpError(400, "Give this address a name, so it reads clearly wherever it's used.");
    const address = { lat, lng, label };
    ctx.store.update((db) => {
      const traveler = db.travelers.find((t) => t.id === me);
      if (traveler) traveler.homeAddress = address;
    });
    return { address };
  },

  /**
   * What to share, and the code that makes it count. The message text comes
   * from core (`shareMessage`) so the wording is identical wherever it is
   * sent from, and the code is minted at signup rather than on demand so the
   * same person always shares the same one.
   */
  "GET /api/share": (ctx) => {
    const me = actor(ctx);
    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    if (!traveler) throw notFound("Account");

    // Minted lazily for accounts that predate referral codes, so an older
    // account gets one the first time it opens the share sheet rather than
    // having nothing to share.
    let code = traveler.referralCode;
    if (!code) {
      code = newReferralCode();
      ctx.store.update((db) => {
        const t = db.travelers.find((x) => x.id === me);
        if (t) t.referralCode = code;
      });
    }

    const url = `${process.env.SAFEHUBBY_PUBLIC_URL ?? "https://safehubby.app"}/?ref=${encodeURIComponent(code)}`;
    const joined = ctx.store.data.referrals.filter((r) => r.referrerId === me);
    return {
      code,
      url,
      message: shareMessage(code, url),
      joined: joined.length,
      launch: launchStatus(ctx.now()),
    };
  },

  "GET /api/auth/me": (ctx) => {
    if (!ctx.actorId) return { traveler: null };
    const t = ctx.store.data.travelers.find((x) => x.id === ctx.actorId);
    return { traveler: t ? publicTraveler(t) : null };
  },

  "GET /api/catalog": (ctx) => {
    const eliteUnlock = eliteUnlockStatus(ctx);
    return {
      drinks: DRINK_CATALOG,
      // Only what has actually shipped: the Elite tier is built and held
      // behind `elite-tier` (see features.ts), so it is absent here rather
      // than listed as something a subscriber can't have. Elite plans that
      // do ship stay visible even while `locked` — shown as "coming soon"
      // with what's included, per `eliteUnlock` below, rather than hidden;
      // see billing.ts's `eliteUnlockThresholdCents` for why a real cash
      // cushion, not just this flag, decides whether they can be joined yet.
      //
      // Each plan carries what it would actually cost to join today, discount
      // included. Computed here rather than in the browser so the price on the
      // card is the price the server will charge — a plan card showing full
      // price under a banner promising a discount is the two disagreeing.
      plans: releasedPlans().map((plan) => ({
        ...plan,
        monthlyOffer: launchOfferFor(plan.monthlyCents, ctx.now()),
        annualOffer: launchOfferFor(plan.annualCents, ctx.now()),
        ...(isElitePlan(plan.id) ? { locked: !eliteUnlock.unlocked } : {}),
      })),
      rewards: REWARD_CATALOG,
      // The one launch-party fact a signed-out visitor needs, on a request the
      // landing page already makes. A separate public endpoint for it would be
      // a second round trip to say one boolean.
      launch: launchStatus(ctx.now()),
      eliteUnlock,
    };
  },

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
    if (!isPlanReleased(plan.id)) throw new HttpError(404, flagNote("elite-tier"));
    if (isElitePlan(plan.id) && !eliteUnlockedByRevenue(trailingRevenueCents(ctx))) {
      throw new HttpError(
        404,
        "Elite is coming soon — it unlocks once revenue covers the spending allowance for our first members. See progress on the pricing page.",
      );
    }
    catchUpBilling(ctx);
    const existing = subscriptionOf(ctx, me);

    // A downgrade between two still-paid tiers goes through the help desk
    // instead of this route — see `requiresHelpDeskToDowngrade`. Checked
    // here, not just hidden client-side, so the same rule holds for a
    // direct API call.
    if (existing && requiresHelpDeskToDowngrade(existing.planId, plan.id)) {
      throw new HttpError(
        409,
        "Downgrading to a cheaper plan goes through the help desk, not this button — send a message from the Plans screen and we'll take care of it.",
      );
    }

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
      // Elite already includes a concierge physician's retainer, paid for
      // rather than billed — see billing.ts. Wingman Club membership is the
      // same shape: Elite carries it too, so joining Elite is joining the
      // club, not a second signup. Never turned back off on a downgrade —
      // whether they keep it once real club billing lands is that day's
      // question, not this one's.
      if (isElitePlan(traveler.planId as PlanId)) traveler.clubMember = true;
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
    const pickup = { lat: Number(body?.pickup?.lat), lng: Number(body?.pickup?.lng), label: body?.pickup?.label };
    const dropoff = { lat: Number(body?.dropoff?.lat), lng: Number(body?.dropoff?.lng), label: body?.dropoff?.label };
    const providerReady = isAutomatic(uberForBusiness.status) && hasFeature(planOf(ctx, me), "automatic-rides");
    const hasCard = hasLivePaymentMethod(ctx, me);
    const automatic = providerReady && hasCard;

    // Secure transport is offered only where the provider says it operates.
    let secure = null;
    if (hasFeature(planOf(ctx, me), "secure-transport") && isAutomatic(secureTransport.status)) {
      secure = await secureTransport
        // Both ends parsed, rather than dropoff parsed and pickup passed
        // through raw as it used to be — the provider gets two coordinates
        // of the same shape either way.
        .quote({ pickup, dropoff, riderName: nameOf(ctx, me) })
        .catch(() => null);
    }

    // What Safehubby charges to arrange a ride, on every plan alike, Free
    // included, since ride-booking is a safety basic. Deliberately the fee
    // and nothing else: a rideshare sets the fare and this app does not
    // predict it — see ride-coordination.ts's doc comment.
    const standard = { arrangeFeeCents: ARRANGE_RIDE_FEE_CENTS };

    if (automatic) {
      // Real fares, from Uber's own estimates endpoint. Safehubby still never
      // computes one — it displays what the provider quoted.
      const estimates = await uberEstimates({
        pickup: body.pickup, dropoff, riderName: nameOf(ctx, me),
      }).catch(() => []);
      return { mode: "automatic", provider: uberForBusiness.status.name, estimates, secure, standard };
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
      standard,
    };
  },

  /** Cancels a booked ride, so a change of plan does not leave a car waiting. */
  "POST /api/rides/:tripId/cancel": async (ctx, p) => {
    actor(ctx);
    await uberCancel(req(p, "tripId"));
    return { cancelled: true };
  },

  /* ---------------------------------------------------------------
     Coordinated pickup — Safehubby's own hired drivers, not a
     hand-off to Uber or Lyft. See ride-coordination.ts for why this
     is a request-and-coordinate flow rather than a live match.
     --------------------------------------------------------------- */

  "POST /api/rides/coordinate": (ctx, _p, body) => {
    const me = actor(ctx);
    requireServiceLive(ctx);
    requireFeature(ctx, me, "ride-booking");
    const pickup = { lat: Number(body?.pickup?.lat), lng: Number(body?.pickup?.lng), label: body?.pickup?.label };
    const dropoff = { lat: Number(body?.dropoff?.lat), lng: Number(body?.dropoff?.lng), label: body?.dropoff?.label };
    validatePickupRequest({ pickup, dropoff });

    const request: PickupRequest = {
      id: newId("pickup"), travelerId: me, pickup, dropoff,
      arrangeFeeCents: ARRANGE_RIDE_FEE_CENTS,
      ...(body?.note ? { note: String(body.note) } : {}),
      status: "requested", createdAt: ctx.now().toISOString(),
    };
    ctx.store.update((db) => void db.pickupRequests.push(request));
    return { request };
  },

  /** A rider's own pickup requests, most recent first — so "did anyone see
   *  this yet" has an answer without waiting on a text back. */
  "GET /api/rides/coordinate": (ctx) => {
    const me = actor(ctx);
    const requests = ctx.store.data.pickupRequests
      .filter((r) => r.travelerId === me)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { requests };
  },

  "POST /api/rides/coordinate/:id/cancel": (ctx, p) => {
    const me = actor(ctx);
    const id = req(p, "id");
    const request = ctx.store.data.pickupRequests.find((r) => r.id === id && r.travelerId === me);
    if (!request) throw notFound("Pickup request");
    if (request.status === "completed") throw new HttpError(400, "This ride already happened.");
    ctx.store.update((db) => {
      const r = db.pickupRequests.find((x) => x.id === id)!;
      r.status = "cancelled";
    });
    return { request: { ...request, status: "cancelled" as const } };
  },

  /** What is switched on, and what each missing piece needs. */
  "GET /api/fulfillment/status": (ctx) => {
    actor(ctx);
    const { rides, delivery, walmart, secureTransport: secure, concierge: aide, cardIssuing } = fulfillmentStatus();
    return {
      rides, delivery, walmart, secureTransport: secure, concierge: aide, cardIssuing, push: push.status,
      placeSearch: placeSearch.status, payouts: revolutPayouts.status, flightTracking: flightTracking.status,
      disclosures: SECURE_TRANSPORT_DISCLOSURES,
      conciergeDisclosures: CONCIERGE_DISCLOSURES,
      flightTrackingDisclosures: FLIGHT_TRACKING_DISCLOSURES,
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
    requireServiceLive(ctx);
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
   * A flight's current schedule, status and (while airborne) position — the
   * preview shown before booking an `airport-pickup`, and the same call a
   * booked task's detail screen makes again to refresh. Rate limited the
   * same as the place picker: a configured key is billed per call.
   */
  "GET /api/flights/lookup": async (ctx, p) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "personal-concierge");
    if (ctx.limiters.flights.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many flight lookups. Try again shortly.");
    }
    const flightNumber = String(p.flightNumber ?? "").trim();
    const date = String(p.date ?? "").trim();
    if (!flightNumber || !date) throw new HttpError(400, "Enter a flight number and date.");
    if (!isAutomatic(flightTracking.status)) throw new HttpError(503, flightTracking.status.requires);
    const flight = await flightTracking.lookup({ flightNumber, date });
    if (!flight) throw new HttpError(404, "Could not find that flight — check the number and date.");
    return { flight, disclosures: FLIGHT_TRACKING_DISCLOSURES };
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
    const category = p.category ?? "";
    if (!CONCIERGE_CATEGORIES.some((c) => c.id === category)) throw new HttpError(400, "Unknown task type.");
    requireConciergeAccess(ctx, me, category as ConciergeCategory, p.quickTask === "true");
    const location = coordsFrom(p);
    requireLaunchMarket(location);

    // Safehubby's own hired people come first, and do not depend on a
    // partner network being configured at all. This is the whole point of
    // hiring: before this, an approved applicant existed in the database and
    // could never be offered to anybody.
    const now = ctx.now();
    const market = payMarketFor(location);
    const ours = rosterFor(ctx.store.data.assistants, { category: category as ConciergeCategory, market, now });
    const assistants: AssistantProfile[] = ours.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      bio: a.bio,
      photoUrl: a.photoUrl,
      yearsExperience: a.yearsExperience,
      gender: a.gender,
      age: a.age,
      categories: a.categories,
      maxConcurrentCustomers: a.maxConcurrentCustomers,
      // Counted from live tasks rather than trusted from elsewhere: this is
      // our own roster, so the honest number is the one in our own database.
      currentCustomers: ctx.store.data.conciergeTasks.filter(
        (t) => t.assistantId === a.id && t.status === "in-progress").length,
    }));

    // The partner network tops up the roster where one is configured. It is
    // additive, never a precondition — an unconfigured partner used to make
    // this whole route a 503, which would now hide our own staff behind
    // somebody else's integration.
    if (isAutomatic(concierge.status)) {
      const listing = await concierge.listAssistants({ category, location });
      for (const a of listing) {
        assistants.push({
          id: a.id, name: a.name, bio: a.bio, photoUrl: a.photoUrl,
          categories: a.categories as ConciergeCategory[],
          maxConcurrentCustomers: a.maxConcurrentCustomers,
          currentCustomers: a.currentCustomers,
        });
      }
    }

    return {
      assistants,
      available: assistants.filter(isAssistantAvailable).length,
      /** How many of these are Safehubby's own, so the UI can say so. */
      inHouse: ours.length,
    };
  },

  /**
   * Quotes a concierge task before booking, and is also how the app learns
   * whether the partner network covers this location — the same two-step as
   * secure transport, and for the same reason: never offer a task that cannot
   * actually be accepted.
   */
  "POST /api/concierge/quote": async (ctx, _p, body) => {
    const me = actor(ctx);
    const input = conciergeInputFrom(body);
    validateConciergeRequest(input, planOf(ctx, me));
    requireConciergeAccess(ctx, me, input.category, input.quickTask);
    requireLaunchMarket(input.location);
    if (!isAutomatic(concierge.status)) throw new HttpError(503, concierge.status.requires);

    const quote = await concierge.quote({
      category: input.category, note: input.note, location: input.location,
      spendCapCents: input.spendCapCents, requesterName: nameOf(ctx, me),
    });
    if (!quote) throw new HttpError(503, `${concierge.status.name} does not operate where you are right now.`);
    const people = peopleCountFor(ctx, me, input);
    const hours = bookedHoursFor(input);
    return {
      quote, disclosures: CONCIERGE_DISCLOSURES,
      serviceFeeCents: serviceFeeFor(input.category, input.quickTask, people, hours),
      totalCents: totalChargeCents(input.category, input.spendCapCents, input.quickTask, people, hours),
      quickTaskEligible: isQuickTaskEligible(input.category),
      peopleCount: people,
      ...(hours === undefined ? {} : { hoursBooked: hours }),
      /** The ceiling the clamp above used, so the UI can offer exactly the
       *  seats this plan includes rather than guessing. */
      maxPeopleCount: findPlan(planOf(ctx, me)).seats,
    };
  },

  /**
   * Books a concierge task. The hold is exact, not padded — see
   * `authorizeExactHold` — because the spend cap here is a promise made to a
   * stranger doing the spending, not a fare estimate with genuine slack in it.
   */
  "POST /api/concierge/tasks": async (ctx, _p, body) => {
    const me = actor(ctx);
    requireServiceLive(ctx);
    const input = conciergeInputFrom(body);
    validateConciergeRequest(input, planOf(ctx, me));
    requireConciergeAccess(ctx, me, input.category, input.quickTask);
    requireLaunchMarket(input.location);
    // Looked up server-side, from the flight number and date alone — never
    // trusting a client-supplied snapshot, the same rule this route already
    // applies to money. A miss (no key configured, or the provider doesn't
    // recognize the flight) never blocks dispatch: the assistant still goes,
    // just without a tracked flight until a later refresh
    // (GET /api/flights/lookup) succeeds.
    const flightInfo = input.flight ? await flightTracking.lookup(input.flight).catch(() => null) : null;
    if (body?.acknowledgedDisclosures !== true) {
      throw new HttpError(400, "The disclosures have to be acknowledged before booking.");
    }
    const assistantId = body?.assistantId ? String(body.assistantId) : undefined;

    // Booking one of our own people needs no partner network — they are on
    // our roster, they sign into our portal, and we pay them. Requiring the
    // partner here would have made every in-house hire unbookable, which is
    // the same hole the roster route had one step earlier.
    const ourAssistant = assistantId
      ? ctx.store.data.assistants.find((a) => a.id === assistantId && isOnRoster(a, ctx.now()))
      : undefined;
    if (ourAssistant && !ourAssistant.categories.includes(input.category)) {
      throw new HttpError(400, `${ourAssistant.name} is not dispatched for that kind of task.`);
    }
    // Whether anyone can do this at all comes before asking for money: a
    // "add a payment method" answer to a task nobody can take just means
    // adding a card and failing anyway.
    if (!ourAssistant && !isAutomatic(concierge.status)) {
      throw new HttpError(503, concierge.status.requires);
    }
    requirePaymentMethod(ctx, me);
    const peopleCount = peopleCountFor(ctx, me, input);
    // Stamped onto the task below, so a later rate change never reprices
    // work already agreed. One universal rate — see market-pay.ts for why
    // this does not vary by where the task happens.
    const hoursBooked = bookedHoursFor(input);
    const serviceFeeCents = serviceFeeFor(input.category, input.quickTask, peopleCount, hoursBooked);
    const assistantPayoutCents = assistantPayoutFor(input.category, input.quickTask, peopleCount, hoursBooked);
    const totalCents = totalChargeCents(input.category, input.spendCapCents, input.quickTask, peopleCount, hoursBooked);
    const portalCredentials = assistantId ? await provisionAssistantCredentials(ctx, assistantId) : undefined;

    // Only the partner network gets quoted. Our own roster is not a supplier
    // we ask for a price — the rate card in concierge.ts already decided it,
    // and that is the number the assistant is paid.
    const quote = ourAssistant
      ? null
      : await concierge.quote({
        category: input.category, note: input.note, location: input.location,
        spendCapCents: input.spendCapCents, requesterName: nameOf(ctx, me), assistantId,
      });
    if (!ourAssistant && !quote) {
      throw new HttpError(503, `${concierge.status.name} does not operate where you are right now.`);
    }

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
      // Dispatching one of our own is not an outbound call to anybody: the
      // task lands in their portal, which they already sign into, and we pay
      // them from the rate card. There is no partner to book with and no
      // provider task id to carry.
      const booked = ourAssistant
        ? {
          provider: "safehubby",
          taskId: newId("disp"),
          assistant: { id: ourAssistant.id, name: ourAssistant.name },
        }
        : await concierge.book({
          category: input.category, note: input.note, location: input.location,
          spendCapCents: input.spendCapCents, requesterName: nameOf(ctx, me), requesterPhone: body?.phone,
          assistantId,
          ...(portalCredentials?.tempPassword
            ? { assistantPortalCredentials: { username: portalCredentials.username, tempPassword: portalCredentials.tempPassword } }
            : {}),
          // The reveal link goes to the partner's own dispatch system so it
          // can reach the assistant — never back to the traveler's browser.
          ...(issuedCard ? { card: { last4: issuedCard.last4, revealUrl: issuedCard.revealUrl ?? "" } } : {}),
        });
      const task: ConciergeTask = {
        id: newId("ct"), travelerId: me, category: input.category, note: input.note,
        location: input.location, spendCapCents: input.spendCapCents, serviceFeeCents,
        assistantPayoutCents, peopleCount,
        ...(hoursBooked === undefined ? {} : { hoursBooked }),
        quickTask: input.quickTask, status: "in-progress",
        ...(isElitePlan(planOf(ctx, me)) ? { priority: true } : {}),
        provider: booked.provider, providerTaskId: booked.taskId, assistantId,
        assistantName: booked.assistant?.name, chargeId: charge.id, holdId: hold.id,
        createdAt: ctx.now().toISOString(),
        ...(issuedCard
          ? { card: { id: issuedCard.id, last4: issuedCard.last4, network: issuedCard.network, expMonth: issuedCard.expMonth, expYear: issuedCard.expYear } }
          : {}),
        ...(input.flight ? { flightNumber: input.flight.flightNumber, flightDate: input.flight.date } : {}),
        ...(flightInfo ? { flight: flightInfo } : {}),
      };
      ctx.store.update((db) => void db.conciergeTasks.push(task));
      ctx.store.update((db) => {
        (db.points[me] ??= []).push(award(newId("pt"), "bookedRideInsteadOfDriving", ctx.now(), "Sent a concierge instead of going alone"));
      });
      // Only our own roster carries a portal device to reach — a partner
      // network's assistant is told through their own dispatch system, in
      // `concierge.book` above, not this app's push devices.
      if (ourAssistant) {
        const devices = devicesFor(ctx.store.data.pushDevices, ourAssistant.id);
        if (devices.length > 0) {
          const messages = messagesForAssistantTask({
            taskId: task.id, categoryLabel: conciergeCategoryLabel(task.category), note: task.note, devices,
          });
          void push.send(messages).catch((err) => console.error("[safehubby] Assistant task push failed:", err));
        }
      }
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

  /* ---------------------------------------------------------------
     Desk tasks — the assistant's job that does not need feet.
     Included in the plan, so nothing here holds, charges or issues a
     card. See desk-tasks.ts for why it is included rather than billed,
     and why the allowance is finite.
     --------------------------------------------------------------- */

  "GET /api/desk/tasks": (ctx) => {
    const me = actor(ctx);
    requireFeature(ctx, me, "desk-tasks");
    const mine = ctx.store.data.deskTasks.filter((t) => t.travelerId === me);
    const { start, end } = monthBoundsFor(ctx.now());
    const allowance = deskTaskAllowanceFor(planOf(ctx, me));
    const used = deskTasksUsedIn(mine, start, end);
    return {
      kinds: DESK_TASK_KINDS,
      accessRule: DESK_TASK_ACCESS_RULE,
      allowance,
      used,
      remaining: remainingDeskTasks(allowance, used),
      // Said before anything is asked for, not at the point of refusal.
      resetsAt: end.toISOString(),
      tasks: mine.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },

  "POST /api/desk/tasks": (ctx, _p, body) => {
    requireServiceLive(ctx);
    const me = actor(ctx);
    requireFeature(ctx, me, "desk-tasks");
    const input = { kind: body?.kind as DeskTaskKind, note: String(body?.note ?? "") };
    validateDeskTask(input);

    const mine = ctx.store.data.deskTasks.filter((t) => t.travelerId === me);
    const { start, end } = monthBoundsFor(ctx.now());
    const allowance = deskTaskAllowanceFor(planOf(ctx, me));
    const used = deskTasksUsedIn(mine, start, end);
    if (used >= allowance) {
      throw new HttpError(
        429,
        `That is all ${allowance} of this month's included tasks. The count resets on the 1st — or a bigger plan carries more.`,
      );
    }

    const task: DeskTask = {
      id: newId("desk"), travelerId: me, kind: input.kind, note: input.note.trim(),
      status: "open", createdAt: ctx.now().toISOString(),
    };
    ctx.store.update((db) => void db.deskTasks.push(task));
    return { task, remaining: remainingDeskTasks(allowance, used + 1) };
  },

  "POST /api/desk/tasks/:id/cancel": (ctx, params) => {
    const me = actor(ctx);
    const task = ctx.store.data.deskTasks.find((t) => t.id === params.id && t.travelerId === me);
    if (!task) throw notFound("Task");
    if (task.status !== "open") throw new HttpError(409, "That task is already closed.");
    ctx.store.update((db) => {
      const t = db.deskTasks.find((x) => x.id === task.id)!;
      t.status = "cancelled";
    });
    return { task: { ...task, status: "cancelled" as const } };
  },

  /* ---------------------------------------------------------------
     Wingman Club — a real, tested membership economics model with no
     billing wired to it yet. See wingman-club.ts for the pricing, the
     monthly reveal mechanic, and why the name is not what this
     started as. `clubMember` is a plain flag (store.ts) so the roster
     size behind the economics below is a real count, not a
     hypothetical one — it does not charge anyone, the same "modeled
     and disclosed before it's live" honesty driver-pay.ts uses for
     driver payouts.
     --------------------------------------------------------------- */

  "GET /api/club/status": (ctx) => {
    const me = actor(ctx);
    const traveler = ctx.store.data.travelers.find((t) => t.id === me);
    if (!traveler) throw notFound("Traveler");
    const memberCount = ctx.store.data.travelers.filter((t) => t.clubMember).length;
    const pick = pickMonthlyExperience(ctx.now());
    return {
      isMember: Boolean(traveler.clubMember),
      memberCount,
      breakEvenMembers: minMembersForOverhead(),
      overheadCovered: overheadCovered(memberCount),
      perks: CLUB_PERKS,
      disclosures: CLUB_DISCLOSURES,
      catalog: CLUB_EXPERIENCES,
      // Elite already carries this membership, the same "Safehubby pays it,
      // not you" shape the concierge-physician retainer uses — see
      // POST /api/subscription. Dues have no real billing wired to them yet
      // (see the block comment above), so there is nothing to waive today,
      // but the flag says plainly who the day that lands actually charges.
      duesCoveredBySafehubby: isElitePlan(traveler.planId as PlanId),
      thisMonth: {
        experience: pick,
        duesCents: duesForCents(pick),
      },
    };
  },

  "POST /api/club/join": (ctx) => {
    const me = actor(ctx);
    ctx.store.update((db) => {
      const traveler = db.travelers.find((t) => t.id === me);
      if (traveler) traveler.clubMember = true;
    });
    return { isMember: true };
  },

  "POST /api/club/leave": (ctx) => {
    const me = actor(ctx);
    ctx.store.update((db) => {
      const traveler = db.travelers.find((t) => t.id === me);
      if (traveler) traveler.clubMember = false;
    });
    return { isMember: false };
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

  /**
   * Reports theft or non-delivery on a task the assistant already marked
   * done. Refunds the customer in full and, per policy, claws the same
   * amount back from the assistant's own future pay rather than Safehubby
   * absorbing it — see `disputeConciergeTask`. Actioned immediately on the
   * customer's word, the same trust model `settleConciergeTask`'s own
   * `billedCents` already runs on; a review step before payout would be the
   * natural next hardening if this is abused.
   */
  "POST /api/concierge/tasks/:taskId/dispute": (ctx, p, body) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    return disputeConciergeTask(ctx, task, String(body?.reason ?? ""));
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

  /* ---------------------------------------------------------------
     Master access — the owner/secretary dashboard.
     A third identity space, entirely separate from a traveler's session
     and an assistant's. See master-access.ts for the roles, the scopes,
     and why message contents are never among them. Accounts are
     provisioned by whoever already holds SAFEHUBBY_ADMIN_KEY, not
     self-served — there is no public sign-up for "sees everything."
     --------------------------------------------------------------- */

  /**
   * Provisions a master account and returns its access key **once** — the
   * same "shown once, hashed thereafter" discipline
   * `provisionAssistantCredentials` already uses for an assistant's temp
   * password. There is nowhere else this key can be recovered from; losing
   * it means revoking the account and provisioning a new one.
   *
   * Reachable with `SAFEHUBBY_ADMIN_KEY` (the only way in for the very
   * first account, since none exists yet to hold `write`) or by an existing
   * owner — see `requireAdmin`.
   */
  "POST /api/admin/master-accounts": async (ctx, _p, body) => {
    requireAdmin(ctx, "write");
    const name = String(body?.name ?? "").trim();
    const email = normalizeEmail(body?.email);
    const role = body?.role === "secretary" ? "secretary" : body?.role === "owner" ? "owner" : null;
    if (!name) throw new HttpError(400, "Name the person this account belongs to.");
    if (!email) throw new HttpError(400, "Enter a valid email address.");
    if (!role) throw new HttpError(400, 'Role must be "owner" or "secretary".');

    const account: MasterAccount = { id: newId("mst"), role, name, email, createdAt: ctx.now().toISOString() };
    const key = newSessionToken();
    const keyHash = await hashPassword(key);
    ctx.store.update((db) => {
      db.masterAccounts.push(account);
      db.masterCredentials[account.id] = { keyHash, createdAt: ctx.now().toISOString() };
    });
    return { account, key };
  },

  /** The roster of who has master access, and what each role can reach —
   *  never the keys themselves, which cannot be recovered once issued. */
  "GET /api/admin/master-accounts": (ctx) => {
    requireAdmin(ctx, "operations");
    const now = ctx.now();
    return ctx.store.data.masterAccounts.map((a) => ({
      ...a, scopes: scopesFor(a.role), active: isMasterAccountActive(a, now),
    }));
  },

  /** Revokes a master account. The record stays — the audit log still
   *  points at it — only `revokedAt` is set. */
  "POST /api/admin/master-accounts/:id/revoke": (ctx, p) => {
    requireAdmin(ctx, "write");
    const id = req(p, "id");
    const account = ctx.store.data.masterAccounts.find((a) => a.id === id);
    if (!account) throw notFound("Master account");
    const revoked = revokeMasterAccess(account, ctx.now());
    ctx.store.update((db) => {
      const i = db.masterAccounts.findIndex((a) => a.id === id);
      db.masterAccounts[i] = revoked;
      db.masterSessions = db.masterSessions.filter((s) => s.accountId !== id);
    });
    return revoked;
  },

  /**
   * Signs a master account in with its key. Checked against every active
   * credential in turn (there are only ever a handful of these accounts)
   * rather than looked up by an index, because the key itself — not a
   * separate username — is the whole credential; nothing about it should
   * be searchable in the clear.
   */
  "POST /api/master/auth/login": async (ctx, _p, body) => {
    if (ctx.limiters.masterLogin.hit(ctx.clientKey)) throw new HttpError(429, "Too many sign-in attempts. Try again later.");
    const key = String(body?.key ?? "");
    const now = ctx.now();
    let matched: MasterAccount | null = null;
    for (const account of ctx.store.data.masterAccounts) {
      if (!isMasterAccountActive(account, now)) continue;
      const credential = ctx.store.data.masterCredentials[account.id];
      if (!credential) continue;
      if (await verifyPassword(key, credential.keyHash)) { matched = account; break; }
    }
    if (!matched) throw new HttpError(401, "That key is not valid.");

    const token = newSessionToken();
    ctx.store.update((db) => {
      db.masterSessions = sweepExpiredSessions(db.masterSessions, now);
      db.masterSessions.push({
        token, accountId: matched!.id, createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + MASTER_SESSION_TTL_MS).toISOString(),
      });
    });
    ctx.limiters.masterLogin.reset(ctx.clientKey);
    ctx.setMasterSession?.(token);
    return { accountId: matched.id, name: matched.name, role: matched.role };
  },

  "POST /api/master/auth/logout": (ctx) => {
    const token = ctx.masterSessionToken;
    if (token) ctx.store.update((db) => { db.masterSessions = db.masterSessions.filter((s) => s.token !== token); });
    ctx.setMasterSession?.(null);
    return { ok: true };
  },

  /**
   * Everything the signed-in account's role can see, in one call — the
   * dashboard this exists to be. Each section is included only when
   * `canAccess` says so, so a secretary's response simply has no `money`
   * key rather than one that is present but empty (which would look like
   * "there is no money" instead of "you cannot see this").
   *
   * Every section read is recorded to the audit log — see `recordAccess`
   * in master-access.ts and the doc on why: master access with no trail is
   * indistinguishable from a breach after the fact.
   */
  "GET /api/master/overview": (ctx) => {
    const account = masterAccountOf(ctx);
    if (!account || !isMasterAccountActive(account, ctx.now())) throw unauthorized();
    const now = ctx.now();
    const audit: MasterAuditEntry[] = [];
    const record = (scope: MasterScope, subject: string) =>
      audit.push(recordAccess({ id: newId("aud"), account, scope, subject, now }));

    const overview: Record<string, unknown> = {
      account: { id: account.id, name: account.name, role: account.role },
      scopes: scopesFor(account.role),
      generatedAt: now.toISOString(),
    };

    if (canAccess(account, "customers", now)) {
      const customers = ctx.store.data.travelers.map((t) => ({
        id: t.id, name: t.displayName, email: t.email, planId: t.planId, clubMember: Boolean(t.clubMember),
      }));
      overview.customers = customers;
      record("customers", `traveler roster (${customers.length})`);
    }

    if (canAccess(account, "operations", now)) {
      const pendingStaffApplications = ctx.store.data.staffApplications
        .filter((a) => a.status === "submitted" || a.status === "under-review");
      const pendingDriverApplications = ctx.store.data.driverApplications
        .filter((a) => a.status === "submitted" || a.status === "under-review");
      // Hired so far, by role — the same headcount `GET /api/admin/budget`
      // reads, but a secretary has master-account access, not the shared
      // admin key that route is gated on, and this is the one dashboard
      // that already reaches both roles.
      const hiredByRole = Object.fromEntries(STAFF_ROLES.map((role) => [
        role.id,
        role.id === "driver"
          ? ctx.store.data.driverApplications.filter((a) => a.status === "approved").length
          : ctx.store.data.assistants.filter((a) => a.role === role.id && isOnRoster(a, now)).length,
      ])) as Record<StaffRole, number>;
      overview.operations = {
        activeConciergeTasks: ctx.store.data.conciergeTasks.filter((t) => t.status === "in-progress").length,
        openDeskTasks: ctx.store.data.deskTasks.filter((t) => t.status === "open").length,
        rosterActive: ctx.store.data.assistants.filter((a) => isOnRoster(a, now)).length,
        rosterTotal: ctx.store.data.assistants.length,
        pendingDriverApplications: pendingDriverApplications.length,
        pendingStaffApplications: pendingStaffApplications.length,
        // The applications themselves, not just the count — so a review
        // queue can be worked from this one screen rather than a second
        // trip to GET /api/staff/applications for the same pending set.
        applications: {
          staff: pendingStaffApplications.map((a) => ({
            id: a.id, role: a.role, fullName: a.fullName, city: a.city, state: a.state,
            hoursPerWeek: a.hoursPerWeek, status: a.status, submittedAt: a.submittedAt,
            // The flag only, never the file itself — a résumé's own base64
            // can run into the hundreds of KB, which does not belong in a
            // dashboard summary that already lists everyone pending review.
            // The full application, résumé included, is one call away at
            // GET /api/staff/applications (admin key) for whoever needs it.
            hasResume: Boolean(a.resume),
          })),
          drivers: pendingDriverApplications.map((a) => ({
            id: a.id, fullName: a.fullName, city: a.city, state: a.state,
            status: a.status, submittedAt: a.submittedAt, hasResume: Boolean(a.resume),
          })),
        },
        // The recommended headcount is the pre-launch staffing plan
        // (staffing.ts) — the same number the hiring budget is built
        // against — set alongside who's actually hired, so "how many more
        // should I bring on" reads directly off the dashboard.
        recommendedHeadcount: PRELAUNCH_HEADCOUNT,
        hiredByRole,
        wingmanClubMembers: ctx.store.data.travelers.filter((t) => t.clubMember).length,
        // Pickups nobody has coordinated a driver for yet — the queue
        // "coordinate pickup" actually creates work in, since there is no
        // live-matching engine behind it. See ride-coordination.ts.
        pendingPickupRequests: ctx.store.data.pickupRequests
          .filter((r) => r.status === "requested")
          .map((r) => ({
            id: r.id, travelerId: r.travelerId, requesterName: nameOf(ctx, r.travelerId),
            pickup: r.pickup, dropoff: r.dropoff, note: r.note, createdAt: r.createdAt,
          })),
        approvedDrivers: ctx.store.data.driverApplications
          .filter((a) => a.status === "approved")
          .map((a) => ({ id: a.id, fullName: a.fullName, phone: a.phone, tier: a.tier })),
      };
      record("operations", "operations overview");
    }

    if (canAccess(account, "money", now)) {
      const settled = ctx.store.data.charges.filter((c) => c.status === "settled");
      // Store-billed subscriptions sit here until the app-store receipt
      // confirms them (see POST /api/billing/charges/:id/confirm) — real
      // money the business is owed, just not yet in hand. Kept apart from
      // `settledChargesCents` rather than summed into it, the same
      // "never claim a provider we cannot verify" discipline the fulfillment
      // ports use for a fare: this is a pending amount, not a settled one.
      const pending = ctx.store.data.charges.filter((c) => c.status === "pending");
      const byKind: Record<string, number> = {};
      for (const c of settled) byKind[c.kind] = (byKind[c.kind] ?? 0) + c.amountCents;
      overview.money = {
        settledChargesCents: settled.reduce((sum, c) => sum + c.amountCents, 0),
        chargeCount: settled.length,
        pendingChargesCents: pending.reduce((sum, c) => sum + c.amountCents, 0),
        pendingChargeCount: pending.length,
        byKind,
        unpaidPayoutsCents: ctx.store.data.assistants.reduce(
          (sum, a) => sum + unpaidEarningsCents(ctx.store.data.conciergeTasks, a.id), 0,
        ),
        // The hiring-budget breakdown lives at its own resolution, not
        // duplicated here — see GET /api/admin/budget, now reachable with
        // the same master key rather than only the shared admin one.
        eliteUnlock: eliteUnlockStatus(ctx),
      };
      record("money", "ledger summary");
    }

    ctx.store.update((db) => void db.masterAuditLog.push(...audit));
    return overview;
  },

  /** The trail behind every master-access read — see `recordAccess`'s doc
   *  comment on why this exists. Gated at "operations" rather than "write"
   *  so a secretary can see the same trail an owner can; neither role can
   *  edit or clear it. */
  "GET /api/master/audit-log": (ctx) => {
    const account = masterAccountOf(ctx);
    if (!account || !isMasterAccountActive(account, ctx.now()) || !canAccess(account, "operations", ctx.now())) {
      throw unauthorized();
    }
    return ctx.store.data.masterAuditLog.slice().sort((a, b) => b.at.localeCompare(a.at));
  },

  /**
   * Matches a pickup request to an approved driver — the human step behind
   * "coordinate pickup" (see ride-coordination.ts), gated at "write" since
   * it commits a real person to show up, the same authority level
   * approving a staff application already needs.
   */
  /**
   * Records what the ride actually cost, once whoever arranged it can read
   * the real figure off the rideshare app.
   *
   * Separate from coordinating on purpose: coordinating says who is handling
   * it, this says what it came to, and the two happen minutes apart — the
   * fare does not exist at the moment somebody picks the request up. Gated
   * on "money" rather than "operations", because unlike dispatch this one
   * decides what a customer is charged.
   */
  "POST /api/master/pickup-requests/:id/ride-cost": (ctx, p, body) => {
    const account = masterAccountOf(ctx);
    const now = ctx.now();
    if (!account || !isMasterAccountActive(account, now) || !canAccess(account, "money", now)) {
      throw unauthorized();
    }
    const id = req(p, "id");
    const existing = ctx.store.data.pickupRequests.find((r) => r.id === id);
    if (!existing) throw notFound("Pickup request");

    // Validated in core, so the rules about a negative, fractional or
    // already-recorded cost hold wherever this is called from.
    let updated;
    try {
      updated = recordRideCost(existing, Math.round(Number(body?.costCents)), String(body?.bookedOn ?? ""));
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "That ride cost was not accepted.");
    }

    ctx.store.update((db) => {
      const r = db.pickupRequests.find((x) => x.id === id)!;
      r.rideCostCents = updated.rideCostCents;
      r.bookedOn = updated.bookedOn;
      db.masterAuditLog.push(recordAccess({
        id: newId("aud"), account, scope: "money",
        subject: `recorded ride cost for pickup ${id}: ${updated.rideCostCents} on ${updated.bookedOn}`, now,
      }));
    });
    return { request: updated };
  },

  "POST /api/master/pickup-requests/:id/coordinate": (ctx, p, body) => {
    const account = masterAccountOf(ctx);
    const now = ctx.now();
    // "operations" rather than "write" — this is dispatch, the same work a
    // secretary already does approving a shift, not money or a plan change.
    if (!account || !isMasterAccountActive(account, now) || !canAccess(account, "operations", now)) {
      throw unauthorized();
    }
    const id = req(p, "id");
    const request = ctx.store.data.pickupRequests.find((r) => r.id === id);
    if (!request) throw notFound("Pickup request");
    const driverId = String(body?.driverId ?? "");
    const driver = ctx.store.data.driverApplications.find((d) => d.id === driverId && d.status === "approved");
    if (!driver) throw new HttpError(400, "Pick an approved driver.");

    ctx.store.update((db) => {
      const r = db.pickupRequests.find((x) => x.id === id)!;
      r.status = "coordinated";
      r.driverId = driver.id;
      r.driverName = driver.fullName;
      r.driverPhone = driver.phone;
      r.coordinatedAt = now.toISOString();
      db.masterAuditLog.push(recordAccess({
        id: newId("aud"), account, scope: "operations", subject: `coordinated pickup ${id} → ${driver.fullName}`, now,
      }));
    });
    return { request: ctx.store.data.pickupRequests.find((r) => r.id === id) };
  },

  "POST /api/master/pickup-requests/:id/complete": (ctx, p) => {
    const account = masterAccountOf(ctx);
    const now = ctx.now();
    if (!account || !isMasterAccountActive(account, now) || !canAccess(account, "operations", now)) {
      throw unauthorized();
    }
    const id = req(p, "id");
    const request = ctx.store.data.pickupRequests.find((r) => r.id === id);
    if (!request) throw notFound("Pickup request");
    ctx.store.update((db) => {
      const r = db.pickupRequests.find((x) => x.id === id)!;
      r.status = "completed";
      r.completedAt = now.toISOString();
    });
    return { request: ctx.store.data.pickupRequests.find((r) => r.id === id) };
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
      // Priority first — "priority everything" for an Elite member, in the
      // one place two open requests actually compete for the same
      // assistant's attention — then most recent within each group.
      .sort((a, b) => Number(b.priority ?? false) - Number(a.priority ?? false)
        || b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({ ...t, requesterName: nameOf(ctx, t.travelerId) }));
    return {
      assistantId, mustChangePassword, tasks,
      unpaidEarningsCents: unpaidEarningsCents(ctx.store.data.conciergeTasks, assistantId),
      outstandingClawbackCents: outstandingClawbackCents(
        ctx.store.data.assistantAdjustments.filter((a) => a.assistantId === assistantId),
      ),
      // So the portal knows whether to offer "Draft with AI" at all, without
      // a second round trip. Handoff means the button never appears — an
      // assistant with nothing configured writes their own note, exactly as
      // they always could.
      aiAssist: aiAssist.status,
    };
  },

  /**
   * A personal assistant records the flight they just booked with a private
   * jet operator or an airline, for a task they are dispatched to (an
   * airport pickup, most often) — the flight number and date if the lookup
   * provider already found it, or the assistant's own account of it
   * (`buildManualFlightInfo`) when there is nothing public to look up, which
   * is always true for a charter. Either way this is what the customer's
   * flight dashboard renders (`RequestDetail`'s `FlightCard`) — the same
   * component whether the flight was looked up automatically at booking or
   * entered here after the fact.
   */
  "POST /api/assistant/tasks/:taskId/flight": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const id = req(p, "taskId");
    const task = ctx.store.data.conciergeTasks.find((t) => t.id === id);
    if (!task || task.assistantId !== assistantId) throw notFound("Task");

    const flight = buildManualFlightInfo({
      flightNumber: String(body?.flightNumber ?? ""),
      airlineName: String(body?.airlineName ?? ""),
      airlineIata: body?.airlineIata ? String(body.airlineIata) : undefined,
      aircraftTailNumber: body?.aircraftTailNumber ? String(body.aircraftTailNumber) : undefined,
      aircraftType: body?.aircraftType ? String(body.aircraftType) : undefined,
      departure: {
        iata: String(body?.departure?.iata ?? ""),
        name: body?.departure?.name ? String(body.departure.name) : undefined,
        terminal: body?.departure?.terminal ? String(body.departure.terminal) : undefined,
        scheduledTime: String(body?.departure?.scheduledTime ?? ""),
      },
      arrival: {
        iata: String(body?.arrival?.iata ?? ""),
        name: body?.arrival?.name ? String(body.arrival.name) : undefined,
        terminal: body?.arrival?.terminal ? String(body.arrival.terminal) : undefined,
        scheduledTime: String(body?.arrival?.scheduledTime ?? ""),
      },
    });

    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === id)!;
      t.flight = flight;
      t.flightNumber = flight.flightNumber;
    });
    return { flight };
  },

  /**
   * The desk's own analogue for a jet-travel booking: entered by an operator
   * with the admin key, the same authority `.../quote` already has over this
   * booking — there is no assistant session on the Elite desk yet, only the
   * admin one. See the route above for why this is a manual entry rather
   * than a lookup.
   */
  "POST /api/admin/elite/bookings/:bookingId/flight": (ctx, p, body) => {
    requireAdmin(ctx, "write");
    const id = req(p, "bookingId");
    const booking = ctx.store.data.eliteBookings.find((b) => b.id === id);
    if (!booking) throw notFound("Booking");

    const flight = buildManualFlightInfo({
      flightNumber: String(body?.flightNumber ?? ""),
      airlineName: String(body?.airlineName ?? ""),
      airlineIata: body?.airlineIata ? String(body.airlineIata) : undefined,
      aircraftTailNumber: body?.aircraftTailNumber ? String(body.aircraftTailNumber) : undefined,
      aircraftType: body?.aircraftType ? String(body.aircraftType) : undefined,
      departure: {
        iata: String(body?.departure?.iata ?? ""),
        name: body?.departure?.name ? String(body.departure.name) : undefined,
        terminal: body?.departure?.terminal ? String(body.departure.terminal) : undefined,
        scheduledTime: String(body?.departure?.scheduledTime ?? ""),
      },
      arrival: {
        iata: String(body?.arrival?.iata ?? ""),
        name: body?.arrival?.name ? String(body.arrival.name) : undefined,
        terminal: body?.arrival?.terminal ? String(body.arrival.terminal) : undefined,
        scheduledTime: String(body?.arrival?.scheduledTime ?? ""),
      },
    });

    ctx.store.update((db) => {
      const b = db.eliteBookings.find((x) => x.id === id)!;
      b.flight = flight;
    });
    return { booking: ctx.store.data.eliteBookings.find((b) => b.id === id) };
  },

  /**
   * The assistant-portal analogue of `POST /api/push/devices`: same
   * `PushDevice` row, same registration function, keyed on the assistant's
   * own id instead of a traveler's. Kept as its own route rather than
   * reusing the traveler one because the two are authenticated from
   * different sessions (`assistantActor` vs `actor`) — a customer's session
   * must never be able to register a device against an assistant's id, or
   * vice versa.
   */
  "POST /api/assistant/push/devices": (ctx, _p, body) => {
    const assistantId = assistantActor(ctx);
    const device = registerDevice({
      token: String(body?.token ?? ""),
      platform: String(body?.platform ?? ""),
      userId: assistantId,
      now: ctx.now(),
    });
    ctx.store.update((db) => { db.pushDevices = upsertDevice(db.pushDevices, device); });
    return { registered: true, platform: device.platform, delivery: push.status };
  },

  "POST /api/assistant/push/devices/remove": (ctx, _p, body) => {
    const assistantId = assistantActor(ctx);
    const token = String(body?.token ?? "");
    ctx.store.update((db) => {
      db.pushDevices = db.pushDevices.filter((d) => !(d.token === token && d.userId === assistantId));
    });
    return { removed: true };
  },

  /** Whether this assistant would actually be reached — the portal's version
   *  of `GET /api/push/status`. */
  "GET /api/assistant/push/status": (ctx) => {
    const assistantId = assistantActor(ctx);
    return { devices: devicesFor(ctx.store.data.pushDevices, assistantId).length, delivery: push.status };
  },

  /**
   * A faster first draft of the assistant's own wording for a note on this
   * task — never sent on its own. See ai-assist.ts: the provider is given
   * only this task's real facts and the assistant's own instruction, and the
   * result comes back as plain text for the assistant to read, edit, and
   * send themselves through whichever note field they were already using.
   * Reachable only from the assistant's own session — never from a
   * traveler's, so a customer can never reach this even by guessing the URL.
   */
  "POST /api/assistant/tasks/:taskId/ai-draft": async (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    if (!isAutomatic(aiAssist.status)) throw new HttpError(503, aiAssist.status.requires);

    const instruction = String(body?.instruction ?? "");
    const error = validateAiDraftInstruction(instruction);
    if (error) throw new HttpError(400, error);

    const context = `Task: ${conciergeCategoryLabel(task.category)}. Customer asked for: ${task.note}.`;
    const { text } = await aiAssist.draft({
      purpose: String(body?.purpose ?? "a note to the customer"), context, instruction: instruction.trim(),
    });
    return { text };
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
    return {
      payouts, unpaidEarningsCents: unpaidEarningsCents(ctx.store.data.conciergeTasks, assistantId),
      outstandingClawbackCents: outstandingClawbackCents(
        ctx.store.data.assistantAdjustments.filter((a) => a.assistantId === assistantId),
      ),
    };
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

  /** The assistant's side of the same thread. Mirrors the traveler routes
   *  exactly, including marking the other side's messages read on open. */
  "GET /api/assistant/tasks/:taskId/messages": (ctx, p) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    ctx.store.update((db) => {
      db.textMessages = markRead(db.textMessages, task.id, "assistant", ctx.now());
    });
    return { messages: messagesForTask(ctx.store.data.textMessages, task.id) };
  },

  "POST /api/assistant/tasks/:taskId/messages": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    const message = sendTextMessage({
      id: newId("tm"), taskId: task.id, travelerId: task.travelerId, sender: "assistant",
      body: String(body?.body ?? ""), now: ctx.now(),
    });
    ctx.store.update((db) => void db.textMessages.push(message));
    return { message };
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

  /**
   * Proof of what actually happened — the delivered item, the friend
   * checked on, the errand actually run — separate from the identity
   * selfies above, which only confirm who met whom. Optional, same as
   * those; attaching one before marking a task done gives the customer
   * something concrete rather than just the assistant's word.
   */
  "POST /api/assistant/tasks/:taskId/completion-photo": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    const photo = identityPhotoFrom(body, ctx.now());
    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      t.completionPhoto = photo;
    });
    return { photo };
  },

  /**
   * The full card number for the task's spend-capped card, so the assistant
   * can actually pay for what was asked for.
   *
   * Returns a one-time provider-hosted link rather than the number, so the
   * pan never passes through Safehubby — see `revealCard` in
   * `packages/core/src/fulfillment.ts`. Three gates, all of them live rather
   * than checked once at issue: it has to be this assistant's own task
   * (`assistantTaskOf`), the task has to still be in progress, and the card
   * has to still exist. A finished task's card is cancelled by
   * `settleConciergeTask`, and this refuses to reveal it afterwards — the
   * window in which a stranger holds spending power stays exactly as long as
   * the job does.
   */
  "POST /api/assistant/tasks/:taskId/card": async (ctx, p) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    if (task.status !== "in-progress") {
      throw new HttpError(400, `This task is ${task.status} — its card has already been cancelled.`);
    }
    if (!task.card) {
      throw new HttpError(404, "No card was issued for this task. The customer pays you back directly instead.");
    }
    // The evidence gate: no documented purchase, no card. A declined request
    // does not count, so declining re-locks it.
    if (!canRevealCard(task)) {
      throw new HttpError(
        403,
        "Photograph what you're buying first — the card unlocks once there's a purchase on the record.",
      );
    }
    if (!isAutomatic(revolutCards.status)) throw new HttpError(503, revolutCards.status.requires);

    const revealUrl = await revolutCards.revealCard(task.card.id);
    if (!revealUrl) throw new HttpError(410, "This card can no longer be revealed. Ask dispatch to reissue it.");
    return { revealUrl, card: task.card, spendCapCents: task.spendCapCents };
  },

  /**
   * Documents a purchase before it happens: a photo of what is being bought,
   * what it costs, and optionally a voice note explaining it. This is what
   * unlocks the task card — see `SpendRequest` in core for why it is an
   * evidence gate rather than an approval the customer has to tap, given the
   * customer may be in no state to tap anything.
   */
  "POST /api/assistant/tasks/:taskId/spend-request": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    if (task.status !== "in-progress") throw new HttpError(400, `This task is already ${task.status}.`);

    const input = { amountCents: Math.round(Number(body?.amountCents)), note: String(body?.note ?? "") };
    validateSpendRequest(input, task);
    const photo = identityPhotoFrom(body?.photo, ctx.now());

    // The voice note rides the task's existing thread rather than being
    // stored a second way, so the customer reads it where they already read
    // everything else from this assistant.
    let voiceMessageId: string | undefined;
    if (body?.voice) {
      const message = recordVoiceMessage({
        id: newId("vm"), taskId: task.id, travelerId: task.travelerId, sender: "assistant",
        audioBase64: String(body.voice.audioBase64 ?? ""), mimeType: String(body.voice.mimeType ?? ""),
        durationSeconds: Number(body.voice.durationSeconds), now: ctx.now(),
      });
      ctx.store.update((db) => void db.voiceMessages.push(message));
      voiceMessageId = message.id;
    }

    const request: SpendRequest = {
      id: newId("sr"), amountCents: input.amountCents, note: input.note.trim(), photo,
      ...(voiceMessageId ? { voiceMessageId } : {}),
      status: "open", createdAt: ctx.now().toISOString(),
    };
    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      (t.spendRequests ??= []).push(request);
    });
    const updated = ctx.store.data.conciergeTasks.find((t) => t.id === task.id)!;
    return { request, remainingSpendCents: remainingSpendCents(updated) };
  },

  /**
   * The receipt, after buying. This is what stops the purchase being clawed
   * back out of the assistant's pay when the task closes.
   */
  "POST /api/assistant/tasks/:taskId/spend-requests/:requestId/receipt": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    const requestId = req(p, "requestId");
    if (!(task.spendRequests ?? []).some((r) => r.id === requestId)) throw notFound("Purchase");
    const receipt = identityPhotoFrom(body, ctx.now());

    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      t.spendRequests!.find((r) => r.id === requestId)!.receipt = receipt;
    });
    const updated = ctx.store.data.conciergeTasks.find((t) => t.id === task.id)!;
    return { receipt, unaccountedSpendCents: unaccountedSpendCents(updated) };
  },

  /**
   * "It changed" — the shop was out of it, a brand was substituted, the price
   * came out different. Goes to the customer as a note plus an optional voice
   * message, and counts as answering for the money, so an assistant who could
   * not buy what was asked for is not docked for having no receipt.
   *
   * The amount can be revised at the same time, because a price that came out
   * different is the most common reason to file one of these.
   */
  "POST /api/assistant/tasks/:taskId/spend-requests/:requestId/change": (ctx, p, body) => {
    const assistantId = assistantActor(ctx);
    const task = assistantTaskOf(ctx, assistantId, req(p, "taskId"));
    const requestId = req(p, "requestId");
    const existing = (task.spendRequests ?? []).find((r) => r.id === requestId);
    if (!existing) throw notFound("Purchase");

    const note = String(body?.note ?? "");
    validateSpendChange(note);

    // A revised amount is checked against the cap with this request's own
    // current amount set aside, so correcting $12 to $8 can never be refused
    // for overrunning a cap the old figure was already counted against.
    let amountCents: number | undefined;
    if (body?.amountCents !== undefined) {
      amountCents = Math.round(Number(body.amountCents));
      const others = (task.spendRequests ?? []).filter((r) => r.id !== requestId);
      validateSpendRequest({ amountCents, note: existing.note }, { ...task, spendRequests: others });
    }

    let voiceMessageId: string | undefined;
    if (body?.voice) {
      const message = recordVoiceMessage({
        id: newId("vm"), taskId: task.id, travelerId: task.travelerId, sender: "assistant",
        audioBase64: String(body.voice.audioBase64 ?? ""), mimeType: String(body.voice.mimeType ?? ""),
        durationSeconds: Number(body.voice.durationSeconds), now: ctx.now(),
      });
      ctx.store.update((db) => void db.voiceMessages.push(message));
      voiceMessageId = message.id;
    }

    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      const r = t.spendRequests!.find((x) => x.id === requestId)!;
      r.change = {
        note: note.trim(), ...(voiceMessageId ? { voiceMessageId } : {}),
        createdAt: ctx.now().toISOString(),
      };
      if (amountCents !== undefined) r.amountCents = amountCents;
    });
    const updated = ctx.store.data.conciergeTasks.find((t) => t.id === task.id)!;
    return {
      request: updated.spendRequests!.find((r) => r.id === requestId),
      unaccountedSpendCents: unaccountedSpendCents(updated),
    };
  },

  /**
   * The customer's say on a documented purchase. Approving records an
   * explicit blessing; declining re-locks the card, so it is the one that
   * actually stops money moving. Neither is required for the assistant to
   * proceed — see `SpendRequest` for why waiting on an impaired subscriber
   * would strand someone mid-task.
   */
  "POST /api/concierge/tasks/:taskId/spend-requests/:requestId/decision": (ctx, p, body) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    const requestId = req(p, "requestId");
    const existing = (task.spendRequests ?? []).find((r) => r.id === requestId);
    if (!existing) throw notFound("Purchase");
    if (existing.status !== "open") throw new HttpError(400, `That purchase is already ${existing.status}.`);

    const approve = body?.approve === true;
    ctx.store.update((db) => {
      const t = db.conciergeTasks.find((x) => x.id === task.id)!;
      const r = t.spendRequests!.find((x) => x.id === requestId)!;
      r.status = approve ? "approved" : "declined";
      r.decidedAt = ctx.now().toISOString();
    });
    const updated = ctx.store.data.conciergeTasks.find((t) => t.id === task.id)!;
    return {
      request: updated.spendRequests!.find((r) => r.id === requestId),
      cardUnlocked: canRevealCard(updated),
    };
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

  /**
   * Typing to the assistant working your task, and reading what they type
   * back. The thread already carried voice and photos and had no text at
   * all, which left the most ordinary exchange — "the 8ft or the 10ft?" —
   * needing a voice recording to happen.
   *
   * Stored sealed like everything else on the thread (`sealTaskMessages`),
   * and scoped to a task the caller actually owns: `conciergeTaskOf` is a
   * 404 for anybody else's.
   */
  "POST /api/concierge/tasks/:taskId/messages": (ctx, p, body) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    const message = sendTextMessage({
      id: newId("tm"),
      taskId: task.id,
      travelerId: me,
      sender: "traveler",
      body: String(body?.body ?? ""),
      now: ctx.now(),
    });
    ctx.store.update((db) => void db.textMessages.push(message));
    return { message };
  },

  /** Reading the thread also marks the assistant's messages read — opening
   *  it is what "read" means, and a separate call to say so is a call that
   *  eventually does not get made. */
  "GET /api/concierge/tasks/:taskId/messages": (ctx, p) => {
    const me = actor(ctx);
    const task = conciergeTaskOf(ctx, me, req(p, "taskId"));
    ctx.store.update((db) => {
      db.textMessages = markRead(db.textMessages, task.id, "traveler", ctx.now());
    });
    return { messages: messagesForTask(ctx.store.data.textMessages, task.id) };
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

  /* ---------------- the Elite luxury desk ----------------
     Held behind `elite-tier` (features.ts) along with the plan itself. No
     money flows through Safehubby here: the member pays the operator, the
     hotel, the practice, and the supplier pays Safehubby a disclosed
     commission — see elite.ts for why that is the only model the payment
     machinery can actually support at these amounts.
     ------------------------------------------------------ */

  "GET /api/elite/services": (ctx) => {
    const me = actor(ctx);
    requireElite(ctx);
    const plan = planOf(ctx, me);
    return {
      // The partner behind the desk, stated plainly: without one, every
      // request below is taken by hand rather than quoted back.
      desk: eliteDesk.status,
      services: ELITE_SERVICES
        .filter((s) => hasFeature(plan, s.feature))
        .map((s) => ({
          ...s,
          disclosures: disclosuresFor(s.id),
          // Commission is stated to the member, not buried. A disclosed
          // commission is the difference between a broker and a markup.
          commissionNote: s.commissionRate === 0
            ? "Safehubby is paid nothing on this. You pay the practice directly."
            : `You pay the supplier directly. Safehubby is paid ${(s.commissionRate * 100).toFixed(0)}% by them, disclosed up front.`,
        })),
    };
  },

  /**
   * Opens a request on the desk. Deliberately creates no charge and no hold —
   * `EliteBooking` has nowhere to put one. A quote comes back with the
   * supplier's own price, and the member pays the supplier.
   */
  "POST /api/elite/bookings": async (ctx, _p, body) => {
    requireServiceLive(ctx);
    const me = actor(ctx);
    requireElite(ctx);
    const serviceId = body?.serviceId as EliteServiceId;
    const input = { serviceId, brief: String(body?.brief ?? "") };
    validateEliteRequest(input);

    const service = findEliteService(serviceId);
    requireFeature(ctx, me, service.feature);

    // A concierge doctor is never an alternative to an ambulance. Assessed
    // server-side from the reported red flags rather than trusted from the
    // client, and refused outright rather than offered with a warning.
    if (serviceId === "concierge-doctor") {
      const flags = (body?.redFlags ?? []) as RedFlagId[];
      const escalation = flags.length > 0 ? assess(flags).escalation : "stay-and-watch";
      if (!doctorAvailableFor(escalation)) {
        throw new HttpError(
          409,
          "Those symptoms need emergency services, not a house call. Call your local emergency number now.",
        );
      }
    }

    const booking: EliteBooking = {
      id: newId("elite"), travelerId: me, serviceId, brief: input.brief.trim(),
      status: "requested", createdAt: ctx.now().toISOString(),
    };
    ctx.store.update((db) => void db.eliteBookings.push(booking));

    // With a partner configured, the quote comes straight back from whoever
    // actually holds the supplier relationships. Without one, the request
    // stands as `requested` for the desk to take by hand — never a quote
    // Safehubby made up, which at these amounts would be the most expensive
    // lie in the app.
    let quoted: EliteBooking = booking;
    let note: string | null = null;
    if (isAutomatic(eliteDesk.status) && await eliteDesk.offers(serviceId)) {
      try {
        const quote = await eliteDesk.quote({
          serviceId, brief: booking.brief, requesterName: nameOf(ctx, me),
        });
        if (quote) {
          const commissionCents = commissionCentsFor(serviceId, quote.supplierQuoteCents);
          ctx.store.update((db) => {
            const b = db.eliteBookings.find((x) => x.id === booking.id)!;
            b.status = "quoted";
            b.supplierQuoteCents = quote.supplierQuoteCents;
            b.commissionCents = commissionCents;
            if (quote.operatorName) b.operatorName = quote.operatorName;
            b.quotedAt = ctx.now().toISOString();
          });
          quoted = ctx.store.data.eliteBookings.find((b) => b.id === booking.id)!;
        } else {
          note = `${eliteDesk.status.name} did not quote this one. The desk will come back to you.`;
        }
      } catch {
        // A partner outage is not the member's problem: the request is
        // already recorded, so it degrades to the by-hand path.
        note = "The desk has your request and will come back to you.";
      }
    } else {
      note = isAutomatic(eliteDesk.status)
        ? `${eliteDesk.status.name} does not cover this one. The desk will come back to you.`
        : "The desk has your request and will come back to you with a price.";
    }

    return { booking: quoted, disclosures: disclosuresFor(serviceId), note };
  },

  "GET /api/elite/bookings": (ctx) => {
    const me = actor(ctx);
    requireElite(ctx);
    return { bookings: ctx.store.data.eliteBookings.filter((b) => b.travelerId === me) };
  },

  /* ---------------------------------------------------------------
     Elite member events — an invitation list, not a booking. See
     `ELITE_EVENTS` in elite.ts for why these are separate from the
     Wingman Club's monthly pick, which Elite already gets included.
     --------------------------------------------------------------- */

  "GET /api/elite/events": (ctx) => {
    const me = actor(ctx);
    requireElite(ctx);
    const now = ctx.now();
    const events = upcomingEliteEvents(now).map((e) => {
      const rsvps = ctx.store.data.eliteEventRsvps.filter((r) => r.eventId === e.id);
      return {
        ...e,
        rsvpCount: rsvps.length,
        hasRoom: eliteEventHasRoom(e, rsvps.length),
        isGoing: rsvps.some((r) => r.travelerId === me),
      };
    });
    return { events };
  },

  "POST /api/elite/events/:eventId/rsvp": (ctx, p) => {
    const me = actor(ctx);
    requireElite(ctx);
    const id = req(p, "eventId");
    const event = findEliteEvent(id);
    const rsvps = ctx.store.data.eliteEventRsvps.filter((r) => r.eventId === id);
    const already = rsvps.find((r) => r.travelerId === me);
    if (already) return { isGoing: true, rsvpCount: rsvps.length };
    if (!eliteEventHasRoom(event, rsvps.length)) {
      throw new HttpError(409, `${event.label} is full — every seat is already RSVP'd.`);
    }
    ctx.store.update((db) => {
      db.eliteEventRsvps.push({ id: newId("rsvp"), eventId: id, travelerId: me, createdAt: ctx.now().toISOString() });
    });
    return { isGoing: true, rsvpCount: rsvps.length + 1 };
  },

  "POST /api/elite/events/:eventId/cancel": (ctx, p) => {
    const me = actor(ctx);
    const id = req(p, "eventId");
    ctx.store.update((db) => {
      db.eliteEventRsvps = db.eliteEventRsvps.filter((r) => !(r.eventId === id && r.travelerId === me));
    });
    const rsvpCount = ctx.store.data.eliteEventRsvps.filter((r) => r.eventId === id).length;
    return { isGoing: false, rsvpCount };
  },

  /* ---------------------------------------------------------------
     Elite's monthly spending allowance — a real card, funded by
     Safehubby, never held against the member's own. See
     `eliteSpendingAllowanceCents` in billing.ts for the amount and why
     it is a percentage of dues rather than a flat number.
     --------------------------------------------------------------- */

  "GET /api/elite/spending-card": (ctx) => {
    const me = actor(ctx);
    requireElite(ctx);
    const capCents = eliteSpendingAllowanceCents(planOf(ctx, me));
    const monthKey = clubMonthKey(ctx.now());
    const card = ctx.store.data.eliteSpendingCards.find((c) => c.travelerId === me && c.monthKey === monthKey) ?? null;
    return { capCents, monthKey, card, automatic: isAutomatic(revolutCards.status) };
  },

  "POST /api/elite/spending-card": async (ctx) => {
    const me = actor(ctx);
    requireElite(ctx);
    const capCents = eliteSpendingAllowanceCents(planOf(ctx, me));
    const monthKey = clubMonthKey(ctx.now());
    const existing = ctx.store.data.eliteSpendingCards.find((c) => c.travelerId === me && c.monthKey === monthKey);
    if (existing) return { card: existing };
    if (!isAutomatic(revolutCards.status)) throw new HttpError(503, revolutCards.status.requires);

    const now = ctx.now();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const issued = await revolutCards.issueCard({
      capCents, currency: "USD",
      label: `Elite spending allowance — ${monthKey}`,
      expiresAt: nextMonth.toISOString(),
    });
    const card = {
      id: newId("esc"), travelerId: me, monthKey, capCents,
      cardId: issued.id, last4: issued.last4, network: issued.network,
      expMonth: issued.expMonth, expYear: issued.expYear, issuedAt: now.toISOString(),
    };
    ctx.store.update((db) => void db.eliteSpendingCards.push(card));
    return { card };
  },

  /** The one-time reveal link, fetched fresh each time — never stored. Same
   *  discipline as the assistant task card's own reveal route. */
  "POST /api/elite/spending-card/reveal": async (ctx) => {
    const me = actor(ctx);
    requireElite(ctx);
    const monthKey = clubMonthKey(ctx.now());
    const card = ctx.store.data.eliteSpendingCards.find((c) => c.travelerId === me && c.monthKey === monthKey);
    if (!card) throw notFound("Spending card");
    if (!isAutomatic(revolutCards.status)) throw new HttpError(503, revolutCards.status.requires);
    const revealUrl = await revolutCards.revealCard(card.cardId);
    if (!revealUrl) throw new HttpError(410, "This card can no longer be revealed. Ask support to reissue it.");
    return { revealUrl, card };
  },

  /**
   * The desk's own quote, entered by an operator with the admin key — there
   * is no supplier API behind any of this yet, and inventing one would be
   * exactly the fake capability this codebase refuses everywhere else.
   * `operatorName` is required for jet travel because 14 CFR Part 295 makes
   * naming the operating carrier a precondition of the member agreeing.
   */
  "POST /api/admin/elite/bookings/:bookingId/quote": (ctx, p, body) => {
    requireAdmin(ctx, "write");
    const id = req(p, "bookingId");
    const booking = ctx.store.data.eliteBookings.find((b) => b.id === id);
    if (!booking) throw notFound("Booking");

    const supplierQuoteCents = Math.round(Number(body?.supplierQuoteCents));
    const commissionCents = commissionCentsFor(booking.serviceId, supplierQuoteCents);
    const operatorName = body?.operatorName ? String(body.operatorName) : undefined;
    if (booking.serviceId === "jet-travel" && !operatorName) {
      throw new HttpError(400, "Name the operating air carrier — 14 CFR Part 295 requires it before the member agrees.");
    }

    ctx.store.update((db) => {
      const b = db.eliteBookings.find((x) => x.id === id)!;
      b.status = "quoted";
      b.supplierQuoteCents = supplierQuoteCents;
      b.commissionCents = commissionCents;
      if (operatorName) b.operatorName = operatorName;
      b.quotedAt = ctx.now().toISOString();
    });
    return { booking: ctx.store.data.eliteBookings.find((b) => b.id === id) };
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
      resume: resumeFrom(body, ctx.now()),
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
    requireAdmin(ctx, "write");
    return runPayroll(ctx);
  },

  /** Admin: the review queue. Applicant contact and licence details are real
   *  personal data, so this is the one place in the app gated by a shared
   *  secret rather than a per-account role — see requireAdmin. */
  "GET /api/drivers/applications": (ctx) => {
    requireAdmin(ctx, "operations");
    return ctx.store.data.driverApplications;
  },

  "POST /api/drivers/applications/:id/review": (ctx, p, body) => {
    requireAdmin(ctx, "write");
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

  /* -------------------------------------------------------------------------
     Hiring for the roles that do not drive
     ---------------------------------------------------------------------- */

  /** What roles are open, and the two things everyone hired gets. Public: this
   *  is a job post, and a job post behind a login is not a job post. */
  "GET /api/staff/roles": () => ({
    roles: STAFF_ROLES.filter((r) => r.id !== "driver"),
    benefits: HIRING_BENEFITS,
  }),

  "POST /api/staff/apply": (ctx, _p, body) => {
    if (ctx.limiters.applications.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many applications from this connection. Try again later.");
    }
    const app = submitStaffApplication({
      id: newId("staff"),
      role: String(body?.role ?? "") as StaffRole,
      fullName: String(body?.fullName ?? ""),
      email: String(body?.email ?? ""),
      phone: String(body?.phone ?? ""),
      city: String(body?.city ?? ""),
      state: String(body?.state ?? ""),
      experience: String(body?.experience ?? ""),
      resume: resumeFrom(body, ctx.now()),
      hoursPerWeek: Number(body?.hoursPerWeek),
      backgroundCheckConsent: body?.backgroundCheckConsent === true,
      now: ctx.now(),
    });
    ctx.store.update((db) => void db.staffApplications.push(app));
    return { id: app.id, role: app.role, status: app.status, submittedAt: app.submittedAt };
  },

  "POST /api/staff/applications/:id/withdraw": (ctx, p, body) => {
    const id = req(p, "id");
    const app = ctx.store.data.staffApplications.find((a) => a.id === id);
    if (!app || app.email !== String(body?.email ?? "").trim().toLowerCase()) throw notFound("Application");
    const withdrawn = withdrawStaffApplication(app, ctx.now());
    ctx.store.update((db) => {
      const i = db.staffApplications.findIndex((a) => a.id === id);
      db.staffApplications[i] = withdrawn;
    });
    return { id: withdrawn.id, status: withdrawn.status };
  },

  /** Admin: the review queue for non-driving roles, gated the same way the
   *  driver queue is and for the same reason — it is real personal data. */
  "GET /api/staff/applications": (ctx) => {
    requireAdmin(ctx, "operations");
    return ctx.store.data.staffApplications;
  },

  "POST /api/staff/applications/:id/review": (ctx, p, body) => {
    requireAdmin(ctx, "write");
    const id = req(p, "id");
    const app = ctx.store.data.staffApplications.find((a) => a.id === id);
    if (!app) throw notFound("Application");
    const status = String(body?.status ?? "") as Exclude<ApplicationStatus, "withdrawn">;
    const reviewed = reviewStaffApplication(app, status, ctx.now(), body?.note ? String(body.note) : undefined);
    ctx.store.update((db) => {
      const i = db.staffApplications.findIndex((a) => a.id === id);
      db.staffApplications[i] = reviewed;
    });
    return reviewed;
  },

  /**
   * Admin: hire an approved applicant onto the roster.
   *
   * The missing link between two halves that each worked alone: applications
   * could be approved and tasks could be dispatched, but dispatch only read
   * the partner network, so somebody hired through this app could never be
   * sent to a job. This is the only route that creates a dispatchable
   * assistant, and it refuses anything not already approved.
   *
   * It also provisions their portal login and returns the temporary password
   * **once**. It is not stored in readable form and cannot be shown again —
   * relay it to the person and have them change it on first sign-in, which
   * the portal forces.
   */
  "POST /api/staff/applications/:id/hire": async (ctx, p, body) => {
    requireAdmin(ctx, "write");
    const id = req(p, "id");
    const app = ctx.store.data.staffApplications.find((a) => a.id === id);
    if (!app) throw notFound("Application");
    if (ctx.store.data.assistants.some((a) => a.applicationId === id)) {
      throw new HttpError(409, "That application has already been hired.");
    }

    const market = String(body?.market ?? "") as LaunchMarketId;
    if (!LAUNCH_MARKETS.some((m) => m.id === market)) {
      throw new HttpError(400, `Pick the market they work: ${launchMarketNames()}.`);
    }

    const assistant = hireFromApplication({
      id: newId("asst"),
      application: app,
      market,
      maxConcurrentCustomers: body?.maxConcurrentCustomers !== undefined
        ? Number(body.maxConcurrentCustomers) : undefined,
      bio: body?.bio ? String(body.bio) : undefined,
      photoUrl: body?.photoUrl ? String(body.photoUrl) : undefined,
      yearsExperience: body?.yearsExperience !== undefined ? Number(body.yearsExperience) : undefined,
      gender: body?.gender ? String(body.gender) : undefined,
      age: body?.age !== undefined ? Number(body.age) : undefined,
      now: ctx.now(),
    });

    ctx.store.update((db) => void db.assistants.push(assistant));
    const credentials = await provisionAssistantCredentials(ctx, assistant.id);
    return { assistant, credentials };
  },

  /** Admin: the roster, including who has been stood down. */
  "GET /api/staff/roster": (ctx) => {
    requireAdmin(ctx, "operations");
    const now = ctx.now();
    return {
      assistants: ctx.store.data.assistants,
      active: ctx.store.data.assistants.filter((a) => isOnRoster(a, now)).length,
    };
  },

  /** Admin: stand someone down. The record stays — they are still attached
   *  to every task they worked and the pay owed for it. */
  "POST /api/staff/roster/:assistantId/stand-down": (ctx, p) => {
    requireAdmin(ctx, "write");
    const assistantId = req(p, "assistantId");
    const assistant = ctx.store.data.assistants.find((a) => a.id === assistantId);
    if (!assistant) throw notFound("Assistant");
    const stood = standDown(assistant, ctx.now());
    ctx.store.update((db) => {
      const i = db.assistants.findIndex((a) => a.id === assistantId);
      db.assistants[i] = stood;
    });
    return stood;
  },

  /**
   * Admin: what the hiring plan costs. Reads the model in `staffing.ts`
   * against the roster actually hired so far, so the budget is checked against
   * reality rather than against the plan it was written from.
   */
  "GET /api/admin/budget": (ctx) => {
    requireAdmin(ctx, "money");
    const approved = ctx.store.data.staffApplications.filter((a) => a.status === "approved");
    const approvedDrivers = ctx.store.data.driverApplications.filter((a) => a.status === "approved");
    // Keyed off STAFF_ROLES rather than written out, so a role added later
    // is counted here instead of silently costing nothing.
    const hired = Object.fromEntries(STAFF_ROLES.map((role) => [
      role.id,
      role.id === "driver"
        ? approvedDrivers.length
        : approved.filter((a) => a.role === role.id).length,
    ])) as Record<StaffRole, number>;
    // How many subscribers each everyday plan needs to carry the roster,
    // for the planned headcount and for who is actually hired. Computed off
    // the live plan price rather than written into docs/budget.md, where the
    // same figure went stale through a repricing and nothing caught it.
    const carriedBy = (headcount: Record<StaffRole, number>) =>
      Object.fromEntries(
        PLANS.filter((p) => p.monthlyCents > 0 && !isElitePlan(p.id))
          .map((p) => [p.id, subscribersToCarryRoster(p.id, headcount)]),
      );

    return {
      plan: {
        headcount: PRELAUNCH_HEADCOUNT,
        budget: prelaunchBudget(),
        monthlyAfterLaunch: monthlyRosterCents(),
        subscribersToCarry: carriedBy(PRELAUNCH_HEADCOUNT),
      },
      actual: {
        headcount: hired,
        budget: prelaunchBudget(hired),
        monthlyAfterLaunch: monthlyRosterCents(hired),
        subscribersToCarry: carriedBy(hired),
      },
      // One owner-operator with a car: what it costs before there is a
      // roster at all, which is the number this actually starts against.
      solo: {
        headcount: SOLO_HEADCOUNT,
        monthlyAfterLaunch: monthlyRosterCents(SOLO_HEADCOUNT),
        subscribersToCarry: carriedBy(SOLO_HEADCOUNT),
      },
      benefits: HIRING_BENEFITS,
    };
  },

  /* -------------------------------------------------------------------------
     The launch mailing list
     ---------------------------------------------------------------------- */

  /**
   * Join the list. Public and account-free on purpose: the person this is for
   * is someone who found Safehubby during the pre-launch window and cannot use
   * it yet, so requiring them to make an account first would be asking them to
   * sign up for the thing they are being told does not exist yet.
   *
   * Answers `delivered: false` whenever no mail provider is configured, rather
   * than implying a confirmation email is on its way. See `newsletter.ts`.
   */
  "POST /api/newsletter": (ctx, _p, body) => {
    if (ctx.limiters.applications.hit(ctx.clientKey)) {
      throw new HttpError(429, "Too many sign-ups from this connection. Try again later.");
    }
    const { list, subscriber, alreadyOnList } = addSubscriber(ctx.store.data.newsletterSubscribers, {
      id: newId("news"),
      email: String(body?.email ?? ""),
      source: (body?.source ? String(body.source) : "landing") as NewsletterSource,
      token: newUnsubscribeToken(secureFraction),
      now: ctx.now(),
    });
    ctx.store.update((db) => { db.newsletterSubscribers = list; });
    return {
      subscribed: true,
      alreadyOnList,
      // Never "check your inbox" — nothing sends mail yet, and the whole
      // promise of this list is a message that arrives later.
      delivered: isAutomatic(email.status),
      note: isAutomatic(email.status)
        ? "You're on the list. We'll email you the day we go live."
        : "You're on the list. We'll email you the day we go live — no confirmation email is sent yet.",
      launch: launchStatus(ctx.now()),
      subscriberId: subscriber.id,
    };
  },

  "POST /api/newsletter/unsubscribe": (ctx, _p, body) => {
    const { list, removed } = unsubscribe(
      ctx.store.data.newsletterSubscribers,
      String(body?.email ?? ""),
      String(body?.token ?? ""),
      ctx.now(),
    );
    ctx.store.update((db) => { db.newsletterSubscribers = list; });
    // Always the same answer, whether or not the address was on the list: a
    // different one would confirm membership to whoever asked.
    void removed;
    return { unsubscribed: true };
  },

  /** Admin: the list itself, for the day there is something to send. */
  "GET /api/admin/newsletter": (ctx) => {
    requireAdmin(ctx, "operations");
    const all = ctx.store.data.newsletterSubscribers;
    return {
      total: all.length,
      active: activeSubscribers(all).length,
      delivery: email.status,
      subscribers: all,
    };
  },

  /** Master: get current pricing including any overrides. */
  "GET /api/master/pricing": (ctx) => {
    requireAdmin(ctx, "operations");
    const current = compilePricing(ctx.store.data.priceOverrides, defaultPricing());
    return {
      current,
      // What the owner's own rate adds up to so far this month — a planning
      // number for the dashboard, not a payout. See ownerAccruedCentsFor's
      // own comment for why there is nothing here that moves money.
      ownerAccrual: ownerAccrualFor(current.ownerMonthlyCents, ctx.now()),
      overrides: ctx.store.data.priceOverrides.sort((a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
      ),
    };
  },

  /** Master: create or update a price override. */
  "POST /api/master/pricing/override": (ctx, _p, body) => {
    requireAdmin(ctx, "operations");
    const account = masterAccountOf(ctx);
    if (!account) throw new HttpError(401, "Not authenticated as master");

    const roleOrService = String(body?.roleOrService ?? "");
    const priceCents = Number(body?.priceCents ?? 0);
    const reason = String(body?.reason ?? "");

    if (!roleOrService || priceCents <= 0) {
      throw new HttpError(400, "Invalid roleOrService or priceCents");
    }

    const override = {
      id: newId("ovr"),
      roleOrService,
      priceCents,
      changedBy: account.id,
      changedAt: ctx.now().toISOString(),
      reason: reason || undefined,
    } as PriceOverride;

    ctx.store.update((db) => {
      db.priceOverrides.push(override);
      // Record audit log with recordAccess format
      db.masterAuditLog.push({
        id: newId("audit"),
        accountId: account.id,
        scope: "operations",
        subject: `price override for ${roleOrService}`,
        at: ctx.now().toISOString(),
      });
    });

    const current = compilePricing(ctx.store.data.priceOverrides, defaultPricing());

    return { override, current, ownerAccrual: ownerAccrualFor(current.ownerMonthlyCents, ctx.now()) };
  },

  /** Master: get payroll summary for assistants and staff. */
  "GET /api/master/payroll": (ctx) => {
    requireAdmin(ctx, "operations");

    // Get completed concierge tasks and their payouts
    const completedTasks = ctx.store.data.conciergeTasks.filter((t) => t.status === "completed");
    const paidTasks = ctx.store.data.payouts.length > 0
      ? ctx.store.data.payouts.flatMap((p) => p.taskIds || [])
      : [];

    const unpaidTasks = completedTasks.filter((t) => !paidTasks.includes(t.id));

    const staffSummary = STAFF_ROLES.map((role) => {
      const staff = ctx.store.data.assistants.filter((a) => a.role === role.id);
      return {
        role: role.id,
        label: role.label,
        headcount: staff.length,
        hourlyCents: role.hourlyCents,
        hoursPerWeek: role.prelaunchHoursPerWeek,
        monthlyCost: Math.round((role.hourlyCents * role.prelaunchHoursPerWeek * 52) / 12),
      };
    });

    return {
      unpaidTaskCount: unpaidTasks.length,
      unpaidTasksCents: unpaidTasks.reduce((sum, t) => sum + t.assistantPayoutCents, 0),
      completedTaskCount: completedTasks.length,
      staffSummary,
      recentPayouts: ctx.store.data.payouts.slice(-5).map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        taskCount: (p.taskIds || []).length,
        totalCents: p.totalCents,
      })),
    };
  },
};
