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
  | "extended-sos-contacts";

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
 * The paid tiers went up when fulfilment became automatic, and the reason is
 * arithmetic rather than positioning: booking a ride on someone's behalf means
 * Safehubby pays the provider first and bills the user after. That is float,
 * chargeback exposure, and a support cost on every trip that goes wrong —
 * none of which existed when the app only opened a deep link.
 *
 * Ride and delivery costs are passed through at the provider's price on top of
 * the subscription. Bundling them would mean either capping how often someone
 * can get home safely, or pricing for the heaviest user and overcharging
 * everyone else. Neither is a good look on a safety product.
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
    monthlyCents: 1499,
    annualCents: 15288,
    seats: 2,
    features: BASIC_FEATURES,
    blurb: "Venue menus, detailed logging, intoxication estimates, and the recovery plan.",
  },
  {
    id: "premium-plus",
    name: "Premium Plus",
    monthlyCents: 2999,
    annualCents: 30588,
    seats: 2,
    features: PLUS_FEATURES,
    blurb: "Safehubby books your ride and sends supplies itself — no hand-off, no app-switching. Plus safe routes, history and group games. Rides and deliveries billed at cost.",
  },
  {
    id: "family",
    name: "Family",
    monthlyCents: 4999,
    annualCents: 50988,
    seats: 6,
    features: [...PLUS_FEATURES, "multi-profile", "extended-sos-contacts", "secure-transport"],
    blurb: "Up to six people, extended emergency contacts, group alerts, and access to secure transport where it operates.",
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
