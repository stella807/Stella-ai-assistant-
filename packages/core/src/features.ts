/**
 * Feature flags.
 *
 * Two jobs. One is ordinary release management: party supply is built and
 * tested but held for a later release, so it ships dark rather than being
 * deleted and rewritten.
 *
 * The other is honesty about what the third-party integrations can actually do
 * today, which is much less than the original plan assumed:
 *
 *  - Uber retired its public Ride Request API for third-party developers. What
 *    remains is a deep link that opens the Uber app with pickup and dropoff
 *    filled in. No in-app booking, no fare in our UI, no commission.
 *  - Lyft's public ride API is likewise closed to new consumer apps; same
 *    deep-link story.
 *  - DoorDash has no consumer ordering API. DoorDash Drive delivers *your own*
 *    goods if you are a merchant; it cannot place an order at someone else's
 *    restaurant on a user's behalf.
 *  - Walgreens has no public consumer ordering API either.
 *
 * So anything that claims to place an order is gated off until a real
 * partnership exists behind it. Showing a fare we invented, or a basket we
 * cannot actually buy, would be lying to the user in the one screen where they
 * are least able to check.
 */

export type FeatureFlag =
  | "paid-plans"
  | "elite-tier"
  | "elite-revenue-gate"
  | "paypal-payments"
  | "insurance-in-place"
  | "free-tier"
  | "free-errands"
  | "party-supply"
  | "ride-booking-api"
  | "food-ordering-api"
  | "pharmacy-ordering-api";

export interface FlagDefinition {
  id: FeatureFlag;
  enabled: boolean;
  /** Shown in the UI where a flag hides something a user might expect. */
  note: string;
}

export const FLAGS: FlagDefinition[] = [
  {
    // No processor collects a web subscription yet: POST /api/subscription
    // settles the card rail inline, so a paid plan chosen on the web would be
    // granted without anyone paying for it. Plans stay visible with their
    // prices; only joining one waits. The API also lifts this by itself once a
    // processor (Stripe or PayPal) is connected — see `paidPlansOpen`.
    id: "paid-plans",
    enabled: false,
    note: "Paid plans open as soon as payments are live. Check-ins, location sharing and SOS work in the meantime.",
  },
  {
    id: "elite-tier",
    enabled: true,
    note: "The Elite ladder is live. The desk reports per service rather than per plan: with no charter operator or physician practice configured, a request is taken and answered by a person instead of quoted automatically — the same honesty rule every other adapter here follows. The legal duties do not ride on this flag: Part 295 disclosures are attached to every jet quote, medical commission is zero and cannot be set otherwise, and the doctor disappears entirely when the assessment says call emergency services.",
  },
  {
    // Held Elite closed until trailing revenue covered 3× the spending
    // allowance for the first members. Off: Elite opens as soon as payments
    // are live, since each member's own dues fund their allowance. Turn back
    // on to hold the ladder again.
    id: "elite-revenue-gate",
    enabled: false,
    note: "Elite opens once revenue covers its spending allowance for our first members.",
  },
  {
    // PayPal is paused until the business has its EIN; Stripe takes cards
    // meanwhile. Off, PayPal reports itself not connected even with its keys
    // set, so no PayPal option is shown and nothing is charged through it.
    id: "paypal-payments",
    enabled: false,
    note: "PayPal is coming back soon. Pay with a credit or debit card in the meantime.",
  },
  {
    id: "insurance-in-place",
    enabled: false,
    note: "Liability insurance for the people we hire has not been bought yet, so the hiring pages do not promise it. Turn this on once a policy is bound.",
  },
  {
    id: "free-tier",
    enabled: false,
    note: "The Free plan is not being offered right now. Check-ins, location sharing and SOS still work on an account with no paid plan; the plans to choose from start with Premium.",
  },
  {
    id: "free-errands",
    enabled: false,
    note: "Errands on the Free plan are paused for now. Free still has check-ins, location sharing and SOS; errands start with Premium.",
  },
  {
    id: "party-supply",
    enabled: false,
    note: "Party supply is built and tested, and held for a later release.",
  },
  {
    id: "ride-booking-api",
    enabled: false,
    note: "Booking a ride inside Safehubby needs a ride-provider partnership. Until then we hand off to the Uber or Lyft app with your destination filled in.",
  },
  {
    id: "food-ordering-api",
    enabled: false,
    note: "Placing a delivery order needs a merchant agreement. Until then we hand off to the delivery app.",
  },
  {
    id: "pharmacy-ordering-api",
    enabled: false,
    note: "Sending supplies automatically needs a pharmacy or delivery partnership. Until then the run is a prepared basket you confirm in the store's own app.",
  },
];

const OVERRIDES = new Map<FeatureFlag, boolean>();

export function isEnabled(flag: FeatureFlag): boolean {
  const override = OVERRIDES.get(flag);
  if (override !== undefined) return override;
  return FLAGS.find((f) => f.id === flag)?.enabled ?? false;
}

/** Turned on per-deployment once the partnership behind it actually exists. */
export function setFlag(flag: FeatureFlag, enabled: boolean): void {
  OVERRIDES.set(flag, enabled);
}

export function resetFlags(): void {
  OVERRIDES.clear();
}

export function flagNote(flag: FeatureFlag): string {
  return FLAGS.find((f) => f.id === flag)?.note ?? "";
}

export function enabledFlags(): FeatureFlag[] {
  return FLAGS.map((f) => f.id).filter(isEnabled);
}
