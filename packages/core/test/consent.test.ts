import { describe, expect, it } from "vitest";
import { MAX_GRANT_HOURS, activeGrantsFor, canRead, claimGrant, createGrant, isGrantActive, revokeGrant } from "../src/consent.ts";
import { canActOnNight, canReadAccount, canReadScope, canRevokeGrant } from "../src/authz.ts";

const T0 = new Date("2026-01-01T20:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const grant = () =>
  createGrant({ id: "g1", travelerId: "t1", guardianId: "g-alex", inviteCode: "SAFE-1111", scopes: ["location", "drinks"], now: T0, hours: 8, createdBy: "t1" });

describe("share grants", () => {
  it("can only be created by the person being located", () => {
    expect(() =>
      createGrant({ id: "g1", travelerId: "t1", guardianId: "g-alex", inviteCode: "SAFE-4449", scopes: ["location"], now: T0, hours: 8, createdBy: "g-alex" }),
    ).toThrow(/only the person being located/i);
  });

  it("is always visible to the traveler — there is no covert mode", () => {
    expect(grant().visibleToTraveler).toBe(true);
  });

  it("always expires, and cannot be granted open-endedly", () => {
    expect(new Date(grant().expiresAt).getTime()).toBeGreaterThan(T0.getTime());
    expect(() =>
      createGrant({ id: "g", travelerId: "t1", guardianId: "g1", inviteCode: "SAFE-4813", scopes: ["location"], now: T0, hours: MAX_GRANT_HOURS + 1, createdBy: "t1" }),
    ).toThrow();
    expect(() =>
      createGrant({ id: "g", travelerId: "t1", guardianId: "g1", inviteCode: "SAFE-4813", scopes: ["location"], now: T0, hours: 0, createdBy: "t1" }),
    ).toThrow();
  });

  it("requires at least one scope", () => {
    expect(() =>
      createGrant({ id: "g", travelerId: "t1", guardianId: "g1", inviteCode: "SAFE-4813", scopes: [], now: T0, hours: 4, createdBy: "t1" }),
    ).toThrow();
  });

  it("goes inactive at expiry", () => {
    expect(isGrantActive(grant(), at(7))).toBe(true);
    expect(isGrantActive(grant(), at(9))).toBe(false);
  });

  it("can be revoked unilaterally by the traveler at any time", () => {
    const revoked = revokeGrant(grant(), at(1), "t1");
    expect(isGrantActive(revoked, at(2))).toBe(false);
  });

  it("cannot be revoked by an unrelated party", () => {
    expect(() => revokeGrant(grant(), at(1), "someone-else")).toThrow();
  });

  it("enforces scope on reads", () => {
    const g = grant();
    expect(canRead(g, "location", at(1))).toBe(true);
    expect(canRead(g, "route", at(1))).toBe(false);
    expect(canRead(g, "location", at(9))).toBe(false);
  });

  it("lists active grants for the who-can-see-me screen", () => {
    const active = grant();
    const expired = createGrant({ id: "g2", travelerId: "t1", guardianId: "g-old", inviteCode: "SAFE-6577", scopes: ["location"], now: T0, hours: 1, createdBy: "t1" });
    expect(activeGrantsFor([active, expired], "t1", at(4)).map((g) => g.id)).toEqual(["g1"]);
  });
});

describe("claiming an invite", () => {
  const invite = () =>
    createGrant({ id: "g9", travelerId: "t1", inviteCode: "SAFE-2024", scopes: ["location"], now: T0, hours: 8, createdBy: "t1" });

  it("is unclaimed on creation, so a leaked code grants nobody access", () => {
    const g = invite();
    expect(g.guardianId).toBeNull();
    expect(canRead(g, "location", at(1))).toBe(true); // scope+liveness only
    expect(canReadScope("anyone", g, "location", at(1))).toBe(false); // no bound guardian
  });

  it("binds to exactly one guardian", () => {
    const claimed = claimGrant(invite(), "g-alex", at(1));
    expect(claimed.guardianId).toBe("g-alex");
    expect(claimed.claimedAt).toBeDefined();
    expect(canReadScope("g-alex", claimed, "location", at(2))).toBe(true);
  });

  it("refuses a second person with the same code", () => {
    const claimed = claimGrant(invite(), "g-alex", at(1));
    expect(() => claimGrant(claimed, "g-someone-else", at(2))).toThrow(/already been claimed/i);
  });

  it("is idempotent for the guardian who already holds it", () => {
    const claimed = claimGrant(invite(), "g-alex", at(1));
    expect(claimGrant(claimed, "g-alex", at(3)).guardianId).toBe("g-alex");
  });

  it("cannot be claimed once expired or revoked", () => {
    expect(() => claimGrant(invite(), "g-alex", at(9))).toThrow(/expired or been revoked/i);
    const revoked = revokeGrant(invite(), at(1), "t1");
    expect(() => claimGrant(revoked, "g-alex", at(2))).toThrow();
  });

  it("refuses a traveler watching their own night", () => {
    expect(() => claimGrant(invite(), "t1", at(1))).toThrow(/your own night/i);
  });
});

describe("authorization predicates", () => {
  const night = { id: "n1", travelerId: "t1" } as any;
  const claimed = claimGrant(
    createGrant({ id: "g", travelerId: "t1", inviteCode: "SAFE-7777", scopes: ["location"], now: T0, hours: 8, createdBy: "t1" }),
    "g-alex", at(1),
  );

  it("lets only the traveler act on their night", () => {
    expect(canActOnNight("t1", night)).toBe(true);
    expect(canActOnNight("g-alex", night)).toBe(false);
    expect(canActOnNight(null, night)).toBe(false);
  });

  it("lets only the account owner read their account", () => {
    expect(canReadAccount("t1", "t1")).toBe(true);
    expect(canReadAccount("t2", "t1")).toBe(false);
    expect(canReadAccount(null, "t1")).toBe(false);
  });

  it("refuses a scope the grant does not carry", () => {
    expect(canReadScope("g-alex", claimed, "location", at(2))).toBe(true);
    expect(canReadScope("g-alex", claimed, "drinks", at(2))).toBe(false);
  });

  it("refuses a guardian who is not the bound one, and anonymous readers", () => {
    expect(canReadScope("g-mallory", claimed, "location", at(2))).toBe(false);
    expect(canReadScope(null, claimed, "location", at(2))).toBe(false);
  });

  it("stops at expiry even for the bound guardian", () => {
    expect(canReadScope("g-alex", claimed, "location", at(20))).toBe(false);
  });

  it("lets either party revoke, and nobody else", () => {
    expect(canRevokeGrant("t1", claimed)).toBe(true);
    expect(canRevokeGrant("g-alex", claimed)).toBe(true);
    expect(canRevokeGrant("g-mallory", claimed)).toBe(false);
    expect(canRevokeGrant(null, claimed)).toBe(false);
  });
});
