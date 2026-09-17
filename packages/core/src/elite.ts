import type { Escalation } from "./emergency.ts";
import type { Feature } from "./billing.ts";
import type { FlightInfo } from "./flight-tracking.ts";
import type { Iso8601 } from "./types.ts";

/**
 * The Elite luxury desk: jet travel, yacht charter, property sourcing, event
 * production, premium hospitality, and access to a concierge physician.
 *
 * **The money model is the reason this is a separate module.** A concierge
 * task (concierge.ts) rides a single-use card capped at exactly the
 * subscriber's spend cap — `CONCIERGE_MAX_CAP_CENTS`, $300. A jet charter is
 * $20,000-$100,000+ and a villa week is five figures. Safehubby cannot hold,
 * front, or capture those amounts, and pretending otherwise would mean either
 * a card it cannot fund or a hold no card would authorize.
 *
 * So Elite bookings never touch Safehubby's money at all. The member pays the
 * operator, the hotel, the physician's practice directly; Safehubby arranges
 * it and is paid a commission by the supplier. That is the model the system
 * can actually handle: no hold, no capture, no issued card, and nothing on
 * the member's Safehubby ledger for the supplier's price — see
 * `EliteBooking`, which deliberately has no `chargeId` or `holdId`.
 *
 * Commission rates are set from researched market norms (docs/billing.md
 * carries the sources) and undercut the typical broker, because the desk
 * makes its money on volume and on the membership rather than on the spread.
 * That alignment is the point: Safehubby is paid the same percentage whether
 * it finds a $60,000 charter or a $40,000 one, so hunting the better deal
 * costs it nothing.
 *
 * One caveat on those rates. The desk is brokered through a partner that
 * already holds the supplier relationships (`EliteDeskPort`), so when the
 * partner earns the supplier commission, Safehubby's share is whatever the
 * partner agreement says — not the number here. These rates describe what the
 * service is worth against the market; the split is contractual.
 */

export type EliteServiceId =
  | "jet-travel"
  | "yacht-charter"
  | "luxury-property"
  | "event-production"
  | "premium-hospitality"
  | "concierge-doctor";

export interface EliteService {
  id: EliteServiceId;
  label: string;
  description: string;
  /** The plan feature that unlocks it — all of these are `ELITE_ONLY`. */
  feature: Feature;
  /**
   * Safehubby's share of the supplier's price, paid by the supplier. Zero
   * means Safehubby takes no percentage at all, which is deliberate for
   * `concierge-doctor` — see `MEDICAL_FEE_RULE`.
   */
  commissionRate: number;
}

export const ELITE_SERVICES: EliteService[] = [
  {
    id: "jet-travel",
    label: "Jet travel",
    description: "A private charter arranged end to end, on the aircraft and operator that actually fit the trip.",
    feature: "private-aviation",
    // Charter brokers commonly take 10-15%, and up to 30%. Undercutting that
    // is the offer.
    commissionRate: 0.08,
  },
  {
    id: "yacht-charter",
    label: "Yacht charter",
    description: "A crewed charter for a week or an afternoon, with the itinerary and provisioning handled.",
    feature: "yacht-charter",
    commissionRate: 0.1,
  },
  {
    id: "luxury-property",
    label: "Villas and property",
    description: "A villa, chalet, or residence sourced and booked, including the ones that never reach a listing site.",
    feature: "luxury-property",
    commissionRate: 0.1,
  },
  {
    id: "event-production",
    label: "Event production",
    description: "A party or event produced in full — venue, catering, staffing, and the run of the night.",
    feature: "event-production",
    // Event planners charge 10-20% of the budget; this sits at the bottom of
    // that band.
    commissionRate: 0.1,
  },
  {
    id: "premium-hospitality",
    label: "Hotels and hospitality",
    description: "Suites, upgrades, and tables that aren't bookable publicly, at the rate the property gives advisors.",
    feature: "premium-hospitality",
    // Hotels pay advisors 5-10%, and consortium rates reach 20-25%.
    commissionRate: 0.1,
  },
  {
    id: "concierge-doctor",
    label: "Concierge doctor",
    description: "A licensed concierge physician practice, retainer included — house calls and at-home evaluation, same-day appointments, and 24/7 reach.",
    feature: "concierge-doctor",
    // Zero on purpose. See MEDICAL_FEE_RULE.
    commissionRate: 0,
  },
];

/**
 * The concierge-physician retainer Safehubby now pays on the member's
 * behalf, folded into every Elite rung's price rather than billed to the
 * member separately.
 *
 * Concierge-medicine retainers run $1,500-$25,000 a year, commonly
 * $2,000-$5,000 — this is the middle of that common range, not the top of
 * the full one, since Elite is buying access for a member who is otherwise
 * healthy, not a complex standing case. It is a real, ongoing cost against
 * Elite's revenue (the entry rung's $18,000/year clears it with room for
 * the desk and the hours behind it) and belongs here, priced and cited,
 * rather than left as an assumption behind "included."
 */
export const CONCIERGE_DOCTOR_RETAINER_ANNUAL_CENTS = 350_000;

/**
 * Why the concierge doctor still pays Safehubby nothing, even though
 * Safehubby now pays the doctor.
 *
 * Taking a percentage of a physician's fee for sending them a patient is the
 * shape of a referral kickback, and it runs into the federal Anti-Kickback
 * Statute as well as state fee-splitting and corporate-practice-of-medicine
 * rules — which vary by state and are not something this codebase should
 * guess at. That rule does not change just because the money now flows the
 * other way: Safehubby paying the practice's retainer *for* the member is
 * Safehubby spending its own revenue on a benefit, the same as covering any
 * other included service — it is not a cut of the physician's fee, because
 * there is no fee flowing back to Safehubby to take a cut of. The rate stays
 * zero and stays zero for that reason, not because the retainer is
 * unaffordable to cover: it is now covered, by `CONCIERGE_DOCTOR_RETAINER_ANNUAL_CENTS`
 * above, and no money still flows from the doctor to Safehubby for the
 * introduction.
 *
 * What does not change: Safehubby still arranges access and vets the
 * practice rather than employing or treating anyone directly — see the
 * physician and nurse `StaffRole` entries in staffing.ts for why direct
 * employment to *treat* members, instead of paying for their care and
 * advising the desk, is a different, unresolved question.
 */
export const MEDICAL_FEE_RULE =
  "Safehubby pays your concierge-physician retainer as part of your membership, and takes no commission on your medical care — never paid for a referral, either direction." as const;

/**
 * Shown before any jet booking. `14 CFR Part 295` requires an air charter
 * broker to disclose three things *before* a contract is entered into: which
 * carrier is actually operating the flight, the capacity the broker is
 * acting in, and how much liability insurance the broker carries — or that it
 * carries none. No licence or registry is required, but these are not
 * optional, and the operator's identity is not knowable until a specific
 * aircraft is quoted, which is why they belong on the quote rather than in a
 * signup flow.
 */
export const JET_TRAVEL_DISCLOSURES = [
  "Safehubby arranges charters as an agent; it is not an air carrier and does not operate aircraft.",
  "The certificated air carrier operating your flight is named on your quote before you agree to it.",
  "Safehubby's liability insurance for charter broking is disclosed on request, including if it carries none.",
  "You pay the operator directly. Safehubby is paid a disclosed commission by the operator, never a hidden markup on your fare.",
  "Landing, handling, and de-icing fees may be billed to you directly by third parties.",
];

/**
 * Shown before any concierge-doctor arrangement. The first line is the one
 * that matters: this app is used by people who are drunk, and an app that
 * offers a doctor as an alternative to an ambulance could get somebody
 * killed. See `doctorAvailableFor`.
 */
export const CONCIERGE_DOCTOR_DISCLOSURES = [
  "This is not emergency care. For anything life-threatening, call your local emergency number first — always.",
  "The physician is licensed and independent. Safehubby is not a medical provider, employs no clinicians, and gives no medical advice.",
  "Care is subject to the physician's own licensing: a doctor licensed in one state generally cannot treat you in another.",
  "Your retainer with the practice is paid by Safehubby, included in your membership — you are not billed for it separately.",
  "Anything beyond the retainer — a procedure, a test, medication — is still between you and the practice, at its own rates. Safehubby takes no share of any medical fee, from you or from the practice.",
  "What you tell the practice is between you and them. Safehubby passes on only what you ask it to.",
];

/**
 * Whether a concierge doctor may be offered at all, given what the app
 * currently believes about someone's state.
 *
 * Hard no while `assess` (emergency.ts) says call emergency services. A
 * red-flag night — suspected alcohol poisoning, a head injury — is exactly
 * when a member with money might reach for a private doctor instead of an
 * ambulance, and exactly when that choice is most likely to kill them. The
 * option disappears rather than being offered with a warning attached,
 * because a warning next to a button is still a button.
 */
export function doctorAvailableFor(escalation: Escalation): boolean {
  return escalation !== "call-emergency";
}

export function findEliteService(id: EliteServiceId): EliteService {
  const service = ELITE_SERVICES.find((s) => s.id === id);
  if (!service) throw new Error(`Unknown Elite service: ${id}`);
  return service;
}

/**
 * What the supplier pays Safehubby on a booking. Rounded down, so a rounding
 * cent never lands in Safehubby's favour against the supplier's quote.
 */
export function commissionCentsFor(id: EliteServiceId, supplierQuoteCents: number): number {
  if (!Number.isInteger(supplierQuoteCents) || supplierQuoteCents < 0) {
    throw new Error("A quote is a whole, non-negative number of cents.");
  }
  return Math.floor(supplierQuoteCents * findEliteService(id).commissionRate);
}

export type EliteBookingStatus = "requested" | "quoted" | "confirmed" | "declined" | "cancelled";

/**
 * A booking on the Elite desk.
 *
 * Note what is absent and must stay absent: no `chargeId`, no `holdId`, no
 * `card`. Safehubby never holds or captures the supplier's price, so none of
 * the pay-then-bill machinery in payment.ts applies here. `supplierQuoteCents`
 * is recorded for the member's own reference and to compute commission — it
 * is not an amount Safehubby ever charges.
 */
export interface EliteBooking {
  id: string;
  travelerId: string;
  serviceId: EliteServiceId;
  /** What the member asked for, in their own words. */
  brief: string;
  status: EliteBookingStatus;
  /** The supplier's price, once quoted. Paid by the member to the supplier. */
  supplierQuoteCents?: number;
  /** Safehubby's disclosed commission on that quote, paid by the supplier. */
  commissionCents?: number;
  /** The operating carrier, for jet travel — required by 14 CFR Part 295
   *  before the member agrees to anything. */
  operatorName?: string;
  /** Entered by the desk's own personal assistant once the flight is
   *  actually booked with the operator or airline — see
   *  `buildManualFlightInfo` in flight-tracking.ts. A charter has no public
   *  schedule to look up, so this is the assistant's own account of the
   *  booking, not a third-party feed; it is what the member's flight
   *  dashboard renders via `FlightCard`, the same component an airport
   *  pickup's looked-up flight uses. */
  flight?: FlightInfo;
  createdAt: Iso8601;
  quotedAt?: Iso8601;
  confirmedAt?: Iso8601;
}

export const MAX_ELITE_BRIEF_LENGTH = 1000;

export function validateEliteRequest(input: { serviceId: EliteServiceId; brief: string }): void {
  findEliteService(input.serviceId);
  if (!input.brief.trim()) throw new Error("Say what you need so the desk can work on it.");
  if (input.brief.length > MAX_ELITE_BRIEF_LENGTH) {
    throw new Error(`Keep the brief under ${MAX_ELITE_BRIEF_LENGTH} characters.`);
  }
}

export function disclosuresFor(id: EliteServiceId): string[] {
  if (id === "jet-travel") return JET_TRAVEL_DISCLOSURES;
  if (id === "concierge-doctor") return CONCIERGE_DOCTOR_DISCLOSURES;
  return [];
}

/* ---------------------------------------------------------------------------
   Whether the Elite desk pays for itself
   ------------------------------------------------------------------------ */

/**
 * The partner membership Safehubby carries so Elite can exist at all.
 *
 * Elite piggybacks on an established luxury-travel desk rather than building
 * supplier relationships from nothing — Amalfi's Reserve membership is the
 * intended first one (see `adapters/elite-desk.ts`, which stays
 * provider-agnostic). **Safehubby holds one house membership and brokers on
 * it**; members do not each buy their own. That is the only structure in
 * which Elite's own dues are a real price rather than a loss — one shared
 * membership behind however many Elite members there are, not one bought
 * per member — and it is the assumption every number below rests on.
 *
 * It is also a contract term, not a technical choice. Brokering on a house
 * membership has to be permitted by the partner agreement, and the air-charter
 * side carries its own law on top (`JET_TRAVEL_DISCLOSURES`, 14 CFR Part 295).
 * If a partner forbids it, this whole tier is repriced, not tweaked.
 */
export const ELITE_DESK_MEMBERSHIP = {
  name: "Partner luxury-travel desk membership",
  /** One-off, on joining. */
  initiationCents: 250_000,
  monthlyCents: 50_000,
} as const;

/** What the house membership costs over a year, initiation included in the
 *  first one. */
export function eliteDeskAnnualCostCents(firstYear = true): number {
  return ELITE_DESK_MEMBERSHIP.monthlyCents * 12
    + (firstYear ? ELITE_DESK_MEMBERSHIP.initiationCents : 0);
}

/**
 * How many Elite members it takes for their dues alone to cover the house
 * membership — before a single booking earns commission.
 *
 * Rounded up, because four-and-a-bit members is five members. The point of
 * having it as a number is `eliteDeskIsViable` below: the tier should not buy
 * a membership it cannot yet carry.
 */
export function eliteBreakEvenMembers(monthlyDuesCents: number, firstYear = true): number {
  if (monthlyDuesCents <= 0) throw new Error("Elite dues must be a positive amount.");
  return Math.ceil(eliteDeskAnnualCostCents(firstYear) / (monthlyDuesCents * 12));
}

/**
 * Whether to carry the membership yet.
 *
 * The operational rule this exists to state: **do not buy the house
 * membership until enough members are signed to pay for it.** Elite is held
 * behind the `elite-tier` flag precisely so it can be sold before it is
 * staffed, and a desk bought for two members is the most expensive way to
 * discover that.
 */
export function eliteDeskIsViable(memberCount: number, monthlyDuesCents: number): boolean {
  return memberCount >= eliteBreakEvenMembers(monthlyDuesCents);
}

/**
 * The annual charter spend at which joining the partner desk directly becomes
 * cheaper than going through Elite.
 *
 * Worth computing rather than avoiding. Elite costs dues plus commission on
 * what you book; a direct membership costs the partner's own dues and no
 * commission. Below the crossover Elite is genuinely the cheaper way in;
 * above it, a heavy flyer is better off joining directly, and the honest
 * thing is to say so rather than sell them a membership that costs them more.
 *
 * `directAnnualCents` defaults to the steady-state cost of the partner
 * membership — no initiation, since a heavy flyer comparing year two is the
 * one this matters to.
 */
export function directMembershipCrossoverCents(
  monthlyDuesCents: number,
  commissionRate: number,
  directAnnualCents = ELITE_DESK_MEMBERSHIP.monthlyCents * 12,
): number | null {
  if (commissionRate <= 0) throw new Error("A crossover needs a commission to trade off against.");
  const eliteDues = monthlyDuesCents * 12;
  // Null, not zero. Once the dues meet the direct membership on their own,
  // there is no spend below which Elite is the cheaper door — it is dearer
  // from the first dollar of charter. Clamping that to 0 read like a
  // threshold a member could sit under, which is the opposite of the truth,
  // and it is the honest signal that this rung is not sold on jet access:
  // what a member is buying at these dues is the hours and the safety
  // product, with the desk riding along.
  if (eliteDues >= directAnnualCents) return null;
  // dues + rate * spend = direct  =>  spend = (direct - dues) / rate
  return Math.round((directAnnualCents - eliteDues) / commissionRate);
}

/* ---------------------------------------------------------------------------
   Elite member events — invitations, not a booking
   ------------------------------------------------------------------------ */

/**
 * A short calendar of events for every Elite member, not just the top rung —
 * distinct from the Wingman Club's monthly reveal (wingman-club.ts), which
 * Elite now gets automatically included but which is its own product with
 * its own mechanic (one pick a month, dues that move with it). These are
 * hosted by Safehubby itself, capacity-limited, and free to RSVP to — the
 * cost of running them lives in the desk's own overhead the same way the
 * concierge-physician retainer does, not as a per-event charge to whoever
 * shows up.
 */
export interface EliteEvent {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** Where it happens — real cities, not "TBA," so a member can tell before
   *  RSVPing whether it is one they could actually get to. */
  city: string;
  /** ISO date. Single day; a multi-day one still gets one entry, with the
   *  date its start. */
  date: Iso8601;
  /** Seats for the whole Elite roster, not per member — a real ceiling this
   *  catalogue enforces rather than promising a seat to everyone who asks. */
  capacity: number;
}

export const ELITE_EVENTS: EliteEvent[] = [
  {
    id: "owners-dinner-miami",
    label: "Owners' dinner",
    emoji: "🍷",
    description: "A seated dinner with Safehubby's founding team and a small group of other Elite members.",
    city: "Miami",
    date: "2026-11-14",
    capacity: 24,
  },
  {
    id: "new-years-yacht-san-juan",
    label: "New Year's yacht night",
    emoji: "🎆",
    description: "A chartered yacht for the countdown, crewed and provisioned — nothing to arrange yourself.",
    city: "San Juan",
    date: "2026-12-31",
    capacity: 30,
  },
  {
    id: "grand-prix-suite-austin",
    label: "Grand Prix suite",
    emoji: "🏁",
    description: "A private suite for race weekend, catered, with paddock passes for the group.",
    city: "Austin",
    date: "2027-10-24",
    capacity: 16,
  },
];

export function findEliteEvent(id: string): EliteEvent {
  const found = ELITE_EVENTS.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown Elite event: ${id}`);
  return found;
}

/** Everything not already past, soonest first — the only ordering an
 *  invitation list should ever need. */
export function upcomingEliteEvents(now: Date): EliteEvent[] {
  return ELITE_EVENTS
    .filter((e) => new Date(e.date).getTime() >= now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Whether the event still has a seat for one more RSVP. */
export function eliteEventHasRoom(event: EliteEvent, rsvpCount: number): boolean {
  return rsvpCount < event.capacity;
}
