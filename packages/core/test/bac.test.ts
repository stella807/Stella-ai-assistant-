import { describe, expect, it } from "vitest";
import { estimateBac, impairmentBand } from "../src/bac.ts";
import { logDrink } from "../src/drinks.ts";
import type { BodyProfile } from "../src/types.ts";

const body: BodyProfile = { weightKg: 82, widmarkRatio: 0.68 };
const T0 = new Date("2026-01-01T20:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const drinksAt = (spec: [string, number][]) =>
  spec.map(([drinkId, minutes], i) =>
    logDrink({ id: `d${i}`, drinkId, loggedAt: at(minutes).toISOString() }),
  );

describe("estimateBac", () => {
  it("is zero with no drinks", () => {
    const r = estimateBac({ body, drinks: [], now: T0 });
    expect(r.estimate).toBe(0);
    expect(r.band).toBe("none");
  });

  it("puts four beers in an hour well into impairment", () => {
    const drinks = drinksAt([["beer-regular", 0], ["beer-regular", 15], ["beer-regular", 30], ["beer-regular", 45]]);
    const r = estimateBac({ body, drinks, now: at(60) });
    expect(r.estimate).toBeGreaterThan(0.05);
    expect(["moderate", "high"]).toContain(r.band);
  });

  it("decays over time", () => {
    const drinks = drinksAt([["beer-regular", 0], ["beer-regular", 10]]);
    const early = estimateBac({ body, drinks, now: at(20) }).estimate;
    const later = estimateBac({ body, drinks, now: at(200) }).estimate;
    expect(later).toBeLessThan(early);
  });

  it("does not let an old drink erase a fresh one", () => {
    // A beer six hours ago is long gone; a shot one minute ago is not.
    const drinks = drinksAt([["beer-regular", 0], ["shot-whiskey", 360]]);
    const r = estimateBac({ body, drinks, now: at(361) });
    expect(r.estimate).toBeGreaterThan(0.01);
  });

  it("ignores drinks logged in the future", () => {
    const drinks = drinksAt([["beer-regular", 120]]);
    expect(estimateBac({ body, drinks, now: T0 }).estimate).toBe(0);
  });

  it("gives a lighter person a higher estimate for the same drinks", () => {
    const drinks = drinksAt([["beer-regular", 0], ["beer-regular", 20]]);
    const heavy = estimateBac({ body: { weightKg: 110, widmarkRatio: 0.68 }, drinks, now: at(30) });
    const light = estimateBac({ body: { weightKg: 55, widmarkRatio: 0.55 }, drinks, now: at(30) });
    expect(light.estimate).toBeGreaterThan(heavy.estimate);
  });

  it("always reports an uncertainty band around the point estimate", () => {
    const drinks = drinksAt([["cocktail-margarita", 0], ["cocktail-margarita", 20]]);
    const r = estimateBac({ body, drinks, now: at(30) });
    expect(r.low).toBeLessThan(r.estimate);
    expect(r.high).toBeGreaterThan(r.estimate);
  });

  it("never advises driving, at any level including zero", () => {
    for (const minutes of [0, 30, 120, 600]) {
      const r = estimateBac({ body, drinks: drinksAt([["shot-tequila", 0]]), now: at(minutes) });
      expect(r.neverAdviseDriving).toBe(true);
      expect(r.guidance.toLowerCase()).not.toMatch(/safe to drive|ok to drive|okay to drive|fine to drive|can drive/);
    }
  });

  it("flags alcohol poisoning signs at the severe band", () => {
    const many = drinksAt(Array.from({ length: 10 }, (_, i) => ["shot-tequila", i * 5] as [string, number]));
    const r = estimateBac({ body, drinks: many, now: at(50) });
    expect(r.band).toBe("severe");
    expect(r.guidance).toContain("911");
  });

  it("estimates a sober-by time from the pessimistic end of the range", () => {
    const drinks = drinksAt([["beer-regular", 0], ["beer-regular", 10]]);
    const r = estimateBac({ body, drinks, now: at(15) });
    expect(r.hoursUntilLikelySober).toBeGreaterThan(r.estimate / 0.02);
  });

  it("rejects a nonsense body profile", () => {
    expect(() => estimateBac({ body: { weightKg: 0, widmarkRatio: 0.68 }, drinks: [], now: T0 })).toThrow();
    expect(() => estimateBac({ body: { weightKg: 80, widmarkRatio: 0 }, drinks: [], now: T0 })).toThrow();
  });

  it("bands ascend with bac", () => {
    expect(impairmentBand(0)).toBe("none");
    expect(impairmentBand(0.02)).toBe("low");
    expect(impairmentBand(0.05)).toBe("moderate");
    expect(impairmentBand(0.09)).toBe("high");
    expect(impairmentBand(0.2)).toBe("severe");
  });
});
