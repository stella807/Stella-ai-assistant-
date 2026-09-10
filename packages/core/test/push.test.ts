import { describe, expect, it } from "vitest";
import type { Alert, AlertKind, AlertSeverity } from "../src/types.ts";
import {
  devicesFor, isEntitled, messagesForAlert, redactLocation, registerDevice, upsertDevice,
  type PushDevice, type PushRecipient,
} from "../src/push.ts";

const T0 = new Date("2026-01-01T23:30:00Z");

const alert = (kind: AlertKind, severity: AlertSeverity, message = "Something happened."): Alert => ({
  id: `n1:${kind}`, nightId: "n1", kind, severity, message, raisedAt: T0.toISOString(), actions: [],
});

const device = (token: string, userId = "jordan"): PushDevice => ({
  token, platform: "ios", userId, registeredAt: T0.toISOString(),
});

const recipient = (scopes: PushRecipient["scopes"], userId = "jordan"): PushRecipient => ({
  guardianId: userId, scopes, devices: [device(`tok-${userId}`, userId)],
});

describe("who is entitled to be told", () => {
  it("gates a drink alert behind the drinks scope", () => {
    expect(isEntitled(alert("drink-limit-reached", "warn"), ["drinks"])).toBe(true);
    expect(isEntitled(alert("drink-limit-reached", "warn"), ["location"])).toBe(false);
  });

  it("gates a missed check-in behind the check-ins scope", () => {
    expect(isEntitled(alert("missed-check-in", "warn"), ["check-ins"])).toBe(true);
    expect(isEntitled(alert("missed-check-in", "warn"), ["drinks"])).toBe(false);
  });

  it("tells every live guardian about an SOS, whatever their scope", () => {
    // Rationing the one message the app exists to deliver, on the grounds that
    // someone was granted the wrong category, would be indefensible.
    for (const scopes of [["location"], ["drinks"], ["route"], ["check-ins"]] as const) {
      expect(isEntitled(alert("sos", "urgent"), [...scopes])).toBe(true);
    }
  });

  it("lets any urgent alert through a narrow grant", () => {
    expect(isEntitled(alert("fast-pace", "urgent"), ["route"])).toBe(true);
    // The same kind at a lower severity stays gated.
    expect(isEntitled(alert("fast-pace", "warn"), ["route"])).toBe(false);
  });

  it("never gates the status updates a guardian is waiting up for", () => {
    expect(isEntitled(alert("home-safe", "info"), ["route"])).toBe(true);
    expect(isEntitled(alert("heading-home", "info"), ["drinks"])).toBe(true);
  });
});

describe("what the lock screen is allowed to say", () => {
  it("strips coordinates out of a body", () => {
    const out = redactLocation("Last seen at 40.7148, -74.0018 and not answering.");
    expect(out).not.toMatch(/40\.7148/);
    expect(out).not.toMatch(/-74\.0018/);
    expect(out).toContain("a location on the map");
  });

  it("leaves ordinary numbers alone", () => {
    expect(redactLocation("Drink count reached 4, the limit you both agreed on."))
      .toBe("Drink count reached 4, the limit you both agreed on.");
  });

  it("redacts through the message builder, not just the helper", () => {
    const messages = messagesForAlert({
      alert: alert("sos", "urgent", "SOS triggered at 40.7148, -74.0018."),
      travelerName: "Sam",
      recipients: [recipient(["location"])],
    });
    expect(messages[0]!.body).not.toMatch(/40\.7148/);
  });
});

describe("building the messages", () => {
  it("sends one per device, to entitled guardians only", () => {
    const messages = messagesForAlert({
      alert: alert("drink-limit-reached", "warn"),
      travelerName: "Sam",
      recipients: [
        { guardianId: "jordan", scopes: ["drinks"], devices: [device("a", "jordan"), device("b", "jordan")] },
        { guardianId: "riley", scopes: ["location"], devices: [device("c", "riley")] },
      ],
    });
    expect(messages.map((m) => m.token).sort()).toEqual(["a", "b"]);
  });

  it("names the traveler so a guardian watching two people can tell them apart", () => {
    const [m] = messagesForAlert({
      alert: alert("missed-check-in", "warn"),
      travelerName: "Sam",
      recipients: [recipient(["check-ins"])],
    });
    expect(m!.title).toBe("Sam");
  });

  it("says plainly in the title when it is an SOS", () => {
    const [m] = messagesForAlert({
      alert: alert("sos", "urgent"),
      travelerName: "Sam",
      recipients: [recipient(["location"])],
    });
    expect(m!.title).toBe("Sam triggered an SOS");
  });

  it("maps severity onto how hard it pushes through", () => {
    const level = (severity: AlertSeverity) =>
      messagesForAlert({
        alert: alert("missed-check-in", severity),
        travelerName: "Sam",
        recipients: [recipient(["check-ins"])],
      })[0]!.interruption;

    expect(level("info")).toBe("passive");
    expect(level("warn")).toBe("active");
    expect(level("urgent")).toBe("time-sensitive");
  });

  it("never claims the critical level, which needs an Apple entitlement", () => {
    const levels = (["info", "warn", "urgent"] as AlertSeverity[]).map((s) =>
      messagesForAlert({
        alert: alert("sos", s), travelerName: "Sam", recipients: [recipient(["location"])],
      })[0]!.interruption,
    );
    expect(levels).not.toContain("critical");
  });

  it("sends nothing when nobody is watching", () => {
    expect(messagesForAlert({ alert: alert("sos", "urgent"), travelerName: "Sam", recipients: [] }))
      .toEqual([]);
  });

  it("sends nothing to a guardian with no registered device", () => {
    const messages = messagesForAlert({
      alert: alert("sos", "urgent"),
      travelerName: "Sam",
      recipients: [{ guardianId: "jordan", scopes: ["location"], devices: [] }],
    });
    expect(messages).toEqual([]);
  });
});

describe("device registration", () => {
  it("rejects a token that is obviously not one", () => {
    expect(() => registerDevice({ token: "  ", platform: "ios", userId: "jordan", now: T0 })).toThrow();
    expect(() => registerDevice({ token: "short", platform: "ios", userId: "jordan", now: T0 })).toThrow();
  });

  it("rejects an unknown platform", () => {
    expect(() => registerDevice({ token: "a-real-looking-token", platform: "blackberry", userId: "jordan", now: T0 }))
      .toThrow(/platform/i);
  });

  it("replaces rather than accumulating, so re-registering does not multiply alerts", () => {
    const first = registerDevice({ token: "a-real-looking-token", platform: "ios", userId: "jordan", now: T0 });
    const again = registerDevice({ token: "a-real-looking-token", platform: "ios", userId: "jordan", now: T0 });
    expect(upsertDevice(upsertDevice([], first), again)).toHaveLength(1);
  });

  it("keeps a guardian's separate devices", () => {
    const phone = registerDevice({ token: "phone-token-here", platform: "ios", userId: "jordan", now: T0 });
    const tablet = registerDevice({ token: "tablet-token-here", platform: "android", userId: "jordan", now: T0 });
    const all = upsertDevice(upsertDevice([], phone), tablet);
    expect(devicesFor(all, "jordan")).toHaveLength(2);
    expect(devicesFor(all, "riley")).toHaveLength(0);
  });
});
