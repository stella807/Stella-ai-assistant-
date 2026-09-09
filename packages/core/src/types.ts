/**
 * Domain types for Safehubby.
 *
 * Vocabulary note: the product is marketed around couples, but the domain is
 * deliberately role-based ("traveler" = the person out, "guardian" = the person
 * watching). Nothing here assumes gender or marriage, which keeps the same
 * engine usable for friends, parents, and roommates.
 */

export type Iso8601 = string;
export type TravelerId = string;
export type GuardianId = string;
export type NightId = string;

/** Alcohol is tracked in grams of ethanol; 1 US standard drink = 14g. */
export const GRAMS_PER_STANDARD_DRINK = 14;

export type DrinkCategory =
  | "beer"
  | "wine"
  | "cocktail"
  | "spirit"
  | "seltzer"
  | "shot"
  | "non-alcoholic";

export interface DrinkDefinition {
  id: string;
  name: string;
  category: DrinkCategory;
  /** Typical serving size in fluid ounces. */
  servingOz: number;
  /** Alcohol by volume, 0..1. */
  abv: number;
  /** Rough calories per serving, for awareness only. */
  calories: number;
}

export interface LoggedDrink {
  id: string;
  drinkId: string;
  /** Denormalized so a log entry stays readable if a catalog entry changes. */
  name: string;
  category: DrinkCategory;
  servings: number;
  standardDrinks: number;
  calories: number;
  loggedAt: Iso8601;
  venueId?: string;
  venueName?: string;
}

export interface BodyProfile {
  /** Kilograms. */
  weightKg: number;
  /**
   * Widmark distribution ratio (body-water constant). Varies with body
   * composition; we expose it directly instead of inferring it from gender so
   * users can tune it and so the model stays honest about being a rough fit.
   */
  widmarkRatio: number;
}

export type CheckInStatus = "pending" | "answered" | "missed";

export interface CheckIn {
  id: string;
  dueAt: Iso8601;
  status: CheckInStatus;
  answeredAt?: Iso8601;
  /** Drinks reported at this check-in, for the timeline. */
  reportedDrinkIds: string[];
  feelingRating?: 1 | 2 | 3 | 4 | 5;
}

export interface LocationPing {
  lat: number;
  lng: number;
  accuracyMeters: number;
  at: Iso8601;
  venueName?: string;
}

export type NightStatus = "active" | "heading-home" | "home-safe" | "ended";

export interface NightOut {
  id: NightId;
  travelerId: TravelerId;
  startedAt: Iso8601;
  endedAt?: Iso8601;
  status: NightStatus;
  body: BodyProfile;
  drinks: LoggedDrink[];
  checkIns: CheckIn[];
  pings: LocationPing[];
  /** Highest drink count the guardian agreed to before being alerted. */
  drinkLimit: number;
  homeAddressLabel?: string;
}

export type AlertKind =
  | "missed-check-in"
  | "drink-limit-reached"
  | "fast-pace"
  | "sos"
  | "heading-home"
  | "home-safe"
  | "sharing-stopped";

export type AlertSeverity = "info" | "warn" | "urgent";

export interface Alert {
  id: string;
  nightId: NightId;
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
  raisedAt: Iso8601;
  /** Suggested next steps the guardian can act on with one tap. */
  actions: AlertAction[];
}

export type AlertAction =
  | { type: "book-ride"; label: string }
  | { type: "call"; label: string }
  | { type: "message"; label: string }
  | { type: "send-supplies"; label: string }
  | { type: "acknowledge"; label: string };
