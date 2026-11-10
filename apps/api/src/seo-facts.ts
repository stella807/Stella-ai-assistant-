import {
  ERRAND_REFERENCE_CAP_CENTS, ERRAND_TIERS, HIRING_OPENED_ON, LAUNCH_MARKETS, errandFeeCents, isElitePlan,
  releasedPlans, serviceFeeFor,
} from "@safehubby/core";
import { staffRoleListing, type Ctx } from "./routes.ts";
import type { SeoFacts } from "./seo.ts";

/** The site's own address, for canonical links and the sitemap. */
export function siteOrigin(): string {
  return (process.env.SAFEHUBBY_PUBLIC_URL ?? "https://safehubby.com").replace(/\/+$/, "");
}

/**
 * The figures the search listing is built from, read where the app reads
 * them: the plans on offer today, the live prices and pay (owner changes
 * included), and the jobs with seats open.
 */
export function seoFactsFor(ctx: Ctx): SeoFacts {
  return {
    origin: siteOrigin(),
    // Elite is shown in the app as "coming soon" until it opens; it is not offered here as something to buy.
    plans: releasedPlans().filter((p) => !isElitePlan(p.id))
      .map((p) => ({ name: p.name, monthlyCents: p.monthlyCents, seats: p.seats })),
    hourlyCents: serviceFeeFor("wait-with-someone", false, 1, 1),
    armedHourlyCents: serviceFeeFor("wait-with-someone", false, 1, 1, false, true),
    errandFromCents: errandFeeCents(ERRAND_TIERS[0]!.id, ERRAND_REFERENCE_CAP_CENTS),
    hospitalDayCents: serviceFeeFor("wait-with-someone", false, 1, 12, true),
    markets: LAUNCH_MARKETS.map((m) => m.label),
    roles: staffRoleListing(ctx).map((r) => ({
      id: r.id, label: r.label, description: r.description, pay: r.pay, payEs: r.payEs, openings: r.openings,
    })),
    hiringOpenedOn: HIRING_OPENED_ON,
  };
}
