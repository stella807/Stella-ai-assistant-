import type { Db } from "./store.ts";

/**
 * Account export and erasure.
 *
 * Required by App Store guideline 5.1.1(v) — any app with account creation must
 * offer in-app deletion — and by GDPR/CCPA rights of access and erasure.
 *
 * Two rules shape the implementation:
 *
 *  1. Deletion is deletion, not deactivation. Rows go, they are not flagged.
 *     A "deleted" account that still has a location history somewhere is the
 *     thing the guideline exists to prevent.
 *
 *  2. It must not vandalise other people's data. A crew, a game round and a
 *     grant are shared objects; erasing one member scrubs *their* participation
 *     and leaves everyone else's night intact.
 */

export interface AccountExport {
  exportedAt: string;
  account: Record<string, unknown>;
  nights: unknown[];
  /** Decrypted for the person it belongs to. It is their data. */
  locationHistory: { nightId: string; pings: unknown }[];
  sharing: { granted: unknown[]; watching: unknown[] };
  crews: unknown[];
  games: unknown[];
  points: { entries: unknown[]; redemptions: unknown[] };
  pharmacyRuns: unknown[];
  pendingOrders: unknown[];
  partyCart: unknown;
}

/** Everything held about one person, in the shape it is stored. */
export function exportAccount(db: Db, userId: string, now: Date): AccountExport {
  const traveler = db.travelers.find((t) => t.id === userId);
  if (!traveler) throw new Error("Account not found.");

  const nights = db.nights.filter((n) => n.travelerId === userId);
  const nightIds = new Set(nights.map((n) => n.id));

  // The password hash is not exported: it is a credential, not personal data
  // the user needs back, and handing it over only widens the blast radius of a
  // leaked export file.
  const { passwordHash: _omitted, ...account } = traveler;

  return {
    exportedAt: now.toISOString(),
    account,
    nights: nights.map(({ pings: _pings, ...rest }) => rest),
    locationHistory: nights.map((n) => ({ nightId: n.id, pings: n.pings })),
    sharing: {
      granted: db.grants.filter((g) => g.travelerId === userId),
      watching: db.grants.filter((g) => g.guardianId === userId),
    },
    crews: db.crews.filter((c) => c.members.some((m) => m.travelerId === userId)),
    games: db.rounds.filter((r) => r.players.some((p) => p.id === userId)),
    points: {
      entries: db.points[userId] ?? [],
      redemptions: db.redemptions[userId] ?? [],
    },
    pharmacyRuns: [...nightIds].flatMap((id) => db.carePackages[id]?.orders ?? []),
    pendingOrders: db.pendingOrders[userId] ?? [],
    partyCart: db.partyCarts[userId] ?? [],
  };
}

export interface DeletionSummary {
  nights: number;
  locationPings: number;
  grantsRevoked: number;
  crewsLeft: number;
  gameRoundsScrubbed: number;
}

/**
 * Erases one account in place. Returns what went, so the user can be told
 * rather than shown a bare "done".
 */
export function deleteAccount(db: Db, userId: string, _now: Date): DeletionSummary {
  const nights = db.nights.filter((n) => n.travelerId === userId);
  const nightIds = new Set(nights.map((n) => n.id));
  const locationPings = nights.reduce((sum, n) => sum + (Array.isArray(n.pings) ? n.pings.length : 0), 0);

  // Sharing first: anyone watching this person loses access immediately, and
  // anything they were watching stops being theirs to see. Doing this before
  // the rest means there is no window where a grant outlives its owner.
  let grantsRevoked = 0;
  for (const grant of db.grants) {
    if (grant.travelerId === userId || grant.guardianId === userId) grantsRevoked += 1;
  }
  db.grants = db.grants.filter((g) => g.travelerId !== userId && g.guardianId !== userId);

  db.sessions = db.sessions.filter((s) => s.userId !== userId);
  db.nights = db.nights.filter((n) => n.travelerId !== userId);
  db.alerts = db.alerts.filter((a) => !nightIds.has(a.nightId));

  for (const id of nightIds) delete db.carePackages[id];
  delete db.points[userId];
  delete db.redemptions[userId];
  delete db.pendingOrders[userId];
  delete db.partyCarts[userId];

  // Crews: drop this member. Everyone else's night is untouched; a crew left
  // with nobody in it goes too.
  let crewsLeft = 0;
  for (const crew of db.crews) {
    if (!crew.members.some((m) => m.travelerId === userId)) continue;
    crewsLeft += 1;
    crew.members = crew.members.filter((m) => m.travelerId !== userId);
  }
  db.crews = db.crews.filter((c) => c.members.length > 0);

  // Game rounds: remove them as a player and scrub any result naming them. A
  // round nobody is left in goes; one with other players survives.
  let gameRoundsScrubbed = 0;
  for (const round of db.rounds) {
    if (!round.players.some((p) => p.id === userId)) continue;
    gameRoundsScrubbed += 1;
    round.players = round.players.filter((p) => p.id !== userId);
    if (round.winnerId === userId) delete round.winnerId;
    if (round.loserId === userId) delete round.loserId;
    if (round.guesses) delete round.guesses[userId];
  }
  db.rounds = db.rounds.filter((r) => r.players.length > 0);

  db.travelers = db.travelers.filter((t) => t.id !== userId);

  return { nights: nights.length, locationPings, grantsRevoked, crewsLeft, gameRoundsScrubbed };
}

/** Nothing anywhere should still name a deleted account. Used by tests. */
export function residualReferences(db: Db, userId: string): string[] {
  const found: string[] = [];
  const check = (where: string, hit: boolean) => { if (hit) found.push(where); };

  check("travelers", db.travelers.some((t) => t.id === userId));
  check("sessions", db.sessions.some((s) => s.userId === userId));
  check("nights", db.nights.some((n) => n.travelerId === userId));
  check("grants", db.grants.some((g) => g.travelerId === userId || g.guardianId === userId));
  check("crews", db.crews.some((c) => c.members.some((m) => m.travelerId === userId)));
  check("rounds", db.rounds.some((r) =>
    r.players.some((p) => p.id === userId) || r.winnerId === userId || r.loserId === userId));
  check("points", Boolean(db.points[userId]));
  check("redemptions", Boolean(db.redemptions[userId]));
  check("pendingOrders", Boolean(db.pendingOrders[userId]));
  check("partyCarts", Boolean(db.partyCarts[userId]));
  return found;
}
