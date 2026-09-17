/**
 * Subscription tiers.
 *
 * Two monetization lines from the original brief are deliberately absent:
 * selling "anonymized" drinking-and-location trend data (location traces are
 * notoriously re-identifiable, and a bar-level drinking history is exactly the
 * data you cannot promise to anonymize), and ad targeting built on that data.
 * Revenue here comes from subscriptions, ride/delivery referrals, and venue
 * partnerships — all of which the user can see.
 */

import { isEnabled } from "./features.ts";

export type PlanId =
  | "free" | "premium-basic" | "premium-plus" | "family"
  // Elite is a ladder, not a price. See ELITE_LADDER below.
  | "elite" | "elite-signature" | "elite-private";

export type Feature =
  | "location-sharing"
  | "automatic-rides"
  | "automatic-delivery"
  | "secure-transport"
  | "check-ins"
  | "drink-count"
  | "sos"
  | "drink-details"
  | "venue-menus"
  | "bac-estimate"
  | "recovery-plan"
  | "ride-booking"
  | "quick-tasks"
  | "supply-delivery"
  | "safe-routes"
  | "history-analytics"
  | "group-games"
  | "multi-profile"
  | "extended-sos-contacts"
  | "extended-menu"
  | "personal-concierge"
  | "desk-tasks"
  // Elite-only, and held for a later release behind the `elite-tier` flag —
  // see ELITE_ONLY below and docs/billing.md. Each one needs a real supplier
  // relationship before it can be turned on, and two of them carry legal
  // duties of their own.
  | "private-aviation"
  | "yacht-charter"
  | "luxury-property"
  | "event-production"
  | "premium-hospitality"
  | "lifestyle-manager"
  | "concierge-doctor";

/**
 * Every member of `Feature`, as data rather than as a type.
 *
 * Written as a Record keyed by the union rather than a plain array so that
 * `satisfies` makes it exhaustive: adding a new `Feature` without adding it
 * here is a compile error. That is what actually holds Premium Plus's
 * "includes everything" promise together — `PLUS_FEATURES` is this list, so
 * a feature added later lands on the top tiers automatically instead of
 * being silently withheld until someone notices.
 */
const EVERY_FEATURE = {
  "location-sharing": true,
  "automatic-rides": true,
  "automatic-delivery": true,
  "secure-transport": true,
  "check-ins": true,
  "drink-count": true,
  sos: true,
  "drink-details": true,
  "venue-menus": true,
  "bac-estimate": true,
  "recovery-plan": true,
  "ride-booking": true,
  "quick-tasks": true,
  "supply-delivery": true,
  "safe-routes": true,
  "history-analytics": true,
  "group-games": true,
  "multi-profile": true,
  "extended-sos-contacts": true,
  "extended-menu": true,
  "personal-concierge": true,
  "desk-tasks": true,
  "private-aviation": true,
  "yacht-charter": true,
  "luxury-property": true,
  "event-production": true,
  "premium-hospitality": true,
  "lifestyle-manager": true,
  "concierge-doctor": true,
} satisfies Record<Feature, true>;

export const ALL_FEATURES: Feature[] = Object.keys(EVERY_FEATURE) as Feature[];

/** What to call a `Feature` in front of a customer — never the raw id, which
 *  is a code identifier, not a sentence. Used both by the "your plan
 *  doesn't include this" error and by the plan comparison table, so the two
 *  can never drift into calling the same feature two different things. */
export const FEATURE_LABELS: Record<Feature, string> = {
  "location-sharing": "Location sharing",
  "automatic-rides": "Safehubby books your ride",
  "automatic-delivery": "Safehubby sends supplies",
  "secure-transport": "Secure transport",
  "check-ins": "Check-ins",
  "drink-count": "Drink count",
  sos: "SOS",
  "drink-details": "Detailed drink logging",
  "venue-menus": "Venue menus",
  "bac-estimate": "Intoxication estimate",
  "recovery-plan": "Recovery plan",
  "ride-booking": "Ride booking",
  "quick-tasks": "Quick errands (grab something)",
  "supply-delivery": "Supply delivery",
  "safe-routes": "Safe routes",
  "history-analytics": "Night history",
  "group-games": "Group games",
  "multi-profile": "Multiple people on one account",
  "extended-sos-contacts": "Extended SOS contacts",
  "extended-menu": "Extended pharmacy-run menu",
  "personal-concierge": "Personal concierge",
  "desk-tasks": "Ask an assistant (desk tasks)",
  "private-aviation": "Jet travel",
  "yacht-charter": "Yacht charter",
  "luxury-property": "Villas and property",
  "event-production": "Event production",
  "premium-hospitality": "Hotels and hospitality",
  "lifestyle-manager": "Lifestyle manager",
  "concierge-doctor": "Concierge doctor",
};

export function featureLabel(feature: Feature): string {
  return FEATURE_LABELS[feature];
}

export interface Plan {
  id: PlanId;
  name: string;
  monthlyCents: number;
  annualCents: number;
  seats: number;
  features: Feature[];
  blurb: string;
  /** Hours of personal-assistant time the membership already pays for each
   *  month, on the tiers that include any. Hours beyond it bill at the same
   *  published rate, so the allowance is a prepayment and never a discount
   *  hiding in a subscription. */
  includedConciergeHours?: number;
}

/**
 * Safety basics are never paywalled. SOS and location sharing are free
 * forever. Ride booking is included so users can get home safely, and
 * quick-tasks lets a free user send someone to grab a specific thing
 * (`grab-something`, `run-errand`) at the same discounted, bounded rate the
 * errand-runner roster is paid at — see `QUICK_TASK_CATEGORIES` in
 * concierge.ts. The rest of the personal concierge (waiting with someone,
 * checking on someone, booking and buying, airport pickups) stays behind
 * `personal-concierge` on a paid tier: those are open-ended time with a
 * person, not a bounded ten-minute pickup.
 */
const FREE_FEATURES: Feature[] = ["location-sharing", "check-ins", "drink-count", "sos", "ride-booking", "quick-tasks"];

const BASIC_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "drink-details",
  "venue-menus",
  "bac-estimate",
  "recovery-plan",
  // On every paid tier, not just Family — see the pricing comment below for
  // why the standing costs behind it are spread the same way.
  "personal-concierge",
  // The desk half of the same job: appointments, reminders, the email nobody
  // wants to write. Included rather than billed — see desk-tasks.ts — and on
  // the entry tier for the same reason the concierge is, since a feature
  // withheld from the cheapest paid plan is the one people judge it on.
  "desk-tasks",
];

/**
 * The luxury-lifestyle catalogue, held off every everyday tier.
 *
 * These are not "more of the same" — they are a different business, priced
 * the way the concierge industry actually prices them (see docs/billing.md
 * for the researched market rates). Keeping them in their own list is what
 * lets `PLUS_FEATURES` stay "everything a normal subscriber gets" without
 * silently handing a $69.99 Family plan a private jet desk.
 */
export const ELITE_ONLY: Feature[] = [
  "private-aviation",
  "yacht-charter",
  "luxury-property",
  "event-production",
  "premium-hospitality",
  "lifestyle-manager",
  "concierge-doctor",
];

/**
 * Premium Plus is the everything tier for everyday use — every feature
 * except the Elite-only catalogue, derived from `ALL_FEATURES` rather than
 * hand-maintained. On top of what Premium has, that means: automatic
 * fulfilment (Safehubby books and pays on the user's behalf through the
 * business APIs, then bills it on — that float is a real part of what this
 * tier costs), ride booking, supply delivery, safe routes, history, group
 * games, and the four that used to be withheld for Family —
 * `secure-transport`, `extended-menu`, `extended-sos-contacts` and
 * `multi-profile`.
 *
 * Deriving it this way keeps the guarantee that matters: adding a `Feature`
 * is still a compile error until it is listed in `EVERY_FEATURE`, and the
 * author then has to decide whether it belongs in `ELITE_ONLY` or lands on
 * the everyday tiers. Nothing can be added and quietly forgotten.
 */
const PLUS_FEATURES: Feature[] = ALL_FEATURES.filter((f) => !ELITE_ONLY.includes(f));

/**
 * Pricing.
 *
 * The pre-authorization hold in payment.ts still does its job: Safehubby
 * never fronts money on an automatic ride or delivery that is not already
 * reserved on the rider's card, so that particular risk is not what these
 * numbers are pricing in anymore.
 *
 * They went back up anyway, for a reason the hold does not touch: secure
 * transport. An armed driver's liability, commercial-livery and E&O coverage
 * is not something an individual contractor or Safehubby itself can buy
 * piecemeal — it has to come from a contract with an already-licensed,
 * already-insured security firm (see docs/driving.md), and that contract
 * costs real money every month whether or not a given subscriber ever books
 * a secure-transport trip. Spreading that fixed cost, plus an actual profit
 * margin instead of pricing at cost, across the paid tiers is why Premium
 * and Premium Plus went back up too, not just Family.
 *
 * **Premium Plus is now the everything tier, and Family differs only by
 * seats.** `secure-transport` and `extended-menu` used to be withheld from
 * Premium Plus specifically so their standing costs could be priced into
 * Family alone — the security firm's monthly contract above, and the wider
 * pharmacy-run menu (see care-package.ts), which is real takeout-grade food
 * and costs more per basket than a snack basket does. Those costs did not go
 * away when the features moved down; they are now spread across Premium Plus
 * subscribers too. That is a deliberate margin
 * trade, not an oversight: a tier that visibly holds back the safest way
 * home is a worse product than one that doesn't, and a simpler ladder
 * ("everything, for one or two people" vs "everything, for six") converts
 * better than one that asks a subscriber to audit a feature matrix. If the
 * secure-transport retainer turns out to be the line item that decides
 * whether this is profitable, the honest lever is Premium Plus's own price,
 * not re-fencing the feature.
 *
 * What this leaves Family to justify its price with is seats, and seats
 * alone: six against Premium Plus's two, which is a real per-person
 * discount ($10.00/seat against $20.00) and the same shape every household
 * plan uses.
 *
 * The ladder is 1, 1, 2, 6. Free and Premium are **one person** — the
 * entry tiers are for somebody looking after themselves, and a second seat
 * is the first thing worth paying to add. `seats` is a published number and
 * also a real limit in one place: `peopleCountFor` clamps a concierge
 * task's household count to it, so a Premium subscriber books an assistant
 * for themselves rather than for a group. Nothing counts profiles or crew
 * members against it yet; that is still the next thing to build here.
 *
 * Ride and delivery costs are still passed through at the provider's price on
 * top of the subscription. Bundling them would mean either capping how often
 * someone can get home safely, or pricing for the heaviest user and
 * overcharging everyone else. Neither is a good look on a safety product.
 *
 * Personal concierge (see concierge.ts) is mostly the same shape as rides and
 * delivery — a task's own cost is charged at exactly the spend cap the
 * subscriber set, never rolled into the subscription price. It started as a
 * Family-only perk, priced in only there; it is now on every paid tier, and
 * the pricing follows the access — every paid tier absorbs a share of the two
 * standing costs behind it, not just Family:
 *
 *   - The partner-network retainer itself (see docs/concierge.md) — the same
 *     shape as secure transport's insurance contract, and priced the same
 *     way, as a fixed cost spread across subscribers rather than billed at
 *     cost per task.
 *   - Funding the Revolut Business balance that issues each task's spend-
 *     capped virtual card (see docs/concierge.md and adapters/cards.ts).
 *     Safehubby fronts that money for the (short) window between the card
 *     being issued and the subscriber's own hold being captured — a real
 *     float, even though each card's cap bounds it tightly and it clears fast.
 *
 * Not a salary line: the assistants are independent partner-network
 * professionals dispatched through that retainer, not Safehubby employees —
 * see concierge.ts. There is no payroll here to price in, which is exactly
 * why these bumps are smaller than what putting concierge staff on payroll
 * would have cost.
 *
 * One thing this deliberately does not do: give Premium a lighter version of
 * concierge, or a lower spend cap, to keep some daylight between it and
 * Family. Every paid tier gets the same feature, capped the same way
 * (`CONCIERGE_MIN_CAP_CENTS`/`CONCIERGE_MAX_CAP_CENTS` in concierge.ts) — the
 * spend cap protects the subscriber and the card issuer, not a pricing tier,
 * and there is no safety reason to make the cheapest paid plan's version of
 * "send a stranger to help" worse.
 */
/**
 * Priced against what these tiers actually bundle, not against safety apps
 * alone — the previous card ($9.99 / $19.99 / $29.99) benchmarked purely
 * against Life360/Noonlight/Citizen Protect and landed below what a
 * standalone concierge subscription charges for *just* the concierge half
 * of what Premium Plus and Family already include.
 *
 * Measured (September 2026): Life360 Platinum $24.99 (whole circle, not one
 * person). Concierge-membership comparables run well above that on their
 * own — Ask Sunday and similar text-a-concierge apps commonly land
 * $30-$70/month for on-demand task requests with no safety layer at all;
 * Amalfi-tier luxury concierge desks (see elite.ts's `ELITE_DESK_MEMBERSHIP`)
 * run into four figures a year. Premium Plus and Family bundle a real
 * personal concierge (bounded, spend-capped, dispatched to an actual
 * roster — concierge.ts) with safety tracking and secure transport in one
 * price, which is worth more than either category alone, not less.
 *
 * So: Premium ($19.99) sits above the pure-safety comps but well under a
 * standalone concierge subscription, for a household of one. Premium Plus
 * ($39.99, two seats) lands inside the concierge-app band while adding the
 * whole safety layer for free. Family ($59.99, six seats) keeps the same
 * per-seat discount shape Premium Plus uses ($20.00/seat against
 * $10.00/seat) rather than pricing seats independently of that ratio.
 *
 * **The subscription is still not the whole business.** Every tier's other
 * margin is the 20% on concierge tasks (`CONCIERGE_FEE_MARGIN`), the same
 * way Elite's is commission rather than dues — this repricing raises the
 * door's own price without touching that margin, rather than trading one
 * for the other.
 *
 * Annual stays ~17% off: a rounder, more legible saving, unchanged by this
 * round — only the number the percentage applies to moved.
 */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyCents: 0,
    annualCents: 0,
    seats: 1,
    features: FREE_FEATURES,
    blurb: "For one person. Location sharing, check-ins, drink count, SOS, ride booking, and quick errands. Always free — safety basics are not a paywall.",
  },
  {
    id: "premium-basic",
    name: "Premium",
    monthlyCents: 1999,
    annualCents: 19999,
    seats: 1,
    features: BASIC_FEATURES,
    blurb: "For one person. Venue menus, detailed logging, intoxication estimates, the recovery plan, and a personal concierge for one bounded, capped-spend task at a time.",
  },
  {
    id: "premium-plus",
    name: "Premium Plus",
    monthlyCents: 3999,
    annualCents: 39999,
    seats: 2,
    features: PLUS_FEATURES,
    blurb: "For two. Everything Safehubby does, with nothing held back for a higher tier: Safehubby books your ride and sends supplies itself, plus secure transport where it operates, the full pharmacy-run menu, safe routes, history, group games, extended emergency contacts, and a personal concierge.",
  },
  {
    id: "family",
    name: "Family",
    monthlyCents: 5999,
    annualCents: 59999,
    seats: 6,
    // Identical features to Premium Plus, by design — Family is the same
    // product for more people, not a longer feature list.
    features: PLUS_FEATURES,
    blurb: "The same everything as Premium Plus, for up to six people instead of two — one household, one bill, and a lower price per person.",
  },
  {
    id: "elite",
    name: "Elite",
    monthlyCents: 150000,
    annualCents: 1499999,
    seats: 1,
    features: [...PLUS_FEATURES, ...ELITE_ONLY],
    includedConciergeHours: 10,
    blurb: "For one person. The luxury desk — jet charter arranged, villas, yachts and events — plus a concierge physician practice, retainer included rather than billed separately, and ten hours of a personal assistant's time every month.",
  },
  {
    id: "elite-signature",
    name: "Elite Signature",
    monthlyCents: 750000,
    annualCents: 7499999,
    seats: 2,
    features: [...PLUS_FEATURES, ...ELITE_ONLY],
    includedConciergeHours: 50,
    blurb: "For two. The same desk and the same included physician's retainer, with fifty hours a month behind it — enough that the assistant knows your household rather than your last request.",
  },
  {
    id: "elite-private",
    name: "Elite Private",
    monthlyCents: 6000000,
    annualCents: 59999999,
    seats: 6,
    features: [...PLUS_FEATURES, ...ELITE_ONLY],
    includedConciergeHours: 200,
    blurb: "For up to six. Two hundred hours a month with a named team, the physician's retainer included, and at-home doctor visits and evaluation arranged for anyone on the membership — not just a referral, a doctor who comes to you.",
  },
];

/**
 * Why Elite is a ladder from $1,500 to $60,000 rather than one price, and
 * why the rungs go 1/2/6 seats instead of the flat 6 they used to.
 *
 * These tiers sell two things now, not one: somebody's time (the hours), and
 * the concierge physician's own retainer, paid by Safehubby rather than
 * billed to the member separately. That second piece is real money —
 * concierge-medicine retainers commonly run $2,000-$5,000 a year — and it is
 * why the entry rung moved from $500 to $1,500: a member who never books a
 * single hour of concierge time is still getting a covered medical retainer
 * worth more than the old dues.
 *
 * Seats now track who the retainer actually covers, the same reason the
 * everyday ladder (`free`/`premium-basic`/`premium-plus`/`family`) scales
 * seats with price — except backwards from that ladder's shape: Elite's
 * entry rung is *one* person specifically, not the whole household, because
 * a covered physician's retainer is priced per person covered by it, not
 * per household. Going from 1 to 2 to 6 seats is what makes "the retainer is
 * included" a coherent promise at every rung rather than a giveaway at the
 * top one. `releasedPlans` and its seat-ordering test are scoped to the
 * everyday ladder for exactly this reason — Elite is allowed to cost more
 * and cover fewer people, because it is not selling seats, it is selling a
 * covered person's whole benefit.
 *
 * The top rung's hours are still what makes the top price defensible against
 * the alternative of actually staffing this privately: $80,000-$150,000 a
 * year for one house manager, before employer costs. $60,000 a month for a
 * named team, six covered retainers, and two hundred hours is priced against
 * that, not against a card membership — see `docs/billing.md` for the
 * numbers this reasoning updates from.
 *
 * The desk itself still earns supplier-side — see elite.ts. Two of its
 * services carry legal duties that no pricing decision may soften: charter is
 * brokered under 14 CFR Part 295 with the operator named before a member
 * agrees, and the concierge physician still pays Safehubby nothing, ever,
 * even though Safehubby now pays the physician's retainer on the member's
 * behalf — paying for a service and taking a cut of one are not the same
 * thing, and only the second is the kickback. See `MEDICAL_FEE_RULE` in
 * elite.ts.
 */
export const ELITE_LADDER: PlanId[] = ["elite", "elite-signature", "elite-private"];

export function isElitePlan(id: PlanId): boolean {
  return ELITE_LADDER.includes(id);
}

/**
 * How many desk tasks a month each plan includes.
 *
 * "Free" here means included in the price, not unmetered: a person does every
 * one of these, so an unbounded promise is one the roster cannot keep. The
 * numbers are deliberately generous against what a household actually asks
 * for in a month, and deliberately finite so the limit is a published number
 * rather than a conversation at the point of refusal.
 *
 * Elite carries a much larger allowance rather than "unlimited" for the same
 * reason. What Elite buys beyond this is the *hours* — someone who goes
 * somewhere — which is a different and far more expensive thing.
 */
const DESK_TASK_ALLOWANCE: Record<PlanId, number> = {
  free: 0,
  "premium-basic": 10,
  "premium-plus": 25,
  family: 40,
  elite: 100,
  "elite-signature": 250,
  "elite-private": 500,
};

export function deskTaskAllowanceFor(id: PlanId): number {
  return hasFeature(id, "desk-tasks") ? DESK_TASK_ALLOWANCE[id] : 0;
}

/** The hours a plan's price already covers. Zero on everything below Elite. */
export function includedConciergeHours(id: PlanId): number {
  return findPlan(id).includedConciergeHours ?? 0;
}

/**
 * Elite's monthly spending allowance: real money loaded onto a member's own
 * spending card (see `adapters/cards.ts`'s `revolutCards`), funded by
 * Safehubby out of its own account rather than held against the member's —
 * the "free bee" the tier promises, in the same "paid for, not billed to
 * you" shape the concierge-physician retainer already uses.
 *
 * Priced as a fraction of the rung's own dues rather than a flat number for
 * every rung: a flat allowance either overpays the entry rung relative to
 * what it charges or underpays the top one, and it would not move if dues
 * ever did. Ten percent keeps the allowance a real perk — $150, $750, and
 * $6,000 a month across the ladder — without turning into a rung where the
 * "free" money approaches what the member actually pays; that ratio, not
 * the dollar figure, is the number to revisit if dues change.
 */
export const ELITE_SPENDING_ALLOWANCE_RATE = 0.10;

export function eliteSpendingAllowanceCents(id: PlanId): number {
  if (!isElitePlan(id)) return 0;
  return Math.round(findPlan(id).monthlyCents * ELITE_SPENDING_ALLOWANCE_RATE);
}

/**
 * Elite launches locked — "coming soon" — until the business has a real cash
 * cushion behind the spending allowance above, not just the flag that used to
 * be the only gate. The allowance is money Safehubby hands out every month
 * whether or not the member ever needed it; unlocking the tier before there
 * is revenue to absorb that is the fastest way to turn a perk into a hole.
 *
 * The target client count is a range (5-10) because nobody can name the
 * exact number Elite will actually sign in its first months — this uses the
 * high end, 10, for the exposure calculation on purpose: sizing the cushion
 * to the smaller, friendlier number would mean the tier unlocks and then
 * gets caught short the moment it succeeds past 5 members, which is exactly
 * backwards for a safety margin. Three times that monthly exposure, held in
 * trailing revenue, is the buffer before the commitment is judged safe to
 * turn on — see `eliteUnlockThresholdCents`.
 */
export const ELITE_UNLOCK_TARGET_CLIENTS_LOW = 5;
export const ELITE_UNLOCK_TARGET_CLIENTS_HIGH = 10;
export const ELITE_UNLOCK_SAFETY_MULTIPLE = 3;

/**
 * The monthly revenue cushion required before Elite unlocks: 3x the worst
 * case where every rung has already signed its high-end target of 10
 * members, all drawing their full spending allowance in the same month.
 * Real trailing revenue (settled charges, not a promise) is what gets
 * compared against this — see `GET /api/master/overview` in the API, which
 * is the layer that actually knows what has been charged.
 */
export function eliteUnlockThresholdCents(): number {
  return ELITE_LADDER.reduce(
    (sum, id) => sum + eliteSpendingAllowanceCents(id) * ELITE_UNLOCK_TARGET_CLIENTS_HIGH,
    0,
  ) * ELITE_UNLOCK_SAFETY_MULTIPLE;
}

/** Whether a measured trailing-revenue figure clears the cushion above. Takes
 *  the number rather than computing it, because only the API layer — with
 *  the charges ledger in hand — can say what revenue actually is; this stays
 *  a pure function of that one number so it is trivially testable. */
export function eliteUnlockedByRevenue(trailingRevenueCents: number): boolean {
  return trailingRevenueCents >= eliteUnlockThresholdCents();
}

/** How close the business is to unlocking Elite, for a progress bar rather
 *  than a bare yes/no — 100 once unlocked, never over. */
export function eliteUnlockProgressPercent(trailingRevenueCents: number): number {
  const threshold = eliteUnlockThresholdCents();
  if (threshold <= 0) return 100;
  return Math.min(100, Math.round((trailingRevenueCents / threshold) * 100));
}

export function isPlanReleased(id: PlanId): boolean {
  return isElitePlan(id) ? isEnabled("elite-tier") : true;
}

/** The plans a subscriber can actually see and choose today. */
export function releasedPlans(): Plan[] {
  return PLANS.filter((p) => isPlanReleased(p.id));
}

/**
 * Secure transport is not bundled into any subscription. A protective-service
 * trip costs multiples of a normal ride, so folding it into a monthly price
 * would mean either rationing it — rationing the safest way home is indefensible
 * on this product — or charging everyone for what few will use.
 */
export const SECURE_TRANSPORT_BILLING = "per-trip, at the provider's rate" as const;

export const TRIAL_DAYS = 14;

export function findPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function hasFeature(planId: PlanId, feature: Feature): boolean {
  return findPlan(planId).features.includes(feature);
}

/** Percent saved by paying annually, rounded to a whole number for display. */
export function annualSavingsPercent(plan: Plan): number {
  if (plan.monthlyCents === 0) return 0;
  const yearOfMonthly = plan.monthlyCents * 12;
  return Math.round(((yearOfMonthly - plan.annualCents) / yearOfMonthly) * 100);
}

export function formatPrice(cents: number): string {
  // Grouped, because the Elite ladder put four- and six-figure prices through
  // here: "$199999.99" is a number somebody has to count the digits of.
  return cents === 0 ? "Free" : `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}
