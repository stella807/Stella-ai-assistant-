import type { GuardianId, Iso8601, TravelerId } from "./types.ts";

/**
 * Location sharing is consent-gated and time-boxed by construction.
 *
 * The failure mode for an app like this is not a bug, it is a feature request:
 * "let me watch him without him knowing". Covert tracking of a partner is
 * stalking, and in many places it is a crime. So the domain makes it
 * unrepresentable — a grant is created only by the traveler, always carries an
 * expiry, is always disclosed, and can be revoked unilaterally at any time.
 * There is no hidden-mode flag to flip later.
 */

export type ShareScope = "location" | "drinks" | "check-ins" | "route";

export interface ShareGrant {
  id: string;
  travelerId: TravelerId;
  guardianId: GuardianId;
  scopes: ShareScope[];
  grantedAt: Iso8601;
  expiresAt: Iso8601;
  revokedAt?: Iso8601;
  /**
   * Always true. The traveler's device shows a persistent indicator whenever a
   * grant is live. Kept in the type so no adapter can quietly omit it.
   */
  visibleToTraveler: true;
}

export const MAX_GRANT_HOURS = 24;

export interface CreateGrantInput {
  id: string;
  travelerId: TravelerId;
  guardianId: GuardianId;
  scopes: ShareScope[];
  now: Date;
  hours: number;
  /** Must be the traveler. A guardian cannot grant themselves access. */
  createdBy: TravelerId;
}

export function createGrant(input: CreateGrantInput): ShareGrant {
  if (input.createdBy !== input.travelerId) {
    throw new Error("Only the person being located can grant access to their location.");
  }
  if (input.scopes.length === 0) throw new Error("A grant must include at least one scope.");
  if (input.hours <= 0 || input.hours > MAX_GRANT_HOURS) {
    throw new Error(`Grant length must be between 0 and ${MAX_GRANT_HOURS} hours.`);
  }

  return {
    id: input.id,
    travelerId: input.travelerId,
    guardianId: input.guardianId,
    scopes: [...input.scopes],
    grantedAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + input.hours * 3_600_000).toISOString(),
    visibleToTraveler: true,
  };
}

export function revokeGrant(grant: ShareGrant, now: Date, revokedBy: string): ShareGrant {
  if (revokedBy !== grant.travelerId && revokedBy !== grant.guardianId) {
    throw new Error("Only the traveler or the guardian can revoke a grant.");
  }
  return { ...grant, revokedAt: now.toISOString() };
}

export function isGrantActive(grant: ShareGrant, now: Date): boolean {
  if (grant.revokedAt) return false;
  return new Date(grant.expiresAt).getTime() > now.getTime();
}

export function canRead(grant: ShareGrant, scope: ShareScope, now: Date): boolean {
  return isGrantActive(grant, now) && grant.scopes.includes(scope);
}

/** Every active grant, for the always-visible "who can see me" screen. */
export function activeGrantsFor(grants: ShareGrant[], travelerId: TravelerId, now: Date): ShareGrant[] {
  return grants.filter((g) => g.travelerId === travelerId && isGrantActive(g, now));
}
