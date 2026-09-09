import type { Iso8601 } from "./types.ts";

/**
 * Light social games for a group out together. These are the one place the app
 * is allowed to be funny, so they stay strictly about *checking in*, never
 * about drinking more — no dares, no "catch up" mechanics, no round buying tied
 * to how much someone drank.
 */

export interface GamePlayer {
  id: string;
  displayName: string;
}

export interface WorriedTextRound {
  id: string;
  players: GamePlayer[];
  startedAt: Iso8601;
  /** First player whose guardian sent a worried message. */
  loserId?: string;
  endedAt?: Iso8601;
  forfeit: string;
}

export const DEFAULT_FORFEIT = "Buys the next round — of water.";

export function startWorriedTextRound(
  id: string,
  players: GamePlayer[],
  now: Date,
  forfeit = DEFAULT_FORFEIT,
): WorriedTextRound {
  if (players.length < 2) throw new Error("Need at least two players.");
  return { id, players, startedAt: now.toISOString(), forfeit };
}

/**
 * Records the first worried message and closes the round. Later reports are
 * ignored — the game is "who was first", and a settled round should not flip.
 */
export function reportWorriedText(round: WorriedTextRound, playerId: string, now: Date): WorriedTextRound {
  if (round.endedAt) return round;
  if (!round.players.some((p) => p.id === playerId)) throw new Error("Not a player in this round.");
  return { ...round, loserId: playerId, endedAt: now.toISOString() };
}

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  points: number;
}

export function leaderboard(
  players: GamePlayer[],
  pointsByPlayer: Record<string, number>,
): LeaderboardEntry[] {
  return players
    .map((p) => ({ playerId: p.id, displayName: p.displayName, points: pointsByPlayer[p.id] ?? 0 }))
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
}
