import type { EliteDeskPort, EliteQuote, EliteQuoteRequest } from "@safehubby/core";
import { statusFor } from "@safehubby/core";
import { postJson } from "./fulfillment.ts";

/**
 * The Elite luxury desk, brokered through a partner that already holds the
 * supplier relationships.
 *
 * **Why piggyback rather than build it.** Safehubby's own charter desk would
 * need operator agreements, a hotel consortium membership, vetted physician
 * practices per state, and — the expensive part — it would make Safehubby the
 * air charter broker of record, carrying the `14 CFR Part 295` duties itself.
 * A partner who already brokers charter carries those as the broker; Safehubby
 * refers into it. That is the same reasoning behind `ConciergePort` and
 * `SecureTransportPort`: a booking layer on an already-licensed network beats
 * three new businesses.
 *
 * **Amalfi Jets is the intended first partner**, and it is a configuration
 * value rather than a dependency — `ELITE_DESK_PROVIDER` names whoever is
 * actually wired in, exactly as `CONCIERGE_PROVIDER` does. Amalfi is a
 * tech-enabled charter broker whose own concierge programme already spans
 * aircraft sourcing, hotels, dining and ground transport, which is most of
 * this catalogue in one place.
 *
 * Two things about that are unverified and must not be assumed:
 *
 *  - **Whether Amalfi offers a partner or referral API at all.** They publish
 *    a consumer app, not a documented reseller integration. The endpoint
 *    shapes below are this codebase's own convention, not theirs, and the
 *    adapter stays in `handoff` until someone has an actual agreement and an
 *    actual base URL.
 *  - **Whether any one partner covers the whole catalogue.** A charter broker
 *    plausibly covers jets, hotels and dining; it almost certainly does not
 *    run a medical network. `offers()` exists precisely so the app can decline
 *    a service the partner does not hold, rather than quietly implying it.
 *
 * There is also a commercial question this adapter cannot answer: if the
 * partner earns the supplier commission, Safehubby's share is whatever the
 * partner agreement says, not the researched market rate in
 * `ELITE_SERVICES`. Those rates describe what the desk is worth; the split is
 * contractual. See docs/billing.md.
 */

const DESK_PROVIDER = process.env.ELITE_DESK_PROVIDER ?? "the luxury desk partner";
const DESK_BASE = process.env.ELITE_DESK_API_BASE;
const DESK_KEY = process.env.ELITE_DESK_API_KEY;

/** Services the configured partner handles, as a comma-separated list of
 *  `EliteServiceId`s. Unset means "everything it is asked for", which is only
 *  a safe default because nothing is asked for at all until the partner is
 *  configured. */
const DESK_SERVICES = process.env.ELITE_DESK_SERVICES?.split(",").map((s) => s.trim()).filter(Boolean);

export const eliteDesk: EliteDeskPort = {
  status: statusFor(
    "elite-desk", DESK_PROVIDER, Boolean(DESK_BASE && DESK_KEY),
    "A partner agreement with a luxury-desk provider that already holds the operator, hotel and practice relationships (Amalfi Jets is the intended first), then ELITE_DESK_PROVIDER, ELITE_DESK_API_BASE and ELITE_DESK_API_KEY. Set ELITE_DESK_SERVICES to the subset they actually cover.",
  ),

  async offers(serviceId: string): Promise<boolean> {
    if (!DESK_BASE || !DESK_KEY) return false;
    if (!DESK_SERVICES) return true;
    return DESK_SERVICES.includes(serviceId);
  },

  async quote(input: EliteQuoteRequest): Promise<EliteQuote | null> {
    if (!DESK_BASE || !DESK_KEY) throw new Error(`${DESK_PROVIDER} is not configured.`);

    const data = (await postJson(
      `${DESK_BASE.replace(/\/$/, "")}/quotes`,
      { authorization: `Bearer ${DESK_KEY}` },
      { service: input.serviceId, brief: input.brief, requester: input.requesterName },
    )) as {
      quote_cents?: number; currency?: string; operator_name?: string; description?: string;
    };

    // No price back is a real answer — the partner may simply not cover this
    // request — and is passed on as "nothing quoted" rather than a zero.
    if (typeof data.quote_cents !== "number") return null;

    return {
      provider: DESK_PROVIDER,
      supplierQuoteCents: Math.round(data.quote_cents),
      currency: String(data.currency ?? "USD"),
      ...(data.operator_name ? { operatorName: String(data.operator_name) } : {}),
      description: String(data.description ?? ""),
    };
  },
};
