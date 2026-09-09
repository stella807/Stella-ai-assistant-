import type { NightOut, TravelerId } from "./types.ts";
import { isGrantActive, type ShareGrant, type ShareScope } from "./consent.ts";

/**
 * Authorization predicates, kept pure and separate from the HTTP layer so the
 * rules can be tested exhaustively rather than inferred from route wiring.
 *
 * The governing rule: identity comes from the session, never from the request
 * body. Every function here takes the *authenticated* actor id — a route that
 * passes a body-supplied id into these has already lost.
 */

/** Only the traveler may act on their own night. */
export function canActOnNight(actorId: string | null, night: NightOut): boolean {
  return actorId !== null && actorId === night.travelerId;
}

/** Only the traveler may read their own account. */
export function canReadAccount(actorId: string | null, travelerId: TravelerId): boolean {
  return actorId !== null && actorId === travelerId;
}

/**
 * A guardian may read a scope only through a grant that is theirs, live, and
 * covers that scope. Unclaimed grants (guardianId null) match nobody, so a
 * leaked invite code grants no access on its own.
 */
export function canReadScope(
  actorId: string | null,
  grant: ShareGrant,
  scope: ShareScope,
  now: Date,
): boolean {
  if (actorId === null) return false;
  if (grant.guardianId !== actorId) return false;
  if (!isGrantActive(grant, now)) return false;
  return grant.scopes.includes(scope);
}

/** The traveler can always see their own grant; the bound guardian can too. */
export function canSeeGrant(actorId: string | null, grant: ShareGrant): boolean {
  if (actorId === null) return false;
  return actorId === grant.travelerId || actorId === grant.guardianId;
}

/** Either party may end sharing. Nobody else may. */
export function canRevokeGrant(actorId: string | null, grant: ShareGrant): boolean {
  return canSeeGrant(actorId, grant);
}
