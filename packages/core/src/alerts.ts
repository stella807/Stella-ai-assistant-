import type { Alert, AlertAction, NightOut } from "./types.ts";
import { estimateBac } from "./bac.ts";
import { alcoholicDrinks } from "./drinks.ts";

/** Drinks within this window define "pace". */
const PACE_WINDOW_MINUTES = 60;
const PACE_THRESHOLD_DRINKS = 3;

export interface AlertContext {
  night: NightOut;
  now: Date;
  /** Ids already raised, so a standing condition does not re-alert every tick. */
  alreadyRaised: Set<string>;
}

/**
 * Derives the alerts a guardian should see. Pure: the same night at the same
 * instant always yields the same alerts, which makes the escalation ladder
 * testable rather than emergent from timer side effects.
 */
export function deriveAlerts({ night, now, alreadyRaised }: AlertContext): Alert[] {
  const alerts: Alert[] = [];
  const push = (
    key: string,
    kind: Alert["kind"],
    severity: Alert["severity"],
    message: string,
    actions: AlertAction[],
  ) => {
    const id = `${night.id}:${key}`;
    if (alreadyRaised.has(id)) return;
    alerts.push({ id, nightId: night.id, kind, severity, message, raisedAt: now.toISOString(), actions });
  };

  const rideAction: AlertAction = { type: "book-ride", label: "Book a ride home" };
  const messageAction: AlertAction = { type: "message", label: "Send a message" };

  for (const missed of night.checkIns.filter((c) => c.status === "missed")) {
    push(
      `missed:${missed.id}`,
      "missed-check-in",
      "warn",
      "A check-in was missed. No answer yet — last known location is on the map.",
      [messageAction, { type: "call", label: "Call now" }, rideAction],
    );
  }

  const drinkCount = alcoholicDrinks(night.drinks).length;
  if (drinkCount >= night.drinkLimit && night.drinkLimit > 0) {
    push(
      "drink-limit",
      "drink-limit-reached",
      "warn",
      `Drink count reached ${drinkCount}, the limit you both agreed on.`,
      [rideAction, { type: "send-supplies", label: "Send water & a snack" }, messageAction],
    );
  }

  if (drinksInWindow(night, now) >= PACE_THRESHOLD_DRINKS) {
    push(
      "pace",
      "fast-pace",
      "warn",
      `${PACE_THRESHOLD_DRINKS}+ drinks in the last hour. That's a fast pace.`,
      [{ type: "send-supplies", label: "Send water & a snack" }, messageAction],
    );
  }

  const bac = estimateBac({ body: night.body, drinks: night.drinks, now });
  if (bac.band === "severe") {
    push(
      "severe",
      "fast-pace",
      "urgent",
      "Estimated intoxication is in the danger range. If they are confused, vomiting, or hard to wake, call 911.",
      [{ type: "call", label: "Call now" }, rideAction],
    );
  }

  if (night.status === "heading-home") {
    push("heading-home", "heading-home", "info", "Heading home now.", [
      { type: "acknowledge", label: "Got it" },
    ]);
  }
  if (night.status === "home-safe") {
    push("home-safe", "home-safe", "info", "Home safe.", [{ type: "acknowledge", label: "Got it" }]);
  }

  return alerts;
}

export function sosAlert(night: NightOut, now: Date, silent: boolean): Alert {
  return {
    id: `${night.id}:sos:${now.getTime()}`,
    nightId: night.id,
    kind: "sos",
    severity: "urgent",
    message: silent
      ? "Silent SOS triggered. Location attached. Do not assume they can safely take a call — send a message first."
      : "SOS triggered. Location attached.",
    raisedAt: now.toISOString(),
    actions: silent
      ? [{ type: "message", label: "Message quietly" }, { type: "book-ride", label: "Book a ride to them" }]
      : [{ type: "call", label: "Call now" }, { type: "book-ride", label: "Book a ride to them" }],
  };
}

function drinksInWindow(night: NightOut, now: Date): number {
  const cutoff = now.getTime() - PACE_WINDOW_MINUTES * 60_000;
  return alcoholicDrinks(night.drinks).filter((d) => new Date(d.loggedAt).getTime() >= cutoff).length;
}
