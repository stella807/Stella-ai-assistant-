import { describe, expect, it } from "vitest";
import {
  GAMES, GUESS_LOCKS_AFTER_DRINKS, findGame, leaderboard, recordGuess,
  settleGuessTheTab, settleRound, settleWithWinner, startRound,
} from "../src/games.ts";

const T0 = new Date("2026-01-01T20:00:00Z");
const P = [
  { id: "sam", displayName: "Sam" },
  { id: "jordan", displayName: "Jordan" },
  { id: "riley", displayName: "Riley" },
];

describe("the game catalogue", () => {
  it("has a definition for every game, with a forfeit and a reward", () => {
    for (const g of GAMES) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.howItWorks.length).toBeGreaterThan(40);
      expect(g.forfeit.length).toBeGreaterThan(0);
      expect(g.reward).toBeGreaterThan(0);
      expect(g.minPlayers).toBeGreaterThanOrEqual(2);
    }
  });

  it("has no forfeit that involves drinking more alcohol", () => {
    // The product would be arguing with itself. This is the load-bearing test.
    for (const g of GAMES) {
      expect(g.forfeit.toLowerCase()).not.toMatch(/\b(shot|shots|drink up|chug|down it|pint|beer|tequila|vodka)\b/);
    }
  });

  it("does not describe any game as scoring on how much you drink", () => {
    for (const g of GAMES) {
      expect(g.howItWorks.toLowerCase()).not.toMatch(/drink the most|whoever drinks most|keep drinking|catch up/);
    }
  });

  it("pays out most for getting home", () => {
    const ride = findGame("ride-home-race");
    expect(Math.max(...GAMES.map((g) => g.reward))).toBe(ride.reward);
  });

  it("rejects an unknown game", () => {
    // @ts-expect-error exercising the runtime guard
    expect(() => findGame("beer-pong")).toThrow();
  });
});

describe("rounds", () => {
  it("enforces the minimum player count", () => {
    expect(() => startRound("r", "check-in-roulette", P.slice(0, 2), T0)).toThrow(/at least 3/);
    expect(startRound("r", "worried-text", P.slice(0, 2), T0).status).toBe("open");
  });

  it("rejects a duplicate player", () => {
    expect(() => startRound("r", "worried-text", [P[0]!, P[0]!], T0)).toThrow(/only join a round once/i);
  });

  it("settles on the first report and does not flip", () => {
    const r = settleRound(startRound("r", "worried-text", P, T0), "jordan", T0);
    expect(r.loserId).toBe("jordan");
    expect(settleRound(r, "sam", T0).loserId).toBe("jordan");
  });

  it("rejects a non-player", () => {
    expect(() => settleRound(startRound("r", "worried-text", P, T0), "nobody", T0)).toThrow();
  });

  it("settles a race on a winner", () => {
    const r = settleWithWinner(startRound("r", "ride-home-race", P, T0), "riley", T0);
    expect(r.winnerId).toBe("riley");
    expect(r.status).toBe("settled");
  });
});

describe("guess the tab", () => {
  const open = () => startRound("r", "guess-the-tab", P, T0);

  it("takes a guess from each player", () => {
    let r = recordGuess(open(), "sam", 12, 0);
    r = recordGuess(r, "jordan", 20, 0);
    expect(r.guesses).toEqual({ sam: 12, jordan: 20 });
  });

  it("locks an existing guess once the table hits three drinks", () => {
    const r = recordGuess(open(), "sam", 12, 0);
    expect(() => recordGuess(r, "sam", 30, GUESS_LOCKS_AFTER_DRINKS)).toThrow(/locked/i);
    // A latecomer who never guessed can still get one in.
    expect(recordGuess(r, "riley", 15, GUESS_LOCKS_AFTER_DRINKS).guesses!.riley).toBe(15);
  });

  it("rejects a nonsense guess and the wrong game", () => {
    expect(() => recordGuess(open(), "sam", -3, 0)).toThrow();
    expect(() => recordGuess(startRound("r", "worried-text", P, T0), "sam", 5, 0)).toThrow(/does not take guesses/i);
  });

  it("awards the closest guess and the forfeit to the furthest", () => {
    let r = open();
    r = recordGuess(r, "sam", 10, 0);
    r = recordGuess(r, "jordan", 14, 0);
    r = recordGuess(r, "riley", 26, 0);
    const settled = settleGuessTheTab(r, 13, T0);
    expect(settled.winnerId).toBe("jordan");
    expect(settled.loserId).toBe("riley");
  });

  it("breaks a tie toward the lower guess", () => {
    let r = open();
    r = recordGuess(r, "sam", 8, 0);
    r = recordGuess(r, "jordan", 12, 0);
    expect(settleGuessTheTab(r, 10, T0).winnerId).toBe("sam");
  });

  it("refuses to settle with no guesses", () => {
    expect(() => settleGuessTheTab(open(), 10, T0)).toThrow(/nobody guessed/i);
  });
});

describe("leaderboard", () => {
  it("ranks by points, then name", () => {
    expect(leaderboard(P, { sam: 10, jordan: 30, riley: 30 }).map((e) => e.playerId))
      .toEqual(["jordan", "riley", "sam"]);
  });
});
