import type { Alert, PushMessage, SmsMessage, TextAlertKind } from "@safehubby/core";
import { canEmail, composeEmail } from "@safehubby/core";
import type { OutboundEmail } from "./adapters/email.ts";
import { activeGrantsFor, canText, composeText, devicesFor, isEntitled, messagesForAlert } from "@safehubby/core";
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

export const textKey = (who: "traveler" | "assistant", id: string) => `${who}:${id}`;

/** One text to one person, or nothing if they never agreed to texts or have opted out. */
export function textTo(db: Db, key: string, kind: TextAlertKind, name?: string): SmsMessage[] {
  const contact = db.textContacts[key];
  if (!canText(contact)) return [];
  return [{ to: contact.phone, body: composeText(kind, { name }, contact.language) }];
}

/**
 * The texts a guardian gets for an alert. Same rule as the push: only what
 * their live, unexpired grant entitles them to, re-read every time — and only
 * the two alerts worth waking someone for, an SOS and a missed check-in.
 */
export function guardianTexts(db: Db, alerts: Alert[], now: Date): SmsMessage[] {
  return alerts.flatMap((alert) => {
    const kind: TextAlertKind | null =
      alert.kind === "sos" ? "guardian-sos" : alert.kind === "missed-check-in" ? "guardian-missed-checkin" : null;
    if (!kind) return [];
    const night = db.nights.find((n) => n.id === alert.nightId);
    if (!night) return [];
    const traveler = db.travelers.find((t) => t.id === night.travelerId);
    return activeGrantsFor(db.grants, night.travelerId, now)
      .filter((g) => g.guardianId !== null && isEntitled(alert, g.scopes))
      .flatMap((g) => textTo(db, textKey("traveler", g.guardianId!), kind, traveler?.displayName));
  });
}

/** One email to one person, or nothing if they never agreed to email alerts or have turned them off. */
export function emailTo(db: Db, key: string, kind: TextAlertKind, name?: string): OutboundEmail[] {
  const contact = db.emailContacts?.[key];
  if (!canEmail(contact)) return [];
  const { subject, body } = composeEmail(kind, { name }, contact.language);
  return [{ to: contact.email, subject, body }];
}

/** The same two guardian alerts as `guardianTexts`, to the same people, by email. */
export function guardianEmails(db: Db, alerts: Alert[], now: Date): OutboundEmail[] {
  return alerts.flatMap((alert) => {
    const kind: TextAlertKind | null =
      alert.kind === "sos" ? "guardian-sos" : alert.kind === "missed-check-in" ? "guardian-missed-checkin" : null;
    if (!kind) return [];
    const night = db.nights.find((n) => n.id === alert.nightId);
    if (!night) return [];
    const traveler = db.travelers.find((t) => t.id === night.travelerId);
    return activeGrantsFor(db.grants, night.travelerId, now)
      .filter((g) => g.guardianId !== null && isEntitled(alert, g.scopes))
      .flatMap((g) => emailTo(db, textKey("traveler", g.guardianId!), kind, traveler?.displayName));
  });
}
