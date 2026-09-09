import type { Iso8601 } from "./types.ts";

/**
 * Games for a table out together.
 *
 * One rule shapes every one of these: **no game rewards drinking more.** A
 * drinking game that pushes volume, in an app whose whole job is getting people
 * home safe, would be the product arguing with itself — and the people most
 * likely to lose such a game are the ones already in trouble. So the scoring
 * runs on checking in, pacing, water, and getting home; forfeits are water and
 * errands, never shots.
 *
 * They are still competitive and still funny. That was the design problem worth
 * solving, and it is solvable.
 */

export interface GamePlayer {
  id: string;
  displayName: string;
}

export type GameId =
  | "worried-text"
  | "check-in-roulette"
  | "guess-the-tab"
  | "last-one-standing"
  | "ride-home-race";

export interface GameDefinition {
  id: GameId;
  name: string;
  tagline: string;
  howItWorks: string;
  forfeit: string;
  /** What the winner earns, in Safehubby points. */
  reward: number;
  minPlayers: number;
}

export const GAMES: GameDefinition[] = [
  {
    id: "worried-text",
    name: "First Worried Text",
    tagline: "Whose person cracks first?",
    howItWorks:
      "Everyone's partner, roommate or parent is watching tonight. The first player whose person sends a worried message loses the round. Tap whoever's phone buzzed first — the round settles on the first report and does not flip.",
    forfeit: "Buys the next round — of water, for the table.",
    reward: 60,
    minPlayers: 2,
  },
  {
    id: "check-in-roulette",
    name: "Check-In Roulette",
    tagline: "Slowest thumb loses.",
    howItWorks:
      "Safehubby pings the whole table at a random moment. Everyone taps to check in. Last one to answer takes the forfeit — and anyone who never answers at all is the one the table should go find.",
    forfeit: "Fetches the next round of waters and a basket of fries.",
    reward: 40,
    minPlayers: 3,
  },
  {
    id: "guess-the-tab",
    name: "Guess the Tab",
    tagline: "Call it before close.",
    howItWorks:
      "Early in the night, everyone writes down what they think the table's total standard drinks will be by the time the last person heads home. Closest guess wins. No one can change their guess after the third round is logged.",
    forfeit: "Furthest guess sorts out the actual bill.",
    reward: 80,
    minPlayers: 2,
  },
  {
    id: "last-one-standing",
    name: "Last One Standing",
    tagline: "Pace, not volume.",
    howItWorks:
      "A point for every hour you stay inside the drink limit you set for yourself, and a point for every water you log between drinks. Going over your own limit ends your run. The winner is whoever paced it best — which is usually not whoever drank most.",
    forfeit: "First one out picks up breakfast.",
    reward: 100,
    minPlayers: 2,
  },
  {
    id: "ride-home-race",
    name: "Ride Home Race",
    tagline: "First one home wins.",
    howItWorks:
      "The first player to book a ride and get home safe takes the round. It is the one race in the app worth winning, and the points say so.",
    forfeit: "Last one home owes the group a round of coffees tomorrow.",
    reward: 120,
    minPlayers: 2,
  },
];

export function findGame(id: GameId): GameDefinition {
  const game = GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}

export type RoundStatus = "open" | "settled";

export interface GameRound {
  id: string;
  gameId: GameId;
  players: GamePlayer[];
  startedAt: Iso8601;
  status: RoundStatus;
  /** Player who took the forfeit. */
  loserId?: string;
  /** Player who won the round, where the game has a winner. */
  winnerId?: string;
  endedAt?: Iso8601;
  /** Guess-the-tab: playerId -> predicted standard drinks. */
  guesses?: Record<string, number>;
}

export const DEFAULT_FORFEIT = "Buys the next round — of water.";

export function startRound(id: string, gameId: GameId, players: GamePlayer[], now: Date): GameRound {
  const game = findGame(gameId);
  if (players.length < game.minPlayers) {
    throw new Error(`${game.name} needs at least ${game.minPlayers} players.`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new Error("A player can only join a round once.");

  return { id, gameId, players, startedAt: now.toISOString(), status: "open", guesses: {} };
}

function requirePlayer(round: GameRound, playerId: string): void {
  if (!round.players.some((p) => p.id === playerId)) throw new Error("Not a player in this round.");
}

/**
 * Settles a round on the first report. Later reports are ignored rather than
 * overwriting — "who was first" is the whole game, and a settled round that
 * flips is worse than no game.
 */
export function settleRound(round: GameRound, loserId: string, now: Date): GameRound {
  if (round.status === "settled") return round;
  requirePlayer(round, loserId);
  return { ...round, status: "settled", loserId, endedAt: now.toISOString() };
}

/** Ride Home Race and Last One Standing settle on a winner, not a loser. */
export function settleWithWinner(round: GameRound, winnerId: string, now: Date): GameRound {
  if (round.status === "settled") return round;
  requirePlayer(round, winnerId);
  return { ...round, status: "settled", winnerId, endedAt: now.toISOString() };
}

export const GUESS_LOCKS_AFTER_DRINKS = 3;

export function recordGuess(round: GameRound, playerId: string, guess: number, drinksLogged: number): GameRound {
  if (round.gameId !== "guess-the-tab") throw new Error("That game does not take guesses.");
  if (round.status === "settled") throw new Error("That round is already settled.");
  requirePlayer(round, playerId);
  if (!Number.isFinite(guess) || guess < 0) throw new Error("Guess a number of drinks.");
  if (drinksLogged >= GUESS_LOCKS_AFTER_DRINKS && round.guesses?.[playerId] !== undefined) {
    throw new Error("Guesses are locked once the table hits three drinks.");
  }
  return { ...round, guesses: { ...round.guesses, [playerId]: guess } };
}

/** Closest guess wins; ties go to the lower guess, which rewards restraint. */
export function settleGuessTheTab(round: GameRound, actualStandardDrinks: number, now: Date): GameRound {
  if (round.status === "settled") return round;
  const entries = Object.entries(round.guesses ?? {});
  if (entries.length === 0) throw new Error("Nobody guessed.");

  let best = entries[0]!;
  for (const entry of entries.slice(1)) {
    const d = Math.abs(entry[1] - actualStandardDrinks);
    const bestD = Math.abs(best[1] - actualStandardDrinks);
    if (d < bestD || (d === bestD && entry[1] < best[1])) best = entry;
  }
  const worst = entries.reduce((w, e) =>
    Math.abs(e[1] - actualStandardDrinks) > Math.abs(w[1] - actualStandardDrinks) ? e : w, entries[0]!);

  return { ...round, status: "settled", winnerId: best[0], loserId: worst[0], endedAt: now.toISOString() };
}

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  points: number;
}

export function leaderboard(players: GamePlayer[], pointsByPlayer: Record<string, number>): LeaderboardEntry[] {
  return players
    .map((p) => ({ playerId: p.id, displayName: p.displayName, points: pointsByPlayer[p.id] ?? 0 }))
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
}
