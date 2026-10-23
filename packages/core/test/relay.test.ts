import { describe, expect, it } from "vitest";
import {
  BOOKED_HOUR_STEP, HOSPITAL_DAY_PAYOUT_CENTS, MAX_BOOKED_HOURS, MAX_RELAY_HOURS,
  assistantPayoutFor, planRelay, relayPricing, serviceFeeFor,
} from "../src/index.ts";

const START = new Date("2026-12-05T20:00:00.000Z");
const hoursOf = (r: ReturnType<typeof planRelay>) => r.legs.map((l) => l.hours);

describe("covering a span longer than one booking", () => {
  it("leaves a short span as a single shift", () => {
    const relay = planRelay({ startAt: START, hours: 6 });
    expect(relay.legs).toHaveLength(1);
    expect(relay.legs[0]!.hours).toBe(6);
  });

  it("splits a full day into shifts nobody works end to end", () => {
    /**
     * The reason this module exists. One booking caps at MAX_BOOKED_HOURS
     * because past that it stops being a booking and becomes employment —
     * see the note on that constant. So round-the-clock cover is a relay of
     * people, which is also how hospitals and care agencies actually staff
     * it, rather than one person awake for twenty-four hours.
     */
    const relay = planRelay({ startAt: START, hours: 24 });
    expect(relay.legs.length).toBeGreaterThan(1);
    for (const leg of relay.legs) expect(leg.hours).toBeLessThanOrEqual(MAX_BOOKED_HOURS);
  });

  it("splits as evenly as the half-hour step allows", () => {
    // 13 hours is 12 + 1 if you just fill shifts to the brim. Nobody wants
    // the one-hour shift at four in the morning, and nobody wants to be the
    // person asked to take it.
    expect(hoursOf(planRelay({ startAt: START, hours: 13 }))).toEqual([6.5, 6.5]);
    expect(hoursOf(planRelay({ startAt: START, hours: 24 }))).toEqual([12, 12]);
    expect(hoursOf(planRelay({ startAt: START, hours: 25 }))).toEqual([8.5, 8.5, 8]);
  });

  it("keeps every shift on the half hour", () => {
    for (const hours of [7, 13, 17, 25, 36, 47]) {
      for (const leg of planRelay({ startAt: START, hours }).legs) {
        expect((leg.hours / BOOKED_HOUR_STEP) % 1, `${hours}h → ${leg.hours}`).toBe(0);
      }
    }
  });

  it("runs the shifts back to back, with no gap and no overlap", () => {
    const relay = planRelay({ startAt: START, hours: 30 });
    expect(relay.legs[0]!.startAt).toBe(START.toISOString());
    for (let i = 1; i < relay.legs.length; i++) {
      expect(relay.legs[i]!.startAt, `gap before leg ${i + 1}`).toBe(relay.legs[i - 1]!.endAt);
    }
    expect(relay.legs.at(-1)!.endAt).toBe(relay.endAt);
  });

  it("covers exactly the span asked for", () => {
    for (const hours of [1, 6, 12, 13, 24, 48, 72]) {
      const relay = planRelay({ startAt: START, hours });
      const total = relay.legs.reduce((sum, l) => sum + l.hours, 0);
      expect(total, `${hours}h`).toBe(hours);
      expect(Date.parse(relay.endAt) - Date.parse(relay.startAt)).toBe(hours * 3_600_000);
    }
  });

  it("refuses a span it has no honest way to staff", () => {
    expect(() => planRelay({ startAt: START, hours: 0 })).toThrow(/at least/i);
    expect(() => planRelay({ startAt: START, hours: 1.25 })).toThrow(/half/i);
    expect(() => planRelay({ startAt: START, hours: MAX_RELAY_HOURS + 1 })).toThrow(/longer than/i);
  });
});

describe("what a relay costs", () => {
  it("prices every shift and adds them up", () => {
    const relay = planRelay({ startAt: START, hours: 24 });
    const price = relayPricing("wait-with-someone", relay, 1);
    const byHand = relay.legs
      .reduce((sum, l) => sum + serviceFeeFor("wait-with-someone", false, 1, l.hours), 0);
    expect(price.serviceFeeCents).toBe(byHand);
    expect(price.legs).toHaveLength(relay.legs.length);
  });

  it("pays each shift its own assistant", () => {
    // Two people worked it, so two people are paid — the payout is per leg,
    // not one lump against the first name on the rota.
    const relay = planRelay({ startAt: START, hours: 24 });
    const price = relayPricing("wait-with-someone", relay, 1);
    expect(price.assistantPayoutCents).toBe(relay.legs
      .reduce((sum, l) => sum + assistantPayoutFor("wait-with-someone", false, 1, l.hours), 0));
    for (const leg of price.legs) expect(leg.assistantPayoutCents).toBeGreaterThan(0);
  });

  it("pays each shift of a hospital stay the day rate, never more", () => {
    // Sitting with someone in hospital is paid by the day, as caretakers on
    // the island are; a 24-hour stay is shifts, each at most a hospital day.
    const relay = planRelay({ startAt: START, hours: 24 });
    const price = relayPricing("wait-with-someone", relay, 1);
    for (const leg of price.legs) expect(leg.assistantPayoutCents).toBeLessThanOrEqual(HOSPITAL_DAY_PAYOUT_CENTS);
    expect(price.assistantPayoutCents).toBeGreaterThan(0);
  });

  it("costs the same whether a day is covered as one relay or two halves", () => {
    // An even split has no seam in the price, so nobody games the shape of
    // the rota to pay less.
    const whole = relayPricing("wait-with-someone", planRelay({ startAt: START, hours: 24 }), 1);
    const half = relayPricing("wait-with-someone", planRelay({ startAt: START, hours: 12 }), 1);
    expect(whole.serviceFeeCents).toBe(half.serviceFeeCents * 2);
  });
});
