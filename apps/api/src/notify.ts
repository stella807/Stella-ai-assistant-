import type { Alert, PushMessage } from "@safehubby/core";
import { activeGrantsFor, devicesFor, messagesForAlert } from "@safehubby/core";
import type { Db } from "./store.ts";

/**
 * Turns raised alerts into the pushes that should actually go out.
 *
 * Separate from the route so the consent boundary is testable without a push
 * provider: with nothing configured the sender is a no-op, and a no-op cannot
 * be observed doing the wrong thing. This is the function that decides whether
 * a revoked guardian's phone still buzzes, which is not a decision to leave
 * uncovered.
 *
 * Entitlement is read from the live grants every time. Nothing is cached, so a
 * revoked grant, an expired one, or an unclaimed invite stops delivery on the
 * next alert rather than whenever some subscription list is next reconciled.
 */
export function guardianMessages(db: Db, alerts: Alert[], now: Date): PushMessage[] {
  return alerts.flatMap((alert) => {
    const night = db.nights.find((n) => n.id === alert.nightId);
    if (!night) return [];

    const traveler = db.travelers.find((t) => t.id === night.travelerId);
    const recipients = activeGrantsFor(db.grants, night.travelerId, now)
      .filter((g) => g.guardianId !== null)
      .map((g) => ({
        guardianId: g.guardianId!,
        scopes: g.scopes,
        devices: devicesFor(db.pushDevices, g.guardianId!),
      }));

    return messagesForAlert({
      alert,
      travelerName: traveler?.displayName ?? "Someone you're watching",
      recipients,
    });
  });
}
