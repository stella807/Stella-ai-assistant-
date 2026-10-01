import { describe, expect, it } from "vitest";
import {
  APP_STORE_BUNDLE_ID,
  appStoreProductId,
  appStoreReference,
  parseAppStoreProductId,
} from "../src/app-store.ts";
import { PLANS } from "../src/billing.ts";

describe("App Store product ids", () => {
  it("names a product after the bundle, plan and cadence", () => {
    expect(appStoreProductId("premium-plus", "monthly")).toBe(`${APP_STORE_BUNDLE_ID}.premium-plus.monthly`);
  });

  it("round-trips every paid plan and cadence", () => {
    for (const plan of PLANS.filter((p) => p.monthlyCents > 0)) {
      for (const cadence of ["monthly", "annual"] as const) {
        expect(parseAppStoreProductId(appStoreProductId(plan.id, cadence))).toEqual({ planId: plan.id, cadence });
      }
    }
  });

  it("rejects products this app does not sell, rather than guessing a plan", () => {
    expect(parseAppStoreProductId("app.safehubby.free.monthly")).toBeNull();
    expect(parseAppStoreProductId("app.safehubby.platinum.monthly")).toBeNull();
    expect(parseAppStoreProductId("app.safehubby.premium-plus.weekly")).toBeNull();
    expect(parseAppStoreProductId("com.other.premium-plus.monthly")).toBeNull();
  });

  it("references a ledger line by its Apple transaction id", () => {
    expect(appStoreReference("2000000123")).toBe("apple:2000000123");
  });
});
