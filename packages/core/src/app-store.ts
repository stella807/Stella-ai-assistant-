import { PLANS, type PlanId } from "./billing.ts";
import type { Cadence } from "./subscription.ts";

/**
 * The App Store side of a subscription: product ids, and how a store
 * purchase is named on the ledger.
 *
 * Shared by the app (which asks StoreKit for these products) and the API
 * (which verifies what StoreKit sold against them), so the two can never
 * disagree about which plan a product unlocks. The products have to be
 * created in App Store Connect with exactly these ids.
 */

/** Must match `appId` in apps/web/capacitor.config.ts and the App Store record. */
export const APP_STORE_BUNDLE_ID = "app.safehubby";

export function appStoreProductId(planId: PlanId, cadence: Cadence): string {
  return `${APP_STORE_BUNDLE_ID}.${planId}.${cadence}`;
}

/**
 * The plan and cadence a product id sells, or null for anything else.
 *
 * Null rather than a best guess: a product this table does not know is either
 * misconfigured in App Store Connect or not ours, and neither should unlock a
 * plan. Free plans have no product, since nothing about them is sold.
 */
export function parseAppStoreProductId(productId: string): { planId: PlanId; cadence: Cadence } | null {
  const prefix = `${APP_STORE_BUNDLE_ID}.`;
  if (!productId.startsWith(prefix)) return null;
  const rest = productId.slice(prefix.length);
  const dot = rest.lastIndexOf(".");
  if (dot === -1) return null;
  const planId = rest.slice(0, dot);
  const cadence = rest.slice(dot + 1);
  if (cadence !== "monthly" && cadence !== "annual") return null;
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan || plan.monthlyCents === 0) return null;
  return { planId: plan.id, cadence };
}

/** The `reference` a ledger line settled by an Apple transaction carries. */
export function appStoreReference(transactionId: string): string {
  return `apple:${transactionId}`;
}
