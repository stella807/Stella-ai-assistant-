/**
 * Dynamic pricing controls accessible from the master dashboard.
 * Allows the owner to adjust rates for all roles while maintaining an audit trail.
 * Overrides apply to all new tasks/payments after the override is set.
 */

import type { StaffRole } from "./staffing.ts";
import type { DriverTier } from "./driver-applications.ts";

export interface PriceOverride {
  /** Unique identifier for this override */
  id: string;
  /** Which role/service this price applies to */
  roleOrService: StaffRole | "owner" | `driver-${DriverTier}`;
  /** Price in cents. For hourly roles (secretary, social-media-manager), this is cents/hour.
   *  For drivers, this is per-trip base in cents.
   *  For personal-assistant, this is cents/hour.
   *  For errand-runner, this is per-task in cents. */
  priceCents: number;
  /** Who made this change */
  changedBy: string;
  /** When this override takes effect */
  changedAt: string;
  /** Human-readable reason for the change (optional) */
  reason?: string;
}

export interface DriverRateOverride extends PriceOverride {
  roleOrService: `driver-${DriverTier}`;
  /** Base fare in cents */
  baseCents: number;
  /** Per-mile rate in cents */
  perMileCents: number;
  /** Per-minute rate in cents */
  perMinuteCents: number;
}

/**
 * Current pricing for all roles. Merges base rates with any active overrides.
 */
export interface CurrentPricing {
  /** Personal assistant hourly rate in cents */
  paHourlyCents: number;
  /** Errand runner per-task payout in cents */
  errandRunnerTaskCents: number;
  /** Driver standard tier rates */
  driverStandard: {
    baseCents: number;
    perMileCents: number;
    perMinuteCents: number;
  };
  /** Driver secure-transport tier rates */
  driverSecureTransport: {
    baseCents: number;
    perMileCents: number;
    perMinuteCents: number;
  };
  /** Secretary hourly rate in cents */
  secretaryHourlyCents: number;
  /** Social media manager hourly rate in cents */
  socialMediaManagerHourlyCents: number;
  /** Owner salary component in cents/month (new field for owner compensation) */
  ownerMonthlyCents: number;
}

/**
 * Compiles current pricing by taking the most recent override for each role,
 * falling back to defaults if no override exists.
 */
export function compilePricing(overrides: PriceOverride[], defaults: CurrentPricing): CurrentPricing {
  const result = { ...defaults };

  for (const override of overrides) {
    const mostRecent = overrides
      .filter((o) => o.roleOrService === override.roleOrService)
      .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())[0];

    if (!mostRecent) continue;

    switch (mostRecent.roleOrService) {
      case "personal-assistant":
        result.paHourlyCents = mostRecent.priceCents;
        break;
      case "errand-runner":
        result.errandRunnerTaskCents = mostRecent.priceCents;
        break;
      case "secretary":
        result.secretaryHourlyCents = mostRecent.priceCents;
        break;
      case "social-media-manager":
        result.socialMediaManagerHourlyCents = mostRecent.priceCents;
        break;
      case "owner":
        result.ownerMonthlyCents = mostRecent.priceCents;
        break;
      case "driver-standard": {
        const driverOverride = mostRecent as DriverRateOverride;
        result.driverStandard = {
          baseCents: driverOverride.baseCents,
          perMileCents: driverOverride.perMileCents,
          perMinuteCents: driverOverride.perMinuteCents,
        };
        break;
      }
      case "driver-secure-transport": {
        const driverOverride = mostRecent as DriverRateOverride;
        result.driverSecureTransport = {
          baseCents: driverOverride.baseCents,
          perMileCents: driverOverride.perMileCents,
          perMinuteCents: driverOverride.perMinuteCents,
        };
        break;
      }
    }
  }

  return result;
}
