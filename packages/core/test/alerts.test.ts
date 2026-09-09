import { describe, expect, it } from "vitest";
import { deriveAlerts, sosAlert } from "../src/alerts.ts";
import { logDrink } from "../src/drinks.ts";
import type { CheckIn, NightOut } from "../src/types.ts";

const T0 = new Date("2026-01-01T20:00:00Z");
const at = (m: number) => new Date(T0.getTime() + m * 60_000);
const beers = (n: number, spacingMin = 10) =>
  Array.from({ length: n }, (_, i) => logDrink({ id: `d${i}`, drinkId: "beer-regular", loggedAt: at(i * spacingMin).toISOString() }));

const night = (over: Partial<NightOut> = {}): NightOut => ({
  id: "n1", travelerId: "t1", startedAt: T0.toISOString(), status: "active",
  body: { weightKg: 82, widmarkRatio: 0.68 }, drinks: [], checkIns: [], pings: [], drinkLimit: 4, ...over,
});

const derive = (n: NightOut, now: Date, raised: string[] = []) =>
  deriveAlerts({ night: n, now, alreadyRaised: new Set(raised) });

describe("deriveAlerts", () => {
  it("is quiet on a calm night", () => {
    expect(derive(night({ drinks: beers(1) }), at(20))).toEqual([]);
  });

  it("raises on a missed check-in with a way to reach them", () => {
    const missed: CheckIn = { id: "c1", dueAt: at(0).toISOString(), status: "missed", reportedDrinkIds: [] };
    const [alert] = derive(night({ checkIns: [missed] }), at(20));
    expect(alert!.kind).toBe("missed-check-in");
    expect(alert!.actions.map((a) => a.type)).toContain("call");
  });

  it("raises when the agreed drink limit is reached", () => {
    const alerts = derive(night({ drinks: beers(4, 25) }), at(110));
    expect(alerts.some((a) => a.kind === "drink-limit-reached")).toBe(true);
  });

  it("raises on a fast pace even under the limit", () => {
    const alerts = derive(night({ drinkLimit: 10, drinks: beers(3, 15) }), at(35));
    expect(alerts.some((a) => a.kind === "fast-pace")).toBe(true);
  });

  it("does not re-raise an alert already sent", () => {
    const n = night({ drinks: beers(4, 25) });
    const first = derive(n, at(110));
    const again = derive(n, at(115), first.map((a) => a.id));
    expect(again).toEqual([]);
  });

  it("escalates to urgent in the danger range", () => {
    const shots = Array.from({ length: 12 }, (_, i) => logDrink({ id: `s${i}`, drinkId: "shot-tequila", loggedAt: at(i * 4).toISOString() }));
    const alerts = derive(night({ drinkLimit: 99, drinks: shots }), at(50));
    const urgent = alerts.find((a) => a.severity === "urgent");
    expect(urgent).toBeDefined();
    expect(urgent!.message).toContain("911");
  });

  it("reports the good news too", () => {
    expect(derive(night({ status: "home-safe" }), at(200)).some((a) => a.kind === "home-safe")).toBe(true);
    expect(derive(night({ status: "heading-home" }), at(180)).some((a) => a.kind === "heading-home")).toBe(true);
  });

  it("offers a ride, never a suggestion to drive", () => {
    const alerts = derive(night({ drinks: beers(5, 20) }), at(100));
    const text = JSON.stringify(alerts).toLowerCase();
    expect(text).not.toMatch(/drive home|drive yourself|ok to drive/);
    expect(alerts.some((a) => a.actions.some((x) => x.type === "book-ride"))).toBe(true);
  });
});

describe("sosAlert", () => {
  it("is always urgent", () => {
    expect(sosAlert(night(), at(90), false).severity).toBe("urgent");
  });

  it("a silent SOS does not offer a call that could give them away", () => {
    const silent = sosAlert(night(), at(90), true);
    expect(silent.actions.map((a) => a.type)).not.toContain("call");
    expect(silent.actions.map((a) => a.type)).toContain("message");
  });
});
