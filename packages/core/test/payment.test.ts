import { describe, expect, it } from "vitest";
import {
  CARD_NETWORKS, HOLD_BUFFER, HOLD_TTL_HOURS, PAY_BRANDS, PAY_BRAND_LABEL, PAY_BRAND_SPEC, PROCESSOR_FOR_BRAND,
  attachPaymentMethod, authorizeExactHold, authorizeHold, brandsFor,
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

  it("records which processor and brand settled the method", () => {
    const m = attachPaymentMethod({
      id: "p", processor: "stripe", payWith: "apple-pay", brand: "Visa", last4: "4242",
      expMonth: 12, expYear: 2027, now: T0,
    });
    expect(m.processor).toBe("stripe");
    expect(m.payWith).toBe("apple-pay");
  });

  it("accepts PayPal with no brand", () => {
    const m = attachPaymentMethod({
      id: "p", processor: "paypal", brand: "PayPal", last4: "4242", expMonth: 12, expYear: 2027, now: T0,
    });
    expect(m.processor).toBe("paypal");
    expect(m.payWith).toBeUndefined();
  });

  it("refuses a brand claimed against a processor that does not settle it", () => {
    // Every brand belongs to exactly one processor, so a mismatch is the app
    // misreporting where the money actually went — the one thing a payment
    // record cannot get wrong. Checked both directions, since the old rule
    // ("a wallet means Stripe") only ever caught one of them.
    expect(() => attachPaymentMethod({
      id: "p", processor: "paypal", payWith: "google-pay", brand: "Visa", last4: "4242",
      expMonth: 12, expYear: 2027, now: T0,
    })).toThrow(/settles through stripe/i);
    expect(() => attachPaymentMethod({
      id: "p", processor: "stripe", payWith: "venmo", brand: "Venmo", last4: "4242",
      expMonth: 12, expYear: 2027, now: T0,
    })).toThrow(/settles through paypal/i);
  });

  it("maps every brand to a processor the app actually holds an account with", () => {
    for (const b of PAY_BRANDS) {
      expect(PROCESSOR_FOR_BRAND[b], b).toBeDefined();
      expect(PAY_BRAND_LABEL[b], b).toBeTruthy();
    }
    // Klarna, Amazon Pay and the rest ride on Stripe rather than being
    // integrations of their own; Venmo rides on PayPal. If one of these ever
    // needs its own credentials, it belongs in PaymentProcessor instead.
    expect(PROCESSOR_FOR_BRAND["klarna"]).toBe("stripe");
    expect(PROCESSOR_FOR_BRAND["amazon-pay"]).toBe("stripe");
    expect(PROCESSOR_FOR_BRAND["venmo"]).toBe("paypal");
    expect(brandsFor("ath-movil")).toEqual([]);
  });

  it("lists only brands that can actually be saved for a later off-session hold", () => {
    // This app's only payment surface is a method on file, charged later
    // with nobody present. A brand that cannot be stored that way has
    // nowhere to live here, so the list must not contain one — which is why
    // Affirm and Afterpay are absent rather than listed-but-unavailable:
    // Stripe supports neither on SetupIntents, so no amount of configuration
    // would ever make them work on this screen.
    for (const b of PAY_BRANDS) expect(PAY_BRAND_SPEC[b].savable, b).toBe(true);
    expect(PAY_BRANDS as string[]).not.toContain("affirm");
    expect(PAY_BRANDS as string[]).not.toContain("afterpay-clearpay");
  });

  it("keeps Mastercard a card network rather than a processor or a brand", () => {
    // "Add Mastercard" is not an integration: the card path already accepts
    // it, through Stripe, like every other network here. Listing it as a
    // processor would claim a backend that does not and should not exist.
    expect(CARD_NETWORKS).toContain("Mastercard");
    expect(PAY_BRANDS as string[]).not.toContain("mastercard");
  });
});

describe("a method with no card behind it", () => {
  // ATH Móvil is an account tied to a phone number, not a card. It has
  // nothing to expire, and treating a missing expiry as expired would lock
  // the method out the moment it was added.
  const athMovil = () => attachPaymentMethod({
    id: "p", processor: "ath-movil", brand: "ATH Móvil", last4: "5309", now: T0,
  });

  it("attaches without an expiry", () => {
    const m = athMovil();
    expect(m.processor).toBe("ath-movil");
    expect(m.expMonth).toBeUndefined();
    expect(m.expYear).toBeUndefined();
  });

  it("never counts as expired, however far out the clock is", () => {
    expect(isMethodExpired(athMovil(), T0)).toBe(false);
    expect(isMethodExpired(athMovil(), at(24 * 365 * 20))).toBe(false);
  });

  it("can still book automatically", () => {
    expect(canBookAutomatically(true, athMovil(), at(24 * 365 * 20))).toBe(true);
  });

  it("still refuses a half-given expiry rather than silently dropping it", () => {
    expect(() => attachPaymentMethod({
      id: "p", processor: "stripe", brand: "Visa", last4: "4242", expMonth: 12, now: T0,
    })).toThrow(/expiry year/i);
    expect(() => attachPaymentMethod({
      id: "p", processor: "stripe", brand: "Visa", last4: "4242", expYear: 2027, now: T0,
    })).toThrow(/expiry month/i);
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
