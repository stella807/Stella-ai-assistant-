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
];

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
    name: "Premium Basic",
    monthlyCents: 599,
    annualCents: 6108,
    seats: 2,
    features: BASIC_FEATURES,
    blurb: "Detailed drink logging with venue menus, intoxication estimates, and the recovery plan.",
  },
  {
    id: "premium-plus",
    name: "Premium Plus",
    monthlyCents: 1099,
    annualCents: 11208,
    seats: 2,
    features: PLUS_FEATURES,
    blurb: "Everything, plus one-tap rides, supply delivery, safe routes, history, and group games.",
  },
  {
    id: "family",
    name: "Family",
    monthlyCents: 1799,
    annualCents: 18348,
    seats: 6,
    features: [...PLUS_FEATURES, "multi-profile", "extended-sos-contacts"],
    blurb: "Up to six people, extended emergency contacts, and group alerts.",
  },
];

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
