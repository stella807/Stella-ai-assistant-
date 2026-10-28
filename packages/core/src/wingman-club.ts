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
 * **Pricing: a flat $99 with an event inside it.** See `CLUB_MONTHLY_DUES_CENTS`.
 * Dues used to be a $39 base plus the month's outing passed through at cost,
 * which swung between $99 and $279 and was the kind of number people stop
 * looking at. Now the dues are the same every month, and what moves is only
 * what a member adds to go on one of the four bigger days a year.
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
  { id: "track-day", label: "Private event day", emoji: "🏎️", retailPerPersonCents: 40000, negotiatedPerPersonCents: 24000 },
  { id: "skydiving", label: "Skydiving", emoji: "🪂", retailPerPersonCents: 30000, negotiatedPerPersonCents: 19500 },
  { id: "boat-day", label: "Boat day", emoji: "🛥️", retailPerPersonCents: 20000, negotiatedPerPersonCents: 13000 },
  { id: "steak-cigar-night", label: "Steak & cigar night", emoji: "🥩", retailPerPersonCents: 15000, negotiatedPerPersonCents: 9500 },
  { id: "cigar-night", label: "Cigar night", emoji: "🚬", retailPerPersonCents: 9500, negotiatedPerPersonCents: 6000 },
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
 * What a member pays every month: a flat $99, the same whatever the month's
 * outing is. At ownership's direction, after modelling four structures against
 * what comparable clubs charge ($25-$150 a month for lounge access): a flat
 * price with a real event inside it is easier to say yes to than a due that
 * swings between $99 and $279.
 *
 * Three months in four the outing is a light one — a cigar night, a golf
 * outing or a steak night — and it is included. The other four months a year
 * (`CLUB_PREMIUM_MONTHS`) it is a bigger day. The $99 then carries a credit
 * toward it (`CLUB_PREMIUM_CREDIT_CENTS`), and only a member who signs up to
 * go pays the rest, at the club's price plus `CLUB_PREMIUM_MARKUP`. Nobody pays
 * for a skydive they skipped.
 */
export const CLUB_MONTHLY_DUES_CENTS = 9900;

/** The id the club's Stripe subscription carries in its metadata, in the place a plan id goes. */
export const CLUB_PLAN_ID = "wingman-club";

/** A member's Wingman Club subscription, billed monthly through Stripe apart from their plan. */
export interface ClubSubscription {
  travelerId: string;
  stripeSubscriptionId: string;
  /** Past-due keeps membership on while Stripe retries the card; canceled ends it. */
  status: "active" | "past-due" | "canceled";
  startedAt: string;
  currentPeriodEnd: string;
  canceledAt?: string;
}

/**
 * A member's yes to this month's outing. For a light outing it costs nothing;
 * for a bigger day the extra (`eventExtraCents`) is charged to their saved
 * card when they sign up, and refunded in full if they cancel before the club
 * locks the day, or if the club cancels it.
 */
export interface ClubRsvp {
  id: string;
  travelerId: string;
  /** "2026-12": the month of the outing, from `clubMonthKey`. */
  monthKey: string;
  experienceId: string;
  /** What was charged for going; 0 when the outing is included. */
  extraCents: number;
  status: "going" | "canceled";
  /** The Stripe payment, kept so it can be refunded. */
  processorRef?: string;
  chargeId?: string;
  createdAt: string;
  canceledAt?: string;
  refunded?: boolean;
}

/** The month's outing once the club has locked it in: no more automatic refunds, or called off. */
export interface ClubMonthState { lockedAt?: string; canceledAt?: string }

/** An outing is included in the monthly dues when it costs the club no more than this a head. */
export const CLUB_INCLUDED_EVENT_MAX_CENTS = 10_000;

/** What the monthly dues put toward a bigger day: about what a light outing costs. */
export const CLUB_PREMIUM_CREDIT_CENTS = 7800;

/** What the club adds to a bigger day's price, for the planning and the risk of a group booking. */
export const CLUB_PREMIUM_MARKUP = 0.15;

/** Calendar months (1-12, UTC) when the pick is a bigger day: once a quarter. */
export const CLUB_PREMIUM_MONTHS: readonly number[] = [3, 6, 9, 12];

/** Whether the monthly dues already cover this outing. */
export const isIncludedEvent = (e: ClubExperience): boolean => e.negotiatedPerPersonCents <= CLUB_INCLUDED_EVENT_MAX_CENTS;

/**
 * What a member who goes pays on top of the monthly dues, in cents. Zero for a
 * light outing the group rate covers. Below `CLUB_GROUP_RATE_MIN_MEMBERS` the
 * venue's regular price applies, so a light outing that costs more than the
 * included amount carries a small extra until the club reaches that size.
 */
export function eventExtraCents(experience: ClubExperience, memberCount: number = 1): number {
  const unit = memberCount >= CLUB_GROUP_RATE_MIN_MEMBERS
    ? experience.negotiatedPerPersonCents
    : experience.retailPerPersonCents;
  if (isIncludedEvent(experience)) return Math.max(0, unit - CLUB_INCLUDED_EVENT_MAX_CENTS);
  return Math.max(0, Math.round(unit * (1 + CLUB_PREMIUM_MARKUP)) - CLUB_PREMIUM_CREDIT_CENTS);
}

/** The most this month can cost a member who goes: the monthly dues plus any extra for the outing. */
export function duesForCents(experience: ClubExperience, memberCount: number = 1): number {
  return CLUB_MONTHLY_DUES_CENTS + eventExtraCents(experience, memberCount);
}

/**
 * What each member leaves with after the card fee and the events they attend,
 * from the pricing model (attendance 50% for light outings and 25% for bigger
 * days, the card fee 3.49% + 49 cents). An estimate to size the roster against
 * overhead, not a promise: it moves with attendance and with how venues bill.
 */
export const CLUB_CONTRIBUTION_PER_MEMBER_CENTS = 6200;

/**
 * Fixed monthly overhead the roster's contribution exists to cover. Stated as a flat
 * dollar figure rather than a percentage of dues on purpose: a clubhouse
 * desk does not get cheaper because thirty people joined instead of three
 * hundred, so a percentage split would silently overstate how much of a
 * small roster's dues are actually free and clear.
 */
export const CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH = 800_000;

/**
 * How many members it takes before a venue will quote the group rate.
 *
 * The negotiated per-person rates only exist because a whole roster books
 * together. One member alone — which is where the club starts — is a single
 * booking at the venue's own list price, so charging them the group rate
 * would leave the club paying the difference out of its own pocket on the
 * very first experience. Below this size, dues are built on the retail price,
 * which covers the first event even with a single member; from here up they
 * drop to the group rate, and members are told that up front
 * (`CLUB_DISCLOSURES`).
 */
export const CLUB_GROUP_RATE_MIN_MEMBERS = 10;

/** What a roster of this size contributes toward fixed overhead each month,
 *  after the events its members attend and the card fees (see
 *  `CLUB_CONTRIBUTION_PER_MEMBER_CENTS`). */
export function clubBaseRevenueCents(memberCount: number): number {
  if (!Number.isInteger(memberCount) || memberCount < 0) {
    throw new Error("Member count must be a non-negative whole number.");
  }
  return CLUB_CONTRIBUTION_PER_MEMBER_CENTS * memberCount;
}

/** The smallest roster whose contribution clears fixed overhead. */
export function minMembersForOverhead(): number {
  return Math.ceil(CLUB_FIXED_OVERHEAD_CENTS_PER_MONTH / CLUB_CONTRIBUTION_PER_MEMBER_CENTS);
}

/** Whether the roster's contribution clears fixed overhead this month. */
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
  // Light outings most months, a bigger day once a quarter. If the catalogue
  // has none of the kind the month calls for, it draws from all of it.
  const bigMonth = CLUB_PREMIUM_MONTHS.includes(now.getUTCMonth() + 1);
  const pool = catalog.filter((e) => isIncludedEvent(e) !== bigMonth);
  const from = pool.length > 0 ? pool : catalog;
  return from[stableHash(clubMonthKey(now)) % from.length]!;
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
  "The monthly fee is a flat $99. Three months in four the outing — a cigar night, a golf outing or a steak night — is included in it.",
  "Four months a year (March, June, September and December) the outing is a bigger day, such as a boat day, deep-sea fishing, a motorcycle tour, an off-road day, skydiving or a private event day. Your $99 carries a $78 credit toward it, and you pay the rest only if you sign up to go. Skip it and you owe nothing more.",
  "Venues only give a group rate to a group. Until the club has 10 members, outings are priced at the venue's regular price, so a few outings may carry a small extra charge until then; once it reaches 10 they drop to the group rate.",
  "The cigar and drink of your choice at the event are included in the price above — never a separate charge at the venue.",
] as const;
