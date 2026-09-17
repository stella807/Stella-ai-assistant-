import { describe, expect, it } from "vitest";
import { compilePricing, ownerAccruedCentsFor, type CurrentPricing, type PriceOverride } from "../src/pricing-overrides.ts";

const DEFAULTS: CurrentPricing = {
  paHourlyCents: 3500,
  errandRunnerTaskCents: 600,
  driverStandard: { baseCents: 300, perMileCents: 90, perMinuteCents: 18 },
  driverSecureTransport: { baseCents: 1500, perMileCents: 300, perMinuteCents: 60 },
  secretaryHourlyCents: 2200,
  socialMediaManagerHourlyCents: 2200,
  ownerMonthlyCents: 0,
};

const override = (over: Partial<PriceOverride> = {}): PriceOverride => ({
  id: "ovr_1", roleOrService: "owner", priceCents: 500000,
  changedBy: "master_1", changedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

describe("compiling current pricing from overrides", () => {
  it("falls back to the defaults with no overrides at all", () => {
    expect(compilePricing([], DEFAULTS)).toEqual(DEFAULTS);
  });

  it("applies an override for the role it names, leaving everything else at default", () => {
    const current = compilePricing([override({ roleOrService: "personal-assistant", priceCents: 4000 })], DEFAULTS);
    expect(current.paHourlyCents).toBe(4000);
    expect(current.errandRunnerTaskCents).toBe(DEFAULTS.errandRunnerTaskCents);
  });

  it("takes the most recent override when a role has been changed more than once", () => {
    const overrides = [
      override({ id: "ovr_1", roleOrService: "owner", priceCents: 400000, changedAt: "2026-09-01T00:00:00.000Z" }),
      override({ id: "ovr_2", roleOrService: "owner", priceCents: 500000, changedAt: "2026-09-10T00:00:00.000Z" }),
    ];
    expect(compilePricing(overrides, DEFAULTS).ownerMonthlyCents).toBe(500000);
    // Order in the array must not matter — it is sorted by date, not by position.
    expect(compilePricing([...overrides].reverse(), DEFAULTS).ownerMonthlyCents).toBe(500000);
  });

  it("applies a driver-tier override as a whole rate, not a single field", () => {
    const current = compilePricing([{
      id: "ovr_3", roleOrService: "driver-secure-transport", priceCents: 0,
      baseCents: 2000, perMileCents: 400, perMinuteCents: 80,
      changedBy: "master_1", changedAt: "2026-09-01T00:00:00.000Z",
    } as any], DEFAULTS);
    expect(current.driverSecureTransport).toEqual({ baseCents: 2000, perMileCents: 400, perMinuteCents: 80 });
    expect(current.driverStandard).toEqual(DEFAULTS.driverStandard);
  });
});

describe("owner accrued pay", () => {
  it("is zero with no owner rate set", () => {
    expect(ownerAccruedCentsFor(0, new Date("2026-09-17T12:00:00Z"))).toBe(0);
  });

  it("prorates by calendar days elapsed against days in the month", () => {
    // September has 30 days; the 17th is the 17th day of it.
    const cents = ownerAccruedCentsFor(300000, new Date("2026-09-17T12:00:00Z"));
    expect(cents).toBe(Math.round((300000 * 17) / 30));
  });

  it("accrues the full month on its last day", () => {
    expect(ownerAccruedCentsFor(300000, new Date("2026-09-30T23:00:00Z"))).toBe(300000);
  });

  it("accrues a thirtieth of the month on day one", () => {
    expect(ownerAccruedCentsFor(300000, new Date("2026-09-01T00:30:00Z"))).toBe(Math.round(300000 / 30));
  });

  it("never exceeds the monthly rate, even in a shorter month", () => {
    // February 2026 has 28 days.
    expect(ownerAccruedCentsFor(280000, new Date("2026-02-28T23:59:00Z"))).toBe(280000);
  });
});
