import type { Alert, AlertKind, AlertSeverity, GuardianId, Iso8601 } from "./types.ts";
import type { ShareScope } from "./consent.ts";

/**
 * Push to the person waiting up.
 *
 * Local notifications already cover the traveler's own check-in reminders. This
 * is the other half: the guardian's phone is in their pocket and the app is
 * closed, and a missed check-in that sits in a database until they next open
 * the app is not a alert — it is a log entry.
 *
 * Everything here is pure. Who is entitled to be told what, how loudly, and
 * what the notification is allowed to say are exactly the decisions worth
 * testing, and none of them need a network.
 */

export type PushPlatform = "ios" | "android" | "web";

export interface PushDevice {
  token: string;
  platform: PushPlatform;
  /** The guardian this device belongs to. Devices are per-account, not per-night. */
  userId: GuardianId;
  registeredAt: Iso8601;
}

/**
 * How hard the notification is allowed to push through.
 *
 * Deliberately not "critical" for anything: iOS critical alerts break Do Not
 * Disturb and the volume setting, and they need an entitlement Apple grants
 * case by case. Claiming the level without the entitlement does not fail
 * loudly — the notification just silently degrades, which is the worst
 * outcome for the one message that mattered. Time-sensitive is what an app
 * can actually ask for, and it does break through Focus.
 */
export type InterruptionLevel = "passive" | "active" | "time-sensitive";

const INTERRUPTION: Record<AlertSeverity, InterruptionLevel> = {
  info: "passive",
  warn: "active",
  urgent: "time-sensitive",
};

export interface PushMessage {
  token: string;
  platform: PushPlatform;
  title: string;
  body: string;
  interruption: InterruptionLevel;
  /** Carried so a client can open straight to the night, and so sends are traceable. */
  alertId: string;
  nightId: string;
}

export interface PushRecipient {
  guardianId: GuardianId;
  /** Scopes on this guardian's live grant for the traveler. */
  scopes: ShareScope[];
  devices: PushDevice[];
}

/**
 * Which scope an alert needs before a guardian is told about it.
 *
 * A grant is a consent boundary, not a subscription list: someone who was
 * given check-ins should not learn how much was drunk because the phone
 * buzzed. Kinds absent from this table are ungated — SOS, and the status
 * updates the guardian is sitting up waiting for.
 */
const SCOPE_FOR_KIND: Partial<Record<AlertKind, ShareScope>> = {
  "missed-check-in": "check-ins",
  "drink-limit-reached": "drinks",
  "fast-pace": "drinks",
};

/**
 * Urgent alerts ignore the scope table.
 *
 * Someone holding a live grant of any kind, whose person has just triggered an
 * SOS or crossed into the danger band, gets told. Scoping that down to whoever
 * happened to be granted the matching category would be the app rationing the
 * one message it exists to deliver.
 */
export function isEntitled(alert: Alert, scopes: ShareScope[]): boolean {
  if (alert.severity === "urgent") return true;
  const needed = SCOPE_FOR_KIND[alert.kind];
  return needed === undefined || scopes.includes(needed);
}

/** Decimal coordinate pairs, e.g. "40.7148, -74.0018". */
const COORDINATES = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

/**
 * Strips coordinates out of anything bound for a lock screen.
 *
 * A push body is readable by whoever is holding the phone, without unlocking
 * it. On this app that is a specific hazard rather than a general one: the
 * whole product is one person knowing where another is, and the notification
 * is the one surface that shows up without an unlock. The map is behind the
 * lock screen; the buzz says to go look at it.
 *
 * Today no alert message interpolates a position. This is here so that the day
 * one does, it does not become a lock-screen broadcast of where someone is.
 */
export function redactLocation(text: string): string {
  return text.replace(COORDINATES, "a location on the map");
}

export interface BuildPushInput {
  alert: Alert;
  /** Shown so a guardian watching two people knows which one this is. */
  travelerName: string;
  recipients: PushRecipient[];
}

export function messagesForAlert({ alert, travelerName, recipients }: BuildPushInput): PushMessage[] {
  const body = redactLocation(alert.message);
  const title = alert.kind === "sos" ? `${travelerName} triggered an SOS` : travelerName;

  return recipients
    .filter((r) => isEntitled(alert, r.scopes))
    .flatMap((r) =>
      r.devices.map((d): PushMessage => ({
        token: d.token,
        platform: d.platform,
        title,
        body,
        interruption: INTERRUPTION[alert.severity],
        alertId: alert.id,
        nightId: alert.nightId,
      })),
    );
}

export interface RegisterDeviceInput {
  token: string;
  platform: string;
  userId: GuardianId;
  now: Date;
}

const PLATFORMS: PushPlatform[] = ["ios", "android", "web"];

export function registerDevice(input: RegisterDeviceInput): PushDevice {
  const token = input.token.trim();
  if (token.length < 8) throw new Error("That does not look like a push token.");
  if (!PLATFORMS.includes(input.platform as PushPlatform)) {
    throw new Error(`Unknown platform: ${input.platform}`);
  }
  return {
    token,
    platform: input.platform as PushPlatform,
    userId: input.userId,
    registeredAt: input.now.toISOString(),
  };
}

/**
 * One row per device, newest registration winning.
 *
 * Re-registering is normal — providers rotate tokens, and the client registers
 * on every launch — so this replaces rather than accumulating, or a guardian
 * who has opened the app fifty times gets fifty copies of every alert.
 */
export function upsertDevice(devices: PushDevice[], device: PushDevice): PushDevice[] {
  return [...devices.filter((d) => d.token !== device.token), device];
}

export function devicesFor(devices: PushDevice[], userId: GuardianId): PushDevice[] {
  return devices.filter((d) => d.userId === userId);
}
