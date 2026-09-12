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

export type PlanId = "free" | "premium-basic" | "premium-plus" | "family";

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
  | "personal-concierge";

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

const PLUS_FEATURES: Feature[] = [
  ...BASIC_FEATURES,
  "ride-booking",
  "supply-delivery",
  "safe-routes",
  "history-analytics",
  "group-games",
  // Automatic fulfilment: Safehubby books and pays on the user's behalf
  // through the business APIs, then bills it on. That float is the reason
  // these tiers cost what they do.
  "automatic-rides",
  "automatic-delivery",
];

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
 * costs real money every month whether or not a given Family subscriber ever
 * books a secure-transport trip. Spreading that fixed cost, plus an actual
 * profit margin instead of pricing at cost, across the paid tiers is why
 * Premium and Premium Plus went back up too, not just Family.
 *
 * Family went up again on top of that, for a second reason: the wider
 * pharmacy-run menu behind `extended-menu` (see care-package.ts) is more real
 * food, sourced and priced like actual takeout rather than a snack basket,
 * and it costs Safehubby more per basket to offer. It stays a Family-only
 * perk rather than something every tier absorbs the cost of, and pricing it
 * in is what keeps the wider menu a margin-positive feature instead of one
 * that quietly eats the plan's profit.
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
    blurb: "Safehubby books your ride and sends supplies itself — no hand-off, no app-switching. Plus safe routes, history, group games, and a personal concierge. Add a card once; rides and deliveries are held then billed at cost, never fronted.",
  },
  {
    id: "family",
    name: "Family",
    monthlyCents: 6999,
    annualCents: 71388,
    seats: 6,
    features: [
      ...PLUS_FEATURES, "multi-profile", "extended-sos-contacts", "secure-transport", "extended-menu",
    ],
    blurb: "Up to six people, extended emergency contacts, secure transport where it operates, and the full pharmacy-run menu — real meals from different cuisines, not just a snack basket.",
  },
];

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
