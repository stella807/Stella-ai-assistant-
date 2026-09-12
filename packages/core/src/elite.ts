import type { Escalation } from "./emergency.ts";
import type { Feature } from "./billing.ts";
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
    description: "Access arranged to a licensed concierge physician practice — house calls, same-day appointments, and 24/7 reach.",
    feature: "concierge-doctor",
    // Zero on purpose. See MEDICAL_FEE_RULE.
    commissionRate: 0,
  },
];

/**
 * Why the concierge doctor pays Safehubby nothing.
 *
 * Taking a percentage of a physician's fee for sending them a patient is the
 * shape of a referral kickback, and it runs into the federal Anti-Kickback
 * Statute as well as state fee-splitting and corporate-practice-of-medicine
 * rules — which vary by state and are not something this codebase should
 * guess at. So the rate is zero and stays zero: Safehubby arranges access as
 * part of what the Elite membership already buys, the member pays the
 * practice its own retainer or visit fee directly, and no money flows from a
 * doctor to Safehubby for the introduction.
 *
 * This is also why a concierge doctor cannot be "included" in the
 * membership. Concierge medicine retainers run $1,500-$25,000 a year, and
 * commonly $2,000-$5,000 — more than Elite costs in total. Elite buys the
 * arranging, the vetting, and the coordination; it does not and cannot buy
 * the physician's retainer.
 */
export const MEDICAL_FEE_RULE =
  "Safehubby takes no commission on medical care and is never paid for a referral." as const;

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
  "You pay the practice directly, at its own rates. Safehubby takes no share of any medical fee.",
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
