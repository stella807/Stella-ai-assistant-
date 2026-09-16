/**
 * The Wingman Club: one membership, one negotiated group experience a month.
 *
 * **On the name.** This was proposed as "Abused Husbands Club" — jokey
 * marketing copy stacked on top of a real thing (men who experience
 * relationship abuse) that a name should not be making light of, whatever the
 * intent. Real male victims of relationship abuse exist and are already
 * underserved by resources built around the assumption that victims are
 * women; a feature literally named after their situation, selling a
 * "brotherhood" and a monthly track day, does that population no favors and
 * exposes the product to exactly the reaction that reads its jokes as
 * indifferent to it. So this ships as the Wingman Club instead — same
 * mechanic, same audience, a name that does not require anyone to laugh at
 * abuse to buy in. The actual desk features the pitch wanted (remembering an
 * anniversary, drafting an apology text, booking flowers) are not
 * reimplemented here: they are what `desk-tasks.ts` already does, generically,
 * for anyone with a paid plan.
 *
 * **The mechanic.** Everyone pays one membership. Once a month the club's
 * pick is revealed — the same experience for everyone that month, not a
 * chance at getting one while others get nothing. What varies month to month
 * is *which* experience the group does together, not *whether* any member
 * gets to.
 *
 * **The economics, stated rather than assumed.** A negotiated group rate
 * beats retail — Safehubby is buying out a facility for the roster, not
 * paying per head at the door — but even at the negotiated rate a single
 * month's dues from one member rarely covers that same member's seat at a
 * pricier experience (a track day negotiated at $240/head does not fit
 * inside one $159 due). The honest fix is the one real club economics
 * actually use: price membership against the *average* cost across the whole
 * rotation, not against whatever the wheel lands on this month. A cheap month
 * (golf, a steak night) builds reserve; an expensive one (a track day,
 * skydiving) draws it down. `minMembersForAverageExperience` is the number
 * that makes that arithmetic work at all — below it, dues cannot cover the
 * rotation's own average no matter how long the club waits.
 */

export interface ClubExperience {
  id: string;
  label: string;
  emoji: string;
  /** What one person would pay booking this alone, at the venue's own list
   *  price. */
  retailPerPersonCents: number;
  /**
   * What the group actually pays per head once Safehubby negotiates a block
   * rate for the whole roster instead of paying at the door — the discount a
   * hundred-plus people booking together can actually extract, not a number
   * invented for the pitch. Roughly 60-65% of retail across this catalog,
   * which is the range a facility buyout genuinely clears versus per-head
   * list pricing.
   */
  negotiatedPerPersonCents: number;
}

export const CLUB_EXPERIENCES: ClubExperience[] = [
  { id: "track-day", label: "Private track day", emoji: "🏎️", retailPerPersonCents: 40000, negotiatedPerPersonCents: 24000 },
  { id: "skydiving", label: "Skydiving", emoji: "🪂", retailPerPersonCents: 30000, negotiatedPerPersonCents: 19500 },
  { id: "boat-day", label: "Boat day", emoji: "🛥️", retailPerPersonCents: 20000, negotiatedPerPersonCents: 13000 },
  { id: "steak-cigar-night", label: "Steak & cigar night", emoji: "🥩", retailPerPersonCents: 15000, negotiatedPerPersonCents: 9500 },
  { id: "motorcycle-tour", label: "Motorcycle tour", emoji: "🏍️", retailPerPersonCents: 22000, negotiatedPerPersonCents: 14000 },
  { id: "deep-sea-fishing", label: "Deep-sea fishing", emoji: "🎣", retailPerPersonCents: 25000, negotiatedPerPersonCents: 16000 },
  { id: "golf", label: "Golf outing", emoji: "🏌️", retailPerPersonCents: 12000, negotiatedPerPersonCents: 8000 },
  { id: "off-road-day", label: "Off-road day", emoji: "🚙", retailPerPersonCents: 28000, negotiatedPerPersonCents: 18000 },
];

export function findClubExperience(id: string): ClubExperience {
  const found = CLUB_EXPERIENCES.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown club experience: ${id}`);
  return found;
}

/**
 * Membership dues. Priced above the rotation's own average negotiated cost
 * ($152.50 — see the test that pins this against the live catalog rather
 * than a number typed once and left to drift) so that, at real scale, dues
 * can actually fund the average month once fixed overhead is paid — see
 * `minMembersForAverageExperience`.
 */
export const CLUB_MONTHLY_CENTS = 15900;

/**
 * Fixed monthly overhead behind the club — the desk support arranging each
 * booking, the venue-relationship work, and the tech running the reveal and
 * the roster. Stated as a flat dollar figure rather than a percentage of
 * dues on purpose: a clubhouse desk does not get cheaper because thirty
 * people joined instead of three hundred, so a percentage split would
 * silently overstate how much is left for the actual experience at small
 * membership counts.
 */
export const CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH = 800_000;

export function clubMonthlyRevenueCents(memberCount: number): number {
  if (!Number.isInteger(memberCount) || memberCount < 0) {
    throw new Error("Member count must be a non-negative whole number.");
  }
  return CLUB_MONTHLY_CENTS * memberCount;
}

/** What is left for the actual experience once fixed overhead is paid.
 *  Never negative — a club too small to clear overhead simply has nothing
 *  left over that month, not a deficit charged back to members. */
export function clubEventBudgetCents(memberCount: number): number {
  return Math.max(0, clubMonthlyRevenueCents(memberCount) - CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH);
}

/** The event budget, spread across the roster. This is the number that
 *  answers "can we actually afford this month's pick" — total budget divided
 *  by total attendees is the same thing as budget-per-head, whichever way
 *  you check it. */
export function perMemberEventBudgetCents(memberCount: number): number {
  if (memberCount <= 0) return 0;
  return Math.floor(clubEventBudgetCents(memberCount) / memberCount);
}

/** Whether the roster, at its current size, can fund this month's specific
 *  pick — not the rotation's average, the actual experience on the wheel. */
export function canAffordExperience(experience: ClubExperience, memberCount: number): boolean {
  return perMemberEventBudgetCents(memberCount) >= experience.negotiatedPerPersonCents;
}

/** The rotation's own average negotiated cost — what membership dues are
 *  actually priced against, not any single experience. */
export function averageExperienceCostCents(catalog: readonly ClubExperience[] = CLUB_EXPERIENCES): number {
  if (catalog.length === 0) throw new Error("The rotation needs at least one experience to average.");
  const total = catalog.reduce((sum, e) => sum + e.negotiatedPerPersonCents, 0);
  return Math.round(total / catalog.length);
}

/**
 * The smallest roster that can fund the rotation's average month, forever,
 * once overhead is paid.
 *
 * Solved directly rather than searched for: `perMemberEventBudgetCents(n)`
 * is `CLUB_MONTHLY_CENTS - overhead/n`, so it clears `avgCost` exactly at
 * `n = overhead / (dues - avgCost)`. If dues do not even exceed the average
 * cost, no roster size ever fixes that — overhead only gets harder to clear
 * as a *smaller* share of a too-thin margin, never easier — and this says so
 * rather than returning a number that looks like an answer.
 */
export function minMembersForAverageExperience(
  catalog: readonly ClubExperience[] = CLUB_EXPERIENCES,
): number {
  const avgCost = averageExperienceCostCents(catalog);
  const margin = CLUB_MONTHLY_CENTS - avgCost;
  if (margin <= 0) {
    throw new Error(
      `Dues (${CLUB_MONTHLY_CENTS}c) do not clear the rotation's average cost (${avgCost}c) even before overhead — no roster size fixes that; raise dues or cut the average.`,
    );
  }
  return Math.ceil(CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH / margin);
}

/**
 * This month's key, as a stable string ("2026-09") rather than a number, so
 * the hash below reads as "September 2026 landed on X" and not an opaque
 * index. UTC because a club with one reveal a month should not disagree with
 * itself across time zones about which month it currently is.
 */
export function clubMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A small stable hash — deterministic, not cryptographic. The month string
 *  is the only seed this needs: there is no spin to store anywhere, so two
 *  members checking the app on different days of the same month, or the
 *  server restarting between them, can never disagree about the reveal. */
function stableHash(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** This month's revealed experience. Same input, same output, always — the
 *  "spin" is presentation on top of this, not a second source of truth. */
export function pickMonthlyExperience(
  now: Date, catalog: readonly ClubExperience[] = CLUB_EXPERIENCES,
): ClubExperience {
  if (catalog.length === 0) throw new Error("The rotation needs at least one experience to draw from.");
  const index = stableHash(clubMonthKey(now)) % catalog.length;
  return catalog[index]!;
}

/**
 * What this month's pick actually does to the reserve, for a roster of this
 * size — positive banks money toward a pricier month later, negative draws
 * down what earlier cheap months banked. Stated per member and for the whole
 * roster, since "the club" experiences it as a whole even though dues are
 * paid one member at a time.
 */
export function reserveDeltaCents(
  experience: ClubExperience, memberCount: number,
): { perMemberCents: number; totalCents: number } {
  const perMemberCents = perMemberEventBudgetCents(memberCount) - experience.negotiatedPerPersonCents;
  return { perMemberCents, totalCents: perMemberCents * memberCount };
}

/**
 * Said plainly before anyone joins, the same discipline every other
 * disclosure list in this codebase follows (see `JET_TRAVEL_DISCLOSURES`,
 * `CONCIERGE_DOCTOR_DISCLOSURES`): a club that revealed this month's pick and
 * then could not actually seat everyone would be worse than one that never
 * promised a date in the first place.
 */
export const CLUB_DISCLOSURES = [
  "The month's experience is revealed, not chosen by any one member — everyone on the roster gets the same pick.",
  "A reveal is not a booking. Safehubby confirms dates and capacity with the venue afterward, and multiple dates may be offered so one facility does not need the whole roster at once.",
  "Attendance is optional. Skipping a month is not a credit toward a future one — dues fund the rotation as a whole, not a personal balance.",
  "Membership dues are priced against the rotation's average cost, not any single month — an expensive month is not itself a sign anything is wrong.",
] as const;
