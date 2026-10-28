import { describe, expect, it } from "vitest";
import {
  BASKETS, CLUB_EXPERIENCES, CONCIERGE_CATEGORIES, CONCIERGE_DISCLOSURES, DESK_TASK_KINDS, DRINK_CATALOG,
  ELITE_EVENTS, ELITE_SERVICES, ERRAND_TIERS, FEATURE_LABELS, GAMES, LAUNCH_MARKETS, ON_BEHALF_DISCLOSURES,
  PLANS, RED_FLAGS, REWARD_CATALOG, assistantPayoutFor, describePayAgainstMarket, describeSubscription, minutesFor,
} from "@safehubby/core";
import { localizeDeep, localized, spanishFor } from "../src/app/server-es.ts";

/** Every sentence core hands the screens, so a new one without Spanish fails here, not in front of a reader. */
const shown = (): string[] => [
  ...PLANS.map((p) => p.blurb),
  ...Object.values(FEATURE_LABELS),
  ...CONCIERGE_CATEGORIES.flatMap((c) => [c.label, c.description]),
  ...CONCIERGE_DISCLOSURES,
  ...ON_BEHALF_DISCLOSURES,
  ...ERRAND_TIERS.flatMap((t) => [t.label, t.example]),
  ...DESK_TASK_KINDS.flatMap((k) => [k.label, k.description]),
  ...GAMES.flatMap((g) => [g.name, g.tagline, g.howItWorks, g.forfeit]),
  ...DRINK_CATALOG.map((d) => d.name),
  ...RED_FLAGS.flatMap((f) => [f.label, f.detail]),
  ...BASKETS.flatMap((b) => [b.name, b.blurb]),
  ...REWARD_CATALOG.flatMap((r) => [r.name, r.description]),
  ...ELITE_SERVICES.flatMap((s) => [s.label, s.description]),
  ...ELITE_EVENTS.flatMap((e) => [e.label]),
  ...CLUB_EXPERIENCES.map((e) => e.label),
  // The assistants' pay rates page, in every market and for every task.
  ...LAUNCH_MARKETS.flatMap((m) => CONCIERGE_CATEGORIES.map((c) =>
    describePayAgainstMarket(assistantPayoutFor(c.id), minutesFor(c.id), m.id))),
];

describe("the server's English, for a Spanish reader", () => {
  it("has Spanish for every sentence core puts on a screen", () => {
    const missing = shown().filter((s) => spanishFor(s) === null);
    expect(missing).toEqual([]);
  });

  it("leaves English readers' text exactly as the server wrote it", () => {
    const note = "You are on the free plan. SOS, check-ins, location sharing and drink count never cost anything.";
    expect(localized(note, "en")).toBe(note);
    expect(localized(note, "es")).toBe("Estás en el plan Gratis. SOS, chequeos, compartir ubicación y conteo de bebidas nunca cuestan nada.");
  });

  it("puts a date the server wrote into Spanish", () => {
    const trial = describeSubscription({
      planId: "premium-basic", status: "trialing", currentPeriodEnd: "2026-12-12T00:00:00Z",
    } as never, new Date("2026-12-01T00:00:00Z"));
    expect(localized(trial, "es")).toBe("Prueba gratis: el primer cobro es el 12 de dic de 2026. Si cancelas antes, no se te cobra.");
  });

  it("translates the terms of a task's charge line and keeps the customer's own words", () => {
    const line = "Grab something — a juice for Mami ($4.50 service fee included, paid from your balance)";
    expect(localized(line, "es")).toBe("Traer algo — a juice for Mami (cargo de servicio de $4.50 incluido, pagado de tu balance)");
  });

  it("changes only whole known sentences in a response, never ids or what people typed", () => {
    const response = {
      id: "ct_1", status: "completed", planNote: "Canceled. You are back on the free plan.",
      note: "Bring the blue blanket", lines: [{ label: "Rides home", cents: 1200 }],
      photo: "x".repeat(2000),
    };
    expect(localizeDeep(response, "es")).toEqual({
      id: "ct_1", status: "completed", planNote: "Cancelado. Volviste al plan Gratis.",
      note: "Bring the blue blanket", lines: [{ label: "Viajes a casa", cents: 1200 }],
      photo: "x".repeat(2000),
    });
    expect(localizeDeep(response, "en")).toBe(response);
  });

  it("falls back to English for a sentence it does not know", () => {
    expect(localized("A sentence nobody has translated yet.", "es")).toBe("A sentence nobody has translated yet.");
  });
});
