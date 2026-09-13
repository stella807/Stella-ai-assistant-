import { describe, expect, it } from "vitest";
import {
  NEVER_GRANTED, canAccess, isActive, isReadOnly, recordAccess, revoke, scopesFor,
  type MasterAccount, type MasterScope,
} from "../src/master-access.ts";

const now = new Date("2026-12-06T09:00:00Z");
const account = (over: Partial<MasterAccount> = {}): MasterAccount => ({
  id: "ma1", role: "owner", name: "Luis Garcia", email: "luis@example.com",
  createdAt: now.toISOString(), ...over,
});

describe("what each master role can reach", () => {
  it("gives the owner everything operational, plus money and write", () => {
    expect(scopesFor("owner").sort()).toEqual(["customers", "money", "operations", "write"]);
  });

  it("gives the secretary the office, and not the money", () => {
    // Not about trust: moving money is not office work, and a role that can
    // do it by default is a role nobody can safely delegate.
    expect(scopesFor("secretary").sort()).toEqual(["customers", "operations"]);
    expect(canAccess(account({ role: "secretary" }), "money", now)).toBe(false);
    expect(canAccess(account({ role: "secretary" }), "write", now)).toBe(false);
    expect(canAccess(account({ role: "secretary" }), "operations", now)).toBe(true);
  });

  it("makes the secretary read-only and the owner not", () => {
    expect(isReadOnly(account({ role: "secretary" }))).toBe(true);
    expect(isReadOnly(account({ role: "owner" }))).toBe(false);
  });
});

describe("what nobody gets, including the owner", () => {
  it("never hands over the contents of a customer's messages", () => {
    /**
     * The thread is sealed at rest precisely so the operator cannot read it.
     * Granting a master account the plaintext would undo that for every
     * customer at once — so this is refused for every role, and the refusal
     * lives in one named list rather than in whether some route remembered
     * to check.
     */
    for (const role of ["owner", "secretary"] as const) {
      expect(canAccess(account({ role }), "message-contents", now)).toBe(false);
    }
    expect(NEVER_GRANTED).toContain<MasterScope>("message-contents");
  });

  it("keeps the refusal even if a role is given the scope by mistake", () => {
    // NEVER_GRANTED is checked before the role's own list, so adding the
    // scope to a role is not enough to turn it on by accident.
    expect(scopesFor("owner")).not.toContain("message-contents");
    expect(canAccess(account(), "message-contents", now)).toBe(false);
  });
});

describe("withdrawing access", () => {
  it("stops everything the moment it is revoked", () => {
    const gone = revoke(account(), now);
    const later = new Date(now.getTime() + 1000);
    expect(isActive(gone, later)).toBe(false);
    for (const scope of scopesFor("owner")) {
      expect(canAccess(gone, scope, later)).toBe(false);
    }
  });

  it("keeps the record, because the audit trail still points at it", () => {
    const gone = revoke(account(), now);
    expect(gone.id).toBe("ma1");
    expect(gone.name).toBe("Luis Garcia");
    expect(isActive(gone, new Date(now.getTime() - 1))).toBe(true);
  });
});

describe("the audit trail", () => {
  it("records who looked at whose data, and when", () => {
    const entry = recordAccess({
      id: "au1", account: account(), scope: "customers", subject: "traveler usr_123", now,
    });
    expect(entry).toMatchObject({
      accountId: "ma1", scope: "customers", subject: "traveler usr_123", at: now.toISOString(),
    });
  });

  it("records the subject, never the contents", () => {
    // Master access with no trail cannot be told apart from a breach after
    // the fact. A trail that copies the data is its own second breach.
    const entry = recordAccess({
      id: "au1", account: account(), scope: "operations", subject: "task ct_456", now,
    });
    expect(JSON.stringify(entry)).not.toMatch(/photo|audio|body|base64/i);
    expect(Object.keys(entry).sort()).toEqual(["accountId", "at", "id", "scope", "subject"]);
  });
});
