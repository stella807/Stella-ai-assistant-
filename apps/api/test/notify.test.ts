import { describe, expect, it } from "vitest";
import type { Alert } from "@safehubby/core";
import { guardianMessages } from "../src/notify.ts";
import { SEED } from "../src/seed.ts";
import type { Db } from "../src/store.ts";

const NOW = new Date("2026-01-01T23:30:00Z");
const iso = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: "n1:missed:c1", nightId: "n1", kind: "missed-check-in", severity: "warn",
  message: "A check-in was missed.", raisedAt: NOW.toISOString(), actions: [], ...over,
});

/** Sam is out, Jordan is watching from a claimed grant, with a device registered. */
function db(over: { scopes?: string[]; revokedAt?: string; expiresAt?: string; claimed?: boolean } = {}): Db {
  const base: Db = structuredClone(SEED);
  base.travelers.push({
    id: "sam", email: "sam@example.com", passwordHash: "x", displayName: "Sam",
    planId: "premium-plus", homeLabel: "Home", emergencyContacts: [],
  });
  base.nights.push({ id: "n1", travelerId: "sam" } as Db["nights"][number]);
  base.grants.push({
    id: "g1", travelerId: "sam",
    guardianId: over.claimed === false ? null : "jordan",
    inviteCode: "ABC-234",
    scopes: (over.scopes ?? ["check-ins"]) as never,
    grantedAt: NOW.toISOString(),
    expiresAt: over.expiresAt ?? iso(6),
    revokedAt: over.revokedAt,
    visibleToTraveler: true,
  });
  base.pushDevices.push({
    token: "jordan-device", platform: "ios", userId: "jordan", registeredAt: NOW.toISOString(),
  });
  return base;
}

describe("who actually gets buzzed", () => {
  it("reaches a watching guardian whose grant covers the alert", () => {
    const messages = guardianMessages(db(), [alert()], NOW);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.token).toBe("jordan-device");
    expect(messages[0]!.title).toBe("Sam");
  });

  it("STOPS the moment the grant is revoked", () => {
    // The whole product refuses tracking that outlives consent. A push channel
    // that keeps buzzing after a revoke would be exactly that, by another name.
    expect(guardianMessages(db({ revokedAt: NOW.toISOString() }), [alert()], NOW)).toEqual([]);
  });

  it("stops when the grant has expired", () => {
    expect(guardianMessages(db({ expiresAt: iso(-1) }), [alert()], NOW)).toEqual([]);
  });

  it("sends nothing for an invite nobody has claimed", () => {
    // A leaked code must not become a notification feed.
    expect(guardianMessages(db({ claimed: false }), [alert()], NOW)).toEqual([]);
  });

  it("respects the grant's scope for a routine alert", () => {
    const locationOnly = db({ scopes: ["location"] });
    expect(guardianMessages(locationOnly, [alert()], NOW)).toEqual([]);
    expect(guardianMessages(locationOnly, [alert({ kind: "drink-limit-reached" })], NOW)).toEqual([]);
  });

  it("still reaches a narrowly scoped guardian for an SOS", () => {
    const messages = guardianMessages(
      db({ scopes: ["route"] }),
      [alert({ id: "n1:sos", kind: "sos", severity: "urgent", message: "SOS triggered." })],
      NOW,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]!.title).toMatch(/SOS/);
    expect(messages[0]!.interruption).toBe("time-sensitive");
  });

  it("keeps coordinates off the lock screen", () => {
    const messages = guardianMessages(
      db({ scopes: ["location"] }),
      [alert({ id: "n1:sos", kind: "sos", severity: "urgent", message: "SOS at 40.7148, -74.0018." })],
      NOW,
    );
    expect(messages[0]!.body).not.toMatch(/40\.7148/);
  });

  it("ignores an alert for a night that is not there", () => {
    expect(guardianMessages(db(), [alert({ nightId: "gone" })], NOW)).toEqual([]);
  });
});

describe("expired sessions", () => {
  it("are swept, so logging in does not grow the store forever", async () => {
    const { sweepExpiredSessions } = await import("../src/auth.ts");
    const now = new Date("2026-01-02T00:00:00Z");
    const kept = sweepExpiredSessions(
      [
        { token: "live", expiresAt: "2026-01-03T00:00:00Z" },
        { token: "dead", expiresAt: "2026-01-01T00:00:00Z" },
        { token: "just-expired", expiresAt: "2026-01-02T00:00:00Z" },
      ],
      now,
    );
    expect(kept.map((s) => s.token)).toEqual(["live"]);
  });
});
