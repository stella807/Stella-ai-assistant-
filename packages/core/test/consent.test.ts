import { describe, expect, it } from "vitest";
import { MAX_GRANT_HOURS, activeGrantsFor, canRead, createGrant, isGrantActive, revokeGrant } from "../src/consent.ts";

const T0 = new Date("2026-01-01T20:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const grant = () =>
  createGrant({ id: "g1", travelerId: "t1", guardianId: "g-alex", scopes: ["location", "drinks"], now: T0, hours: 8, createdBy: "t1" });

describe("share grants", () => {
  it("can only be created by the person being located", () => {
    expect(() =>
      createGrant({ id: "g1", travelerId: "t1", guardianId: "g-alex", scopes: ["location"], now: T0, hours: 8, createdBy: "g-alex" }),
    ).toThrow(/only the person being located/i);
  });

  it("is always visible to the traveler — there is no covert mode", () => {
    expect(grant().visibleToTraveler).toBe(true);
  });

  it("always expires, and cannot be granted open-endedly", () => {
    expect(new Date(grant().expiresAt).getTime()).toBeGreaterThan(T0.getTime());
    expect(() =>
      createGrant({ id: "g", travelerId: "t1", guardianId: "g1", scopes: ["location"], now: T0, hours: MAX_GRANT_HOURS + 1, createdBy: "t1" }),
    ).toThrow();
    expect(() =>
      createGrant({ id: "g", travelerId: "t1", guardianId: "g1", scopes: ["location"], now: T0, hours: 0, createdBy: "t1" }),
    ).toThrow();
  });

  it("requires at least one scope", () => {
    expect(() =>
      createGrant({ id: "g", travelerId: "t1", guardianId: "g1", scopes: [], now: T0, hours: 4, createdBy: "t1" }),
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
    const expired = createGrant({ id: "g2", travelerId: "t1", guardianId: "g-old", scopes: ["location"], now: T0, hours: 1, createdBy: "t1" });
    expect(activeGrantsFor([active, expired], "t1", at(4)).map((g) => g.id)).toEqual(["g1"]);
  });
});
