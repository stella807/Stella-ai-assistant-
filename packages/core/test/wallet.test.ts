import { describe, expect, it } from "vitest";
import {
  buildStatement, chargesFor, describeRail, failCharge, isDigital, kindLabel,
  railFor, railsUsed, recordCharge, refundCharge, settleCharge,
} from "../src/wallet.ts";
import type { Charge, ChargeKind, Platform } from "../src/wallet.ts";

const now = new Date("2026-03-01T20:00:00Z");

const charge = (over: Partial<Parameters<typeof recordCharge>[0]> = {}) =>
  recordCharge({
    id: "ch_1", travelerId: "t1", kind: "ride", platform: "web",
    description: "Ride home", amountCents: 2400, now, ...over,
  });

describe("railFor", () => {
  it("sends an in-app subscription to the store that requires it", () => {
    expect(railFor("subscription", "ios")).toBe("app-store");
    expect(railFor("subscription", "android")).toBe("play-store");
  });

  it("sends a subscription bought on the web to the card", () => {
    expect(railFor("subscription", "web")).toBe("card");
  });

  it("never routes a real-world service or physical goods through in-app purchase", () => {
    // Apple and Google both forbid this, and a build that does it gets rejected.
    const physical: ChargeKind[] = ["ride", "secure-transport", "delivery", "supplies"];
    const platforms: Platform[] = ["web", "ios", "android"];
    for (const kind of physical) {
      for (const platform of platforms) {
        expect(railFor(kind, platform)).toBe("card");
      }
    }
  });

  it("treats only the subscription as digital", () => {
    expect(isDigital("subscription")).toBe(true);
    expect(isDigital("supplies")).toBe(false);
  });

  it("explains each rail in words a user can act on", () => {
    expect(describeRail("app-store")).toMatch(/Apple/);
    expect(describeRail("play-store")).toMatch(/Google Play/);
    expect(describeRail("card")).toMatch(/card on file/);
  });
});

describe("recordCharge", () => {
  it("starts pending and stamps the rail from the kind and platform", () => {
    const c = charge({ kind: "subscription", platform: "ios", description: "Premium Plus" });
    expect(c.status).toBe("pending");
    expect(c.rail).toBe("app-store");
    expect(c.currency).toBe("USD");
  });

  it("refuses an amount that is not positive whole cents", () => {
    expect(() => charge({ amountCents: 0 })).toThrow();
    expect(() => charge({ amountCents: -100 })).toThrow();
    expect(() => charge({ amountCents: 12.5 })).toThrow();
  });

  it("refuses a line with nothing on it to read", () => {
    expect(() => charge({ description: "   " })).toThrow();
  });

  it("carries the hold it will be captured from", () => {
    expect(charge({ holdId: "hold_9" }).holdId).toBe("hold_9");
  });
});

describe("settling", () => {
  it("settles at the real cost, which is usually under the authorization", () => {
    const settled = settleCharge(charge(), now, 1980, "trip_7");
    expect(settled.status).toBe("settled");
    expect(settled.amountCents).toBe(1980);
    expect(settled.reference).toBe("trip_7");
  });

  it("cannot settle above what was authorized — the hold ceiling holds here too", () => {
    expect(() => settleCharge(charge(), now, 9900)).toThrow(/exceeds the authorized/);
  });

  it("cannot settle twice", () => {
    const settled = settleCharge(charge(), now);
    expect(() => settleCharge(settled, now)).toThrow();
  });

  it("keeps a failed charge on the ledger with the reason", () => {
    const failed = failCharge(charge(), "Card declined", now);
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("Card declined");
  });

  it("only refunds money that was actually taken", () => {
    expect(() => refundCharge(charge(), now)).toThrow();
    expect(refundCharge(settleCharge(charge(), now), now).status).toBe("refunded");
  });
});

describe("buildStatement", () => {
  const lines = (): Charge[] => [
    settleCharge(recordCharge({ id: "c1", travelerId: "t1", kind: "subscription", platform: "ios", description: "Premium Plus", amountCents: 2999, now }), now),
    settleCharge(recordCharge({ id: "c2", travelerId: "t1", kind: "ride", platform: "ios", description: "Ride home", amountCents: 2400, now }), now, 2100),
    settleCharge(recordCharge({ id: "c3", travelerId: "t1", kind: "ride", platform: "ios", description: "Ride home", amountCents: 1800, now }), now),
    recordCharge({ id: "c4", travelerId: "t1", kind: "supplies", platform: "ios", description: "Pharmacy run", amountCents: 3200, now }),
    failCharge(recordCharge({ id: "c5", travelerId: "t1", kind: "ride", platform: "ios", description: "Ride home", amountCents: 5000, now }), "Declined", now),
    settleCharge(recordCharge({ id: "c6", travelerId: "t2", kind: "ride", platform: "web", description: "Someone else", amountCents: 9999, now }), now),
  ];

  it("adds up one person's month across every rail at once", () => {
    const s = buildStatement(lines(), "t1", now);
    // 2999 subscription (App Store) + 2100 + 1800 rides (card).
    expect(s.settledCents).toBe(6899);
    expect(s.pendingCents).toBe(3200);
    expect(s.rails).toEqual(["card", "app-store"]);
  });

  it("groups by what the money went to, largest first", () => {
    const s = buildStatement(lines(), "t1", now);
    expect(s.lines.map((l) => l.kind)).toEqual(["ride", "supplies", "subscription"]);
    expect(s.lines[0]).toMatchObject({ count: 2, cents: 3900, label: "Rides home" });
  });

  it("leaves out money that was never taken", () => {
    const s = buildStatement(lines(), "t1", now);
    expect(s.lines.find((l) => l.kind === "ride")!.count).toBe(2);
  });

  it("does not leak another traveler's charges", () => {
    expect(chargesFor(lines(), "t1").every((c) => c.travelerId === "t1")).toBe(true);
    expect(buildStatement(lines(), "t2", now).settledCents).toBe(9999);
  });

  it("only covers the window asked for", () => {
    const old = recordCharge({ id: "old", travelerId: "t1", kind: "ride", platform: "web", description: "Last year", amountCents: 4000, now: new Date("2025-01-01T00:00:00Z") });
    const s = buildStatement([...lines(), old], "t1", now);
    expect(s.pendingCents).toBe(3200);
  });

  it("is empty and safe with no charges at all", () => {
    const s = buildStatement([], "t1", now);
    expect(s.lines).toEqual([]);
    expect(s.settledCents).toBe(0);
    expect(s.rails).toEqual([]);
    expect(s.currency).toBe("USD");
  });

  it("labels every kind", () => {
    const kinds: ChargeKind[] = ["subscription", "ride", "secure-transport", "delivery", "supplies"];
    for (const k of kinds) expect(kindLabel(k).length).toBeGreaterThan(0);
  });

  it("reports rails in a stable display order", () => {
    expect(railsUsed(lines())).toEqual(["card", "app-store"]);
  });
});
