import { describe, expect, it } from "vitest";
import { deleteAccount, exportAccount, residualReferences } from "../src/account.ts";
import { SEED } from "../src/seed.ts";
import type { Db } from "../src/store.ts";

const T0 = new Date("2026-01-02T09:00:00Z");

const traveler = (id: string) => ({
  id, email: `${id}@example.com`, passwordHash: "scrypt$deadbeef$cafe",
  displayName: id, planId: "premium-plus" as const, homeLabel: "142 Rowan St", emergencyContacts: [],
});

/** Sam and Jordan out together, sharing, mid-game, with everything populated. */
function populated(): Db {
  const db: Db = structuredClone(SEED);
  db.travelers.push(traveler("sam"), traveler("jordan"));
  db.sessions.push(
    { token: "tok-sam", userId: "sam", createdAt: "x", expiresAt: "y" },
    { token: "tok-jordan", userId: "jordan", createdAt: "x", expiresAt: "y" },
  );
  db.nights.push(
    { id: "n-sam", travelerId: "sam", startedAt: "2026-01-01T20:00:00Z", status: "active",
      body: { weightKg: 82, widmarkRatio: 0.68 }, drinks: [], checkIns: [],
      pings: [{ lat: 40.7148, lng: -74.0018, accuracyMeters: 20, at: "z" }, { lat: 40.71, lng: -74.0, accuracyMeters: 20, at: "z" }],
      drinkLimit: 4 } as any,
    { id: "n-jordan", travelerId: "jordan", startedAt: "2026-01-01T20:00:00Z", status: "active",
      body: { weightKg: 70, widmarkRatio: 0.68 }, drinks: [], checkIns: [], pings: [], drinkLimit: 4 } as any,
  );
  db.alerts.push({ id: "a1", nightId: "n-sam" } as any, { id: "a2", nightId: "n-jordan" } as any);
  db.grants.push(
    { id: "g1", travelerId: "sam", guardianId: "jordan", inviteCode: "AAA-111", scopes: ["location"],
      grantedAt: "x", expiresAt: "y", visibleToTraveler: true } as any,
    { id: "g2", travelerId: "jordan", guardianId: "sam", inviteCode: "BBB-222", scopes: ["location"],
      grantedAt: "x", expiresAt: "y", visibleToTraveler: true } as any,
  );
  db.crews.push({
    id: "c1", name: "Friday", joinCode: "CCC-333", createdBy: "sam", createdAt: "x", expiresAt: "y",
    members: [
      { travelerId: "sam", displayName: "sam", joinedAt: "x", sharesCount: true },
      { travelerId: "jordan", displayName: "jordan", joinedAt: "x", sharesCount: true },
    ],
  } as any);
  db.rounds.push(
    { id: "r1", gameId: "guess-the-tab", status: "settled", startedAt: "x", winnerId: "sam", loserId: "jordan",
      guesses: { sam: 10, jordan: 20 },
      players: [{ id: "sam", displayName: "sam" }, { id: "jordan", displayName: "jordan" }] } as any,
    { id: "r2", gameId: "worried-text", status: "open", startedAt: "x",
      players: [{ id: "sam", displayName: "sam" }] } as any,
  );
  db.carePackages["n-sam"] = { auth: null, orders: [{ id: "cp1" } as any] };
  db.carePackages["n-jordan"] = { auth: null, orders: [] };
  db.points.sam = [{ id: "p1", reason: "homeSafe", points: 50, awardedAt: "x" }];
  db.points.jordan = [{ id: "p2", reason: "homeSafe", points: 50, awardedAt: "x" }];
  db.redemptions.sam = [{ id: "rd1", rewardId: "rw-coffee", cost: 300, redeemedAt: "x" }];
  db.pendingOrders.sam = [{ id: "o1" } as any];
  db.partyCarts.sam = [{ sku: "pt-chair", qty: 10 }];
  return db;
}

describe("export", () => {
  it("returns everything held about the person", () => {
    const out = exportAccount(populated(), "sam", T0);
    expect((out.account as any).email).toBe("sam@example.com");
    expect(out.nights).toHaveLength(1);
    expect(out.sharing.granted).toHaveLength(1);
    expect(out.sharing.watching).toHaveLength(1);
    expect(out.crews).toHaveLength(1);
    expect(out.games).toHaveLength(2);
    expect(out.points.entries).toHaveLength(1);
    expect(out.pendingOrders).toHaveLength(1);
    expect(out.partyCart).toEqual([{ sku: "pt-chair", qty: 10 }]);
  });

  it("includes their location history in the clear — it is their data", () => {
    const out = exportAccount(populated(), "sam", T0);
    expect(out.locationHistory[0]!.pings).toHaveLength(2);
    expect(JSON.stringify(out.locationHistory)).toContain("40.7148");
  });

  it("never exports the password hash", () => {
    expect(JSON.stringify(exportAccount(populated(), "sam", T0))).not.toMatch(/passwordHash|scrypt|deadbeef/);
  });

  it("does not leak the other person's night", () => {
    const out = exportAccount(populated(), "sam", T0);
    expect(JSON.stringify(out.nights)).not.toContain("n-jordan");
  });

  it("refuses an unknown account", () => {
    expect(() => exportAccount(populated(), "nobody", T0)).toThrow(/not found/i);
  });
});

describe("deletion", () => {
  it("leaves nothing behind that names them", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    expect(residualReferences(db, "sam")).toEqual([]);
  });

  it("takes the location history with it", () => {
    const db = populated();
    const summary = deleteAccount(db, "sam", T0);
    expect(summary.locationPings).toBe(2);
    expect(JSON.stringify(db)).not.toContain("40.7148");
  });

  it("reports what went, so the user can be told", () => {
    const summary = deleteAccount(populated(), "sam", T0);
    expect(summary).toEqual({ nights: 1, locationPings: 2, grantsRevoked: 2, crewsLeft: 1, gameRoundsScrubbed: 2 });
  });

  it("revokes sharing in both directions", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    // Jordan can no longer watch Sam, and Sam's watch on Jordan is gone too.
    expect(db.grants).toEqual([]);
  });

  it("does NOT vandalise the other person's data", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    expect(db.travelers.map((t) => t.id)).toEqual(["jordan"]);
    expect(db.nights.map((n) => n.id)).toEqual(["n-jordan"]);
    expect(db.alerts.map((a) => a.id)).toEqual(["a2"]);
    expect(db.points.jordan).toHaveLength(1);
    expect(db.carePackages["n-jordan"]).toBeDefined();
  });

  it("leaves the crew standing for whoever is still out", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    expect(db.crews).toHaveLength(1);
    expect(db.crews[0]!.members.map((m) => m.travelerId)).toEqual(["jordan"]);
  });

  it("removes a crew nobody is left in", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    deleteAccount(db, "jordan", T0);
    expect(db.crews).toEqual([]);
  });

  it("scrubs them from a shared round without deleting other players' history", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    const shared = db.rounds.find((r) => r.id === "r1")!;
    expect(shared.players.map((p) => p.id)).toEqual(["jordan"]);
    expect(shared.winnerId).toBeUndefined();
    expect(shared.loserId).toBe("jordan");
    expect(shared.guesses).toEqual({ jordan: 20 });
  });

  it("removes a round that was only theirs", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    expect(db.rounds.map((r) => r.id)).toEqual(["r1"]);
  });

  it("ends their sessions, so an open phone cannot keep using the account", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    expect(db.sessions.map((s) => s.userId)).toEqual(["jordan"]);
  });

  it("is idempotent", () => {
    const db = populated();
    deleteAccount(db, "sam", T0);
    expect(() => deleteAccount(db, "sam", T0)).not.toThrow();
    expect(residualReferences(db, "sam")).toEqual([]);
  });
});
