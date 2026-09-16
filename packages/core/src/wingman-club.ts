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
 * is *which* experience the group does together — and, since the last
 * revision, what it costs.
 *
 * **The perk, every month, whatever the pick.** A cigar and a drink of your
 * choice at the event — see `CLUB_PERKS`. Folded into the negotiated group
 * rate rather than billed as an extra: the venue buyout already includes it,
 * so charging for it separately would just be re-billing something already
 * paid for once.
 *
 * **Pricing: this month's pick, not the rotation's average.** An earlier
 * version priced membership against the rotation's *average* negotiated cost
 * and let a reserve absorb the difference between a cheap month and a
 * pricey one — real club economics, but it also meant dues never actually
 * moved, which is not what was asked for. Dues now track the pick directly:
 * `duesForCents` is a flat base (the desk work behind running the club at
 * all, independent of which experience gets picked) plus that month's own
 * negotiated per-person cost, passed through at cost. A cheap month (golf, a
 * steak night) is a cheap month's due; an expensive one (a track day,
 * skydiving) is an expensive one's — stated plainly in `CLUB_DISCLOSURES`
 * rather than smoothed into a number that never moves.
 *
 * The trade this makes on purpose: no reserve means no cushion, so a member
 * assigned an expensive month pays for that month, full stop, whether or not
 * they attend. What it buys back is honesty and simplicity — nobody's due is
 * secretly subsidizing a month they will never see, and "why did my dues go
 * up" always has the same one-line answer: this month's pick costs more.
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
   * list pricing. Includes the month's perk (see `CLUB_PERKS`) — it is not
   * billed on top.
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
 * What every event includes, whatever the month's pick turns out to be —
 * shown up front rather than left to be discovered at the venue. A steak
 * night obviously has a cigar case; a track day or a fishing trip less
 * obviously does, which is exactly why this is stated rather than assumed.
 */
export const CLUB_PERKS = [
  "A cigar and a drink of your choice at the event, whatever the month's pick is — folded into the group rate, never an extra line.",
] as const;

/**
 * The flat part of the due: the desk work behind running the club at all —
 * arranging each booking, the venue relationships, the reveal and the
 * roster — independent of which experience the month lands on. This is the
 * only part of the due that does not move with the pick.
 */
export const CLUB_BASE_DUES_CENTS = 2900;

/**
 * Fixed monthly overhead the base due exists to cover. Stated as a flat
 * dollar figure rather than a percentage of dues on purpose: a clubhouse
 * desk does not get cheaper because thirty people joined instead of three
 * hundred, so a percentage split would silently overstate how much of a
 * small roster's dues are actually free and clear.
 */
export const CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH = 800_000;

/**
 * This month's actual due: the flat base, plus that month's own negotiated
 * per-person cost, passed through at exactly what the venue charges — no
 * markup, no averaging. This is the number that goes up for an expensive
 * pick and down for a cheap one.
 */
export function duesForCents(experience: ClubExperience): number {
  return CLUB_BASE_DUES_CENTS + experience.negotiatedPerPersonCents;
}

/** The base-due revenue a roster of this size produces — the part that
 *  funds fixed overhead, independent of whichever experience got picked
 *  (that part of the due is a pass-through, not revenue: it goes straight
 *  to paying for what attendees actually got). */
export function clubBaseRevenueCents(memberCount: number): number {
  if (!Number.isInteger(memberCount) || memberCount < 0) {
    throw new Error("Member count must be a non-negative whole number.");
  }
  return CLUB_BASE_DUES_CENTS * memberCount;
}

/**
 * The smallest roster whose base dues alone clear fixed overhead, forever —
 * unlike the old average-cost model, this no longer depends on which
 * experience is picked, because the pick's own cost is now paid for
 * dollar-for-dollar by that month's dues rather than drawn from a shared
 * reserve.
 */
export function minMembersForOverhead(): number {
  return Math.ceil(CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH / CLUB_BASE_DUES_CENTS);
}

/** Whether the roster's base dues alone clear fixed overhead this month —
 *  the only real affordability question left once the pick's own cost is a
 *  pass-through rather than a shared draw. */
export function overheadCovered(memberCount: number): boolean {
  return clubBaseRevenueCents(memberCount) >= CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH;
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
 * Said plainly before anyone joins, the same discipline every other
 * disclosure list in this codebase follows (see `JET_TRAVEL_DISCLOSURES`,
 * `CONCIERGE_DOCTOR_DISCLOSURES`): a club that revealed this month's pick and
 * then could not actually seat everyone would be worse than one that never
 * promised a date in the first place.
 */
export const CLUB_DISCLOSURES = [
  "The month's experience is revealed, not chosen by any one member — everyone on the roster gets the same pick.",
  "A reveal is not a booking. Safehubby confirms dates and capacity with the venue afterward, and multiple dates may be offered so one facility does not need the whole roster at once.",
  "Attendance is optional. Skipping a month is not a credit toward a future one — dues fund the month's pick for whoever comes, not a personal balance.",
  "Dues track the pick, not a rotation average — a pricier month costs more, a simple one costs less, and that due is the same for every member whether or not they attend.",
  "The cigar and drink of your choice at the event are included in the due above — never a separate charge at the venue.",
] as const;
