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
