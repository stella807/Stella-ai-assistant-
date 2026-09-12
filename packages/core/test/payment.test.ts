import { describe, expect, it } from "vitest";
import {
  HOLD_BUFFER, HOLD_TTL_HOURS, attachPaymentMethod, authorizeExactHold, authorizeHold,
  canBookAutomatically, captureHold, isHoldExpired, isMethodExpired, releaseHold, sweepExpiredHolds,
} from "../src/payment.ts";

const T0 = new Date("2026-06-15T12:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const card = (over: Partial<{ expMonth: number; expYear: number }> = {}) =>
  attachPaymentMethod({ id: "pm1", processor: "stripe", brand: "Visa", last4: "4242", expMonth: 12, expYear: 2027, now: T0, ...over });

describe("attaching a payment method", () => {
  it("accepts a valid card", () => {
    const m = card();
    expect(m.last4).toBe("4242");
    expect(m.brand).toBe("Visa");
  });

  it("rejects a malformed card number", () => {
    expect(() => attachPaymentMethod({ id: "p", processor: "stripe", brand: "Visa", last4: "42", expMonth: 1, expYear: 2027, now: T0 })).toThrow();
    expect(() => attachPaymentMethod({ id: "p", processor: "stripe", brand: "Visa", last4: "abcd", expMonth: 1, expYear: 2027, now: T0 })).toThrow();
  });

  it("rejects a bad month", () => {
    expect(() => card({ expMonth: 0 })).toThrow();
    expect(() => card({ expMonth: 13 })).toThrow();
  });

  it("rejects an already-expired card", () => {
    expect(() => card({ expMonth: 1, expYear: 2020 })).toThrow(/expired/i);
  });

  it("accepts a card expiring later this month", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(attachPaymentMethod({ id: "p", processor: "stripe", brand: "Visa", last4: "4242", expMonth: 6, expYear: 2026, now }).expYear).toBe(2026);
  });

  it("requires a brand", () => {
    expect(() => attachPaymentMethod({ id: "p", processor: "stripe", brand: "  ", last4: "4242", expMonth: 1, expYear: 2027, now: T0 })).toThrow();
  });

  it("flags expiry independently of attach-time validation", () => {
    const m = card({ expMonth: 7, expYear: 2026 });
    expect(isMethodExpired(m, at(24 * 60))).toBe(true);
    expect(isMethodExpired(m, T0)).toBe(false);
  });

  it("records which processor and wallet settled the method", () => {
    const m = attachPaymentMethod({
      id: "p", processor: "stripe", wallet: "apple-pay", brand: "Visa", last4: "4242",
      expMonth: 12, expYear: 2027, now: T0,
    });
    expect(m.processor).toBe("stripe");
    expect(m.wallet).toBe("apple-pay");
  });

  it("accepts PayPal with no wallet", () => {
    const m = attachPaymentMethod({
      id: "p", processor: "paypal", brand: "PayPal", last4: "4242", expMonth: 12, expYear: 2027, now: T0,
    });
    expect(m.processor).toBe("paypal");
    expect(m.wallet).toBeUndefined();
  });

  it("rejects a wallet method claiming to settle through PayPal", () => {
    expect(() => attachPaymentMethod({
      id: "p", processor: "paypal", wallet: "google-pay", brand: "Visa", last4: "4242",
      expMonth: 12, expYear: 2027, now: T0,
    })).toThrow(/only offered through stripe/i);
  });
});

describe("holds", () => {
  it("holds the estimate plus a buffer, never the bare estimate", () => {
    const hold = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    expect(hold.amountCents).toBe(Math.ceil(2000 * HOLD_BUFFER));
    expect(hold.status).toBe("held");
  });

  it("refuses to hold nothing", () => {
    expect(() => authorizeHold({ id: "h", travelerId: "sam", estimateCents: 0, now: T0 })).toThrow();
    expect(() => authorizeHold({ id: "h", travelerId: "sam", estimateCents: -5, now: T0 })).toThrow();
  });

  it("captures up to the held amount", () => {
    const hold = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    const captured = captureHold(hold, 2200, T0);
    expect(captured.status).toBe("captured");
    expect(captured.capturedCents).toBe(2200);
  });

  it("REFUSES to capture more than was held — the entire point of a hold", () => {
    const hold = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    expect(() => captureHold(hold, hold.amountCents + 1, T0)).toThrow(/exceeds/i);
  });

  it("cannot capture a hold twice", () => {
    const hold = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    const captured = captureHold(hold, 2000, T0);
    expect(() => captureHold(captured, 100, T0)).toThrow(/cannot capture a captured hold/i);
  });

  it("releases an unused hold with nothing captured", () => {
    const hold = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    const released = releaseHold(hold);
    expect(released.status).toBe("released");
    expect(released.capturedCents).toBeUndefined();
  });

  it("releasing twice is a no-op, not an error", () => {
    const hold = releaseHold(authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 }));
    expect(releaseHold(hold).status).toBe("released");
  });

  it("expires a hold left too long, and refuses to capture it", () => {
    const hold = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    expect(isHoldExpired(hold, at(HOLD_TTL_HOURS - 1))).toBe(false);
    expect(isHoldExpired(hold, at(HOLD_TTL_HOURS + 1))).toBe(true);
    expect(() => captureHold(hold, 100, at(HOLD_TTL_HOURS + 1))).toThrow(/expired/i);
  });

  it("sweeps expired holds without touching settled ones", () => {
    const held = authorizeHold({ id: "h1", travelerId: "sam", estimateCents: 2000, now: T0 });
    const captured = captureHold(authorizeHold({ id: "h2", travelerId: "sam", estimateCents: 1000, now: T0 }), 900, T0);
    const swept = sweepExpiredHolds([held, captured], at(HOLD_TTL_HOURS + 2));
    expect(swept[0]!.status).toBe("expired");
    expect(swept[1]!.status).toBe("captured");
  });
});

describe("canBookAutomatically", () => {
  it("requires a live payment method, not just the feature", () => {
    const m = card();
    expect(canBookAutomatically(true, m, T0)).toBe(true);
    expect(canBookAutomatically(false, m, T0)).toBe(false);
    expect(canBookAutomatically(true, null, T0)).toBe(false);
  });

  it("refuses once the card on file has expired", () => {
    // Valid when attached; expired by the time we check months later.
    const m = card({ expMonth: 7, expYear: 2026 });
    expect(canBookAutomatically(true, m, at(24 * 20))).toBe(true);   // still June
    expect(canBookAutomatically(true, m, at(24 * 60))).toBe(false);  // past July 31
  });
});

describe("authorizeExactHold", () => {
  it("holds exactly the cap given, with none of the ride buffer applied", () => {
    const hold = authorizeExactHold({ id: "h1", travelerId: "sam", capCents: 2500, now: T0 });
    expect(hold.amountCents).toBe(2500);
    expect(hold.status).toBe("held");
  });

  it("never authorizes more than the ceiling — a padded hold would break the promise", () => {
    const exact = authorizeExactHold({ id: "h1", travelerId: "sam", capCents: 2500, now: T0 });
    const padded = authorizeHold({ id: "h2", travelerId: "sam", estimateCents: 2500, now: T0 });
    expect(exact.amountCents).toBeLessThan(padded.amountCents);
    expect(exact.amountCents).toBe(2500);
  });

  it("refuses a non-positive cap", () => {
    expect(() => authorizeExactHold({ id: "h", travelerId: "sam", capCents: 0, now: T0 })).toThrow();
    expect(() => authorizeExactHold({ id: "h", travelerId: "sam", capCents: -1, now: T0 })).toThrow();
  });

  it("captures and releases the same as any other hold", () => {
    const hold = authorizeExactHold({ id: "h1", travelerId: "sam", capCents: 2500, now: T0 });
    expect(captureHold(hold, 2500, T0).status).toBe("captured");
    expect(() => captureHold(hold, 2501, T0)).toThrow(/exceeds the held/);
    expect(releaseHold(hold).status).toBe("released");
  });
});
