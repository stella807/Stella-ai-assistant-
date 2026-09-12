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

export type PlanId = "free" | "premium-basic" | "premium-plus" | "family" | "elite";

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
  | "supply-delivery"
  | "safe-routes"
  | "history-analytics"
  | "group-games"
  | "multi-profile"
  | "extended-sos-contacts"
  | "extended-menu"
  | "personal-concierge"
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
  "supply-delivery": true,
  "safe-routes": true,
  "history-analytics": true,
  "group-games": true,
  "multi-profile": true,
  "extended-sos-contacts": true,
  "extended-menu": true,
  "personal-concierge": true,
  "private-aviation": true,
  "yacht-charter": true,
  "luxury-property": true,
  "event-production": true,
  "premium-hospitality": true,
  "lifestyle-manager": true,
  "concierge-doctor": true,
} satisfies Record<Feature, true>;

export const ALL_FEATURES: Feature[] = Object.keys(EVERY_FEATURE) as Feature[];

export interface Plan {
  id: PlanId;
  name: string;
  monthlyCents: number;
  annualCents: number;
  seats: number;
  features: Feature[];
  blurb: string;
}

/** Safety basics are never paywalled. SOS and location sharing are free forever. */
const FREE_FEATURES: Feature[] = ["location-sharing", "check-ins", "drink-count", "sos"];

const BASIC_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "drink-details",
  "venue-menus",
  "bac-estimate",
  "recovery-plan",
  // On every paid tier, not just Family — see the pricing comment below for
  // why the standing costs behind it are spread the same way.
  "personal-concierge",
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
 * subscribers too, at an unchanged $33.99. That is a deliberate margin
 * trade, not an oversight: a tier that visibly holds back the safest way
 * home is a worse product than one that doesn't, and a simpler ladder
 * ("everything, for one or two people" vs "everything, for six") converts
 * better than one that asks a subscriber to audit a feature matrix. If the
 * secure-transport retainer turns out to be the line item that decides
 * whether this is profitable, the honest lever is Premium Plus's own price,
 * not re-fencing the feature.
 *
 * What this leaves Family to justify its price with is seats, and seats
 * alone: six instead of two, which is a real per-person discount
 * ($11.67/seat against $17.00) and the same shape every household plan
 * uses. **`seats` is not enforced anywhere in code yet** — nothing counts
 * profiles or crew members against it — so it is currently a published
 * number rather than a limit. That was tolerable while Family also carried
 * exclusive features; now that it doesn't, enforcing `seats` is what keeps
 * the tier meaningful, and is the next thing to build here.
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
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthlyCents: 0,
    annualCents: 0,
    seats: 2,
    features: FREE_FEATURES,
    blurb: "Location sharing, check-ins, drink count, and SOS. Always free — safety basics are not a paywall.",
  },
  {
    id: "premium-basic",
    name: "Premium",
    monthlyCents: 1799,
    annualCents: 18388,
    seats: 2,
    features: BASIC_FEATURES,
    blurb: "Venue menus, detailed logging, intoxication estimates, the recovery plan, and a personal concierge for one bounded, capped-spend task at a time.",
  },
  {
    id: "premium-plus",
    name: "Premium Plus",
    monthlyCents: 3399,
    annualCents: 34688,
    seats: 2,
    features: PLUS_FEATURES,
    blurb: "Everything Safehubby does, with nothing held back for a higher tier: Safehubby books your ride and sends supplies itself, plus secure transport where it operates, the full pharmacy-run menu, safe routes, history, group games, extended emergency contacts, and a personal concierge.",
  },
  {
    id: "family",
    name: "Family",
    monthlyCents: 6999,
    annualCents: 71388,
    seats: 6,
    // Identical features to Premium Plus, by design — Family is the same
    // product for more people, not a longer feature list.
    features: PLUS_FEATURES,
    blurb: "The same everything as Premium Plus, for up to six people instead of two — one household, one bill, and a lower price per person.",
  },
  {
    id: "elite",
    name: "Elite",
    monthlyCents: 14900,
    annualCents: 149900,
    seats: 6,
    features: [...PLUS_FEATURES, ...ELITE_ONLY],
    blurb: "Everything in Family, plus a dedicated lifestyle manager and the luxury desk: jet travel, yacht charter, villa and property sourcing, full event production, premium hospitality, and access to a concierge doctor.",
  },
];

/**
 * Elite is built and held for a later release — `isEnabled("elite-tier")`
 * gates it out of the catalogue and out of `changePlan`, the same way party
 * supply ships dark (see features.ts). It is listed in `PLANS` rather than
 * kept in a branch so it stays compiled, typed and tested meanwhile.
 *
 * **Why $149/month.** Two researched numbers set it (docs/billing.md has the
 * rest): Quintessentially charges $12,000-$44,000/year, so the ceiling is
 * nowhere near binding — and the partner whose network the luxury desk
 * borrows, Amalfi Jets, sells its *own* membership at $99/month covering
 * jets, hotels, dining and ground transport. A member can always buy that
 * directly, so Elite cannot be priced as if it were the only door.
 *
 * It is priced against assembling the same thing yourself instead: Family at
 * $69.99 plus a $99 partner membership is $169/month, so $149 undercuts doing
 * it by hand, and the safety product is the half the partner does not have.
 *
 * Sustainable because the desk earns supplier-side rather than from the
 * membership — an 8% commission on one $50,000 charter is $4,000, nearly
 * three years of membership. What Elite is *not* is a retainer: $1,000-$5,000
 * a month buys a dedicated 10-40+ hours somewhere, and `lifestyle-manager`
 * is access to a desk, not a reserved block of anyone's month.
 */
export function isPlanReleased(id: PlanId): boolean {
  return id === "elite" ? isEnabled("elite-tier") : true;
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
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}
