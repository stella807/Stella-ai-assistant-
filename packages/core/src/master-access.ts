import type { Iso8601 } from "./types.ts";

/**
 * Who can see everything, and what "everything" is allowed to mean.
 *
 * Until now the only privileged access was one shared secret in
 * `SAFEHUBBY_ADMIN_KEY` — good enough for reviewing driver applications from
 * a terminal, and wrong as the answer to "the founder and the secretary need
 * to see the whole operation". A shared secret has no idea who used it, so
 * nothing it does can be attributed, revoked for one person, or scoped.
 *
 * Two named roles instead:
 *
 *  - **owner** — the founder. Sees everything and can act.
 *  - **secretary** — runs the office. Sees everything operational, and is
 *    deliberately **not** given the two things that are not office work:
 *    moving money, and reading the contents of a customer's messages.
 *
 * The second restriction is the important one and it is not about trust. The
 * thread between a subscriber and their assistant is sealed at rest
 * specifically so the operator cannot read it (see crypto.ts); handing a
 * master account the plaintext would undo that for everyone at once. Support
 * can see that a thread exists, who is on it, and when — which is what
 * support actually needs — without reading what a frightened person typed at
 * 1am.
 */

export type MasterRole = "owner" | "secretary";

export type MasterScope =
  /** Customers, their plans and their subscription state. */
  | "customers"
  /** Tasks, the roster, dispatch, applications. */
  | "operations"
  /** Charges, payouts, the budget. */
  | "money"
  /** Change things, rather than only look at them. */
  | "write"
  /** The decrypted contents of a task's message thread. */
  | "message-contents";

const SCOPES: Record<MasterRole, MasterScope[]> = {
  owner: ["customers", "operations", "money", "write"],
  secretary: ["customers", "operations"],
};

/**
 * Nobody gets `message-contents`, including the owner.
 *
 * It is listed as a scope rather than omitted from the type so that the
 * refusal is explicit and testable: a future change that grants it has to
 * add it here deliberately, in a file whose comment says why not to, rather
 * than discovering that some route simply never checked.
 */
export const NEVER_GRANTED: MasterScope[] = ["message-contents"];

export interface MasterAccount {
  id: string;
  role: MasterRole;
  /** Who this is, for the audit trail. A master action attributed to "admin"
   *  tells you nothing a week later. */
  name: string;
  email: string;
  createdAt: Iso8601;
  /** Set when access is withdrawn. Kept rather than deleted, because the
   *  audit entries below still point at it. */
  revokedAt?: Iso8601;
}

export function scopesFor(role: MasterRole): MasterScope[] {
  return SCOPES[role] ?? [];
}

export function isActive(account: MasterAccount, now: Date): boolean {
  if (!account.revokedAt) return true;
  return now.getTime() < new Date(account.revokedAt).getTime();
}

export function canAccess(
  account: MasterAccount, scope: MasterScope, now: Date,
): boolean {
  if (!isActive(account, now)) return false;
  if (NEVER_GRANTED.includes(scope)) return false;
  return scopesFor(account.role).includes(scope);
}

/** Read-only unless the role carries `write`. The secretary runs the office;
 *  she does not move money or change somebody's plan. */
export function isReadOnly(account: MasterAccount): boolean {
  return !scopesFor(account.role).includes("write");
}

/**
 * One look at somebody's data, recorded.
 *
 * Master access without a trail is indistinguishable from a breach after the
 * fact — you cannot tell a support lookup from someone reading their ex's
 * location history. The entry is deliberately about *whose* data was seen,
 * not what was in it.
 */
export interface MasterAuditEntry {
  id: string;
  accountId: string;
  scope: MasterScope;
  /** What was looked at, in the app's own terms: "traveler usr_123",
   *  "task ct_456". Never the contents. */
  subject: string;
  at: Iso8601;
}

export function recordAccess(input: {
  id: string; account: MasterAccount; scope: MasterScope; subject: string; now: Date;
}): MasterAuditEntry {
  return {
    id: input.id,
    accountId: input.account.id,
    scope: input.scope,
    subject: input.subject,
    at: input.now.toISOString(),
  };
}

export function revoke(account: MasterAccount, now: Date): MasterAccount {
  return { ...account, revokedAt: now.toISOString() };
}
