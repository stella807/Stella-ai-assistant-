import { describe, expect, it } from "vitest";
import { CHECK_IN_BOUNDS, answerCheckIn, nextCheckInMinutes, retimePendingCheckIn, scheduleCheckIn, sweepMissedCheckIns } from "../src/checkins.ts";
import { logDrink } from "../src/drinks.ts";
import type { CheckIn, NightOut } from "../src/types.ts";

const T0 = new Date("2026-01-01T20:00:00Z");
const at = (m: number) => new Date(T0.getTime() + m * 60_000);

const night = (over: Partial<NightOut> = {}): NightOut => ({
  id: "n1",
  travelerId: "t1",
  startedAt: T0.toISOString(),
  status: "active",
  body: { weightKg: 82, widmarkRatio: 0.68 },
  drinks: [],
  checkIns: [],
  pings: [],
  drinkLimit: 4,
  ...over,
});

describe("check-in cadence", () => {
  it("starts relaxed when nothing has been drunk", () => {
    expect(nextCheckInMinutes(night(), T0)).toBe(CHECK_IN_BOUNDS.maxMinutes);
  });

  it("tightens as drinks add up", () => {
    const two = night({ drinks: [0, 10].map((m, i) => logDrink({ id: `d${i}`, drinkId: "beer-regular", loggedAt: at(m).toISOString() })) });
    const six = night({ drinks: Array.from({ length: 6 }, (_, i) => logDrink({ id: `d${i}`, drinkId: "beer-regular", loggedAt: at(i * 8).toISOString() })) });
    expect(nextCheckInMinutes(two, at(20))).toBeLessThan(CHECK_IN_BOUNDS.maxMinutes);
    expect(nextCheckInMinutes(six, at(50))).toBeLessThan(nextCheckInMinutes(two, at(20)));
  });

  it("tightens further after a missed check-in", () => {
    const drinks = [0, 10].map((m, i) => logDrink({ id: `d${i}`, drinkId: "beer-regular", loggedAt: at(m).toISOString() }));
    const missed: CheckIn = { id: "c1", dueAt: at(5).toISOString(), status: "missed", reportedDrinkIds: [] };
    const without = nextCheckInMinutes(night({ drinks }), at(30));
    const with_ = nextCheckInMinutes(night({ drinks, checkIns: [missed] }), at(30));
    expect(with_).toBeLessThan(without);
  });

  it("never schedules tighter than the floor, however bad the night", () => {
    const many = Array.from({ length: 15 }, (_, i) => logDrink({ id: `d${i}`, drinkId: "shot-tequila", loggedAt: at(i * 3).toISOString() }));
    const missed: CheckIn[] = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, dueAt: at(i).toISOString(), status: "missed", reportedDrinkIds: [] }));
    expect(nextCheckInMinutes(night({ drinks: many, checkIns: missed }), at(50))).toBe(CHECK_IN_BOUNDS.minMinutes);
  });

  it("schedules the next check-in in the future", () => {
    const c = scheduleCheckIn(night(), T0, "c1");
    expect(new Date(c.dueAt).getTime()).toBeGreaterThan(T0.getTime());
    expect(c.status).toBe("pending");
  });
});

describe("check-in state", () => {
  const pending: CheckIn = { id: "c1", dueAt: at(0).toISOString(), status: "pending", reportedDrinkIds: [] };

  it("leaves a check-in pending inside the grace period", () => {
    expect(sweepMissedCheckIns([pending], at(5))[0]!.status).toBe("pending");
  });

  it("marks it missed past the grace period", () => {
    expect(sweepMissedCheckIns([pending], at(15))[0]!.status).toBe("missed");
  });

  it("does not resurrect an answered check-in", () => {
    const answered = answerCheckIn([pending], "c1", at(2), ["d1"], 4);
    expect(answered[0]!.status).toBe("answered");
    expect(sweepMissedCheckIns(answered, at(60))[0]!.status).toBe("answered");
  });

  it("records what was reported at the check-in", () => {
    const [c] = answerCheckIn([pending], "c1", at(2), ["d1", "d2"], 3);
    expect(c!.reportedDrinkIds).toEqual(["d1", "d2"]);
    expect(c!.feelingRating).toBe(3);
  });
});

describe("retiming a pending check-in", () => {
  const pendingIn = (minutes: number): CheckIn => ({
    id: "c1", dueAt: at(minutes).toISOString(), status: "pending", reportedDrinkIds: [],
  });

  it("pulls a far-off check-in closer once drinks pile up", () => {
    const drinks = Array.from({ length: 6 }, (_, i) =>
      logDrink({ id: `d${i}`, drinkId: "beer-ipa", loggedAt: at(i * 5).toISOString() }));
    const n = night({ drinks, checkIns: [pendingIn(60)] });
    const [retimed] = retimePendingCheckIn(n, at(30));
    expect(new Date(retimed!.dueAt).getTime()).toBeLessThan(at(60).getTime());
  });

  it("never pushes a check-in later", () => {
    const n = night({ checkIns: [pendingIn(5)] });
    const [retimed] = retimePendingCheckIn(n, at(0));
    expect(retimed!.dueAt).toBe(at(5).toISOString());
  });

  it("leaves answered and missed check-ins alone", () => {
    const n = night({
      checkIns: [
        { id: "a", dueAt: at(60).toISOString(), status: "answered", reportedDrinkIds: [] },
        { id: "m", dueAt: at(90).toISOString(), status: "missed", reportedDrinkIds: [] },
      ],
    });
    expect(retimePendingCheckIn(n, at(30)).map((c) => c.dueAt)).toEqual([at(60).toISOString(), at(90).toISOString()]);
  });
});
