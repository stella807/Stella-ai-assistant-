import type {
  AssistantListing, AutomaticDeliveryPort, AutomaticRidePort, BookedConciergeTask, BookedRide,
  ConciergePort, ConciergeQuote, ConciergeTaskRequest, DeliveryRequestInput, DispatchedDelivery,
  RideRequestInput, SecureTransportPort, SecureTransportQuote,
} from "@safehubby/core";
import { SECURE_TRANSPORT_DISCLOSURES, statusFor } from "@safehubby/core";
import { ridesFor, pharmacySearch } from "@safehubby/core";
import { instacart, walmartLink, walmartStatus } from "./grocery.ts";
import { revolutCards } from "./cards.ts";

/**
 * Automatic fulfilment adapters.
 *
 * Each is wired against the provider's real business API and activates when its
 * credentials are present. Without them the adapter reports `handoff` and the
 * app links out instead — it never fakes a booking, because a user who believes
 * a car is coming and is wrong is worse off than one who knows they must tap
 * twice.
 *
 * What each one needs is stated on the status object and surfaced in the API,
 * so the operator can see exactly which account is missing.
 */

const TIMEOUT_MS = 8000;

/** Shared by every adapter in this file, and by cards.ts. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------
   Uber Guest Trips
   ------------------------------------------------------------------------
   Uber's product for requesting rides on behalf of people who do not have an
   Uber account — which is precisely Safehubby's case, since the person getting
   the ride is the one who cannot be trusted to arrange it right now.

   Verified against developer.uber.com:
     Base (prod)     https://api.uber.com/v1/guests/
     Base (sandbox)  https://sandbox-api.uber.com/v1/guests/
     OAuth scope     guests.trips
     Endpoints       POST   /trips             request a trip
                     POST   /trips/estimates   price estimates
                     GET    /trips/{id}        retrieve
                     DELETE /trips/{id}        cancel
     Rate limit      200 requests/hour/endpoint by default, raisable

   The sandbox matters: it is how you exercise this without summoning real cars
   to real addresses, and UBER_ENV=sandbox switches to it.
   ---------------------------------------------------------------------- */

const UBER_TOKEN = process.env.UBER_BUSINESS_TOKEN;
const UBER_ORG = process.env.UBER_BUSINESS_ORG_ID;
const UBER_SANDBOX = process.env.UBER_ENV === "sandbox";
const UBER_API =
  process.env.UBER_API_BASE ??
  (UBER_SANDBOX ? "https://sandbox-api.uber.com/v1/guests" : "https://api.uber.com/v1/guests");

/**
 * Estimates before booking.
 *
 * This is why the ride panel can show a fare again. Earlier it could not, and
 * showing an invented one would have been worse than showing none — but Guest
 * Trips quotes a real price, so the number on screen is Uber's, not ours.
 * Safehubby still never computes a fare or a driver payout.
 */
export async function uberEstimates(input: RideRequestInput): Promise<
  { productId: string | null; productName: string | null; fareCents: number | null; currency: string; etaMinutes: number | null }[]
> {
  if (!UBER_TOKEN) return [];
  const data = await postJson(`${UBER_API}/trips/estimates`, { authorization: `Bearer ${UBER_TOKEN}` }, {
    pickup: { latitude: input.pickup.lat, longitude: input.pickup.lng },
    dropoff: { latitude: input.dropoff.lat, longitude: input.dropoff.lng },
  }).catch(() => null);
  if (!data) return [];

  const rows: any[] = data.estimates ?? data.products ?? (Array.isArray(data) ? data : []);
  return rows.map((row) => ({
    productId: row.product_id ?? row.fare_id ?? null,
    productName: row.display_name ?? row.product?.display_name ?? null,
    fareCents:
      typeof row.fare?.value === "number" ? Math.round(row.fare.value * 100)
      : typeof row.estimate?.low_estimate === "number" ? Math.round(row.estimate.low_estimate * 100)
      : null,
    currency: row.fare?.currency_code ?? row.estimate?.currency_code ?? "USD",
    etaMinutes: typeof row.pickup_estimate === "number" ? row.pickup_estimate : null,
  }));
}

/** Cancels a booked trip. Wired because a night that changes plan should not
 *  leave a car waiting outside a bar for someone who already left. */
export async function uberCancel(tripId: string): Promise<void> {
  if (!UBER_TOKEN) throw new Error("Uber Guest Trips is not configured.");
  const res = await fetch(`${UBER_API}/trips/${encodeURIComponent(tripId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${UBER_TOKEN}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Uber cancel failed: ${res.status}`);
}

export const uberForBusiness: AutomaticRidePort = {
  status: statusFor(
    "uber-business", UBER_SANDBOX ? "Uber (sandbox)" : "Uber", Boolean(UBER_TOKEN && UBER_ORG),
    "An Uber developer app with the guests.trips OAuth scope, then UBER_BUSINESS_TOKEN and UBER_BUSINESS_ORG_ID. Set UBER_ENV=sandbox to test without summoning real cars.",
  ),

  async book(input: RideRequestInput): Promise<BookedRide> {
    if (!UBER_TOKEN || !UBER_ORG) throw new Error("Uber for Business is not configured.");

    const data = await postJson(`${UBER_API}/trips`, { authorization: `Bearer ${UBER_TOKEN}` }, {
      organization_id: UBER_ORG,
      guest: { first_name: input.riderName, phone_number: input.riderPhone },
      pickup: { latitude: input.pickup.lat, longitude: input.pickup.lng, nickname: input.pickup.label },
      dropoff: { latitude: input.dropoff.lat, longitude: input.dropoff.lng, nickname: input.dropoff.label },
      note_for_driver: input.note,
    });

    return {
      provider: "Uber",
      bookingId: String(data.trip_id ?? data.request_id ?? ""),
      // Echoed from the provider. Safehubby never computes a fare or a payout.
      fareEstimateCents: typeof data.fare?.value === "number" ? Math.round(data.fare.value * 100) : null,
      currency: data.fare?.currency_code ?? "USD",
      etaMinutes: typeof data.pickup?.eta === "number" ? data.pickup.eta : null,
      trackingUrl: data.trip_url ?? data.share_url ?? null,
      driver: data.driver ? { name: data.driver.name, vehicle: data.driver.vehicle?.model, plate: data.driver.vehicle?.license_plate } : undefined,
    };
  },
};

/* -------------------------------------------------------------------------
   Uber Direct — last-mile dispatch.
   Safehubby must be the merchant of record for the basket, which is a supplier
   agreement with whoever stocks it, not just an API key.
   ---------------------------------------------------------------------- */

const DIRECT_TOKEN = process.env.UBER_DIRECT_TOKEN;
const DIRECT_CUSTOMER = process.env.UBER_DIRECT_CUSTOMER_ID;
const PICKUP_ADDRESS = process.env.FULFILLMENT_PICKUP_ADDRESS;

export const uberDirect: AutomaticDeliveryPort = {
  status: statusFor(
    "uber-direct", "Uber Direct", Boolean(DIRECT_TOKEN && DIRECT_CUSTOMER && PICKUP_ADDRESS),
    "An Uber Direct account plus a stocking partner, then UBER_DIRECT_TOKEN, UBER_DIRECT_CUSTOMER_ID and FULFILLMENT_PICKUP_ADDRESS.",
  ),

  async dispatch(input: DeliveryRequestInput): Promise<DispatchedDelivery> {
    if (!DIRECT_TOKEN || !DIRECT_CUSTOMER || !PICKUP_ADDRESS) {
      throw new Error("Uber Direct is not configured.");
    }
    const totalCents = input.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

    const data = await postJson(
      `https://api.uber.com/v1/customers/${DIRECT_CUSTOMER}/deliveries`,
      { authorization: `Bearer ${DIRECT_TOKEN}` },
      {
        pickup_address: PICKUP_ADDRESS,
        dropoff_address: input.dropoff.label,
        dropoff_notes: input.note,
        manifest_items: input.items.map((i) => ({ name: i.name, quantity: i.qty, price: i.priceCents })),
        manifest_total_value: totalCents,
      },
    );

    return {
      provider: "Uber Direct",
      deliveryId: String(data.id ?? ""),
      totalCents,
      etaMinutes: data.dropoff_eta ? Math.round((new Date(data.dropoff_eta).getTime() - Date.now()) / 60000) : null,
      trackingUrl: data.tracking_url ?? null,
    };
  },
};

/* -------------------------------------------------------------------------
   DoorDash Drive — the alternative dispatcher, same merchant-of-record rule.
   ---------------------------------------------------------------------- */

const DRIVE_JWT = process.env.DOORDASH_DRIVE_JWT;

export const doordashDrive: AutomaticDeliveryPort = {
  status: statusFor(
    "doordash-drive", "DoorDash Drive", Boolean(DRIVE_JWT && PICKUP_ADDRESS),
    "A DoorDash Drive developer account plus a stocking partner, then DOORDASH_DRIVE_JWT and FULFILLMENT_PICKUP_ADDRESS.",
  ),

  async dispatch(input: DeliveryRequestInput): Promise<DispatchedDelivery> {
    if (!DRIVE_JWT || !PICKUP_ADDRESS) throw new Error("DoorDash Drive is not configured.");
    const totalCents = input.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

    const data = await postJson(
      "https://openapi.doordash.com/drive/v2/deliveries",
      { authorization: `Bearer ${DRIVE_JWT}` },
      {
        external_delivery_id: `sh_${Date.now().toString(36)}`,
        pickup_address: PICKUP_ADDRESS,
        dropoff_address: input.dropoff.label,
        dropoff_instructions: input.note,
        order_value: totalCents,
      },
    );

    return {
      provider: "DoorDash",
      deliveryId: String(data.external_delivery_id ?? ""),
      totalCents,
      etaMinutes: data.dropoff_time_estimated
        ? Math.round((new Date(data.dropoff_time_estimated).getTime() - Date.now()) / 60000)
        : null,
      trackingUrl: data.tracking_url ?? null,
    };
  },
};

/* -------------------------------------------------------------------------
   Secure transport — a ride whose driver is a licensed protection professional.
   ---------------------------------------------------------------------- */

const SECURE_BASE = process.env.SECURE_TRANSPORT_API_BASE;
const SECURE_KEY = process.env.SECURE_TRANSPORT_API_KEY;
const SECURE_NAME = process.env.SECURE_TRANSPORT_PROVIDER ?? "Blackwolf";

/**
 * Provider-agnostic on purpose.
 *
 * The intended provider is Blackwolf, but I could not verify that they publish
 * a partner API, so nothing here is written against a guessed endpoint shape.
 * `SECURE_TRANSPORT_API_BASE` points at whatever they (or another licensed
 * operator) actually give you, and `docs/secure-transport.md` records the shape
 * this expects so the mapping is a small edit rather than a rewrite.
 *
 * Coverage is checked before the option is ever shown. Armed protective service
 * is licensed state by state — licence classes differ, reciprocity is patchy,
 * and an operator legal in one state may be committing a felony in the next.
 * Offering a service that cannot legally arrive is worse than not offering it,
 * because someone stops looking for another way home.
 */
export const secureTransport: SecureTransportPort = {
  status: statusFor(
    "secure-transport", SECURE_NAME, Boolean(SECURE_BASE && SECURE_KEY),
    `A partner agreement with ${SECURE_NAME} (or another licensed operator), then SECURE_TRANSPORT_API_BASE and SECURE_TRANSPORT_API_KEY.`,
  ),

  async coversLocation(at): Promise<boolean> {
    if (!SECURE_BASE || !SECURE_KEY) return false;
    try {
      const url = `${SECURE_BASE.replace(/\/$/, "")}/coverage?lat=${at.lat}&lng=${at.lng}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${SECURE_KEY}` } });
      if (!res.ok) return false;
      const data = (await res.json()) as { covered?: boolean };
      return data.covered === true;
    } catch {
      // Unreachable provider means not covered. Failing open here would offer a
      // ride that never comes.
      return false;
    }
  },

  async quote(input: RideRequestInput): Promise<SecureTransportQuote | null> {
    if (!SECURE_BASE || !SECURE_KEY) return null;
    if (!(await this.coversLocation(input.pickup))) return null;

    const data = await postJson(
      `${SECURE_BASE.replace(/\/$/, "")}/quotes`,
      { authorization: `Bearer ${SECURE_KEY}` },
      {
        pickup: { latitude: input.pickup.lat, longitude: input.pickup.lng },
        dropoff: { latitude: input.dropoff.lat, longitude: input.dropoff.lng },
      },
    );

    return {
      provider: SECURE_NAME,
      fareEstimateCents: Math.round(Number(data.fare_cents ?? 0)),
      currency: data.currency ?? "USD",
      etaMinutes: Number(data.eta_minutes ?? 0),
      description: `A licensed protection professional drives you home.`,
      disclosures: SECURE_TRANSPORT_DISCLOSURES,
    };
  },

  async book(input: RideRequestInput): Promise<BookedRide> {
    if (!SECURE_BASE || !SECURE_KEY) throw new Error(`${SECURE_NAME} is not configured.`);
    if (!(await this.coversLocation(input.pickup))) {
      throw new Error(`${SECURE_NAME} does not operate where you are right now.`);
    }

    const data = await postJson(
      `${SECURE_BASE.replace(/\/$/, "")}/rides`,
      { authorization: `Bearer ${SECURE_KEY}` },
      {
        pickup: { latitude: input.pickup.lat, longitude: input.pickup.lng, label: input.pickup.label },
        dropoff: { latitude: input.dropoff.lat, longitude: input.dropoff.lng, label: input.dropoff.label },
        passenger: { name: input.riderName, phone: input.riderPhone },
        note: input.note,
      },
    );

    return {
      provider: SECURE_NAME,
      bookingId: String(data.id ?? ""),
      fareEstimateCents: typeof data.fare_cents === "number" ? data.fare_cents : null,
      currency: data.currency ?? "USD",
      etaMinutes: typeof data.eta_minutes === "number" ? data.eta_minutes : null,
      trackingUrl: data.tracking_url ?? null,
      driver: data.driver ? { name: data.driver.name, vehicle: data.driver.vehicle, plate: data.driver.plate } : undefined,
    };
  },
};

/* -------------------------------------------------------------------------
   Personal concierge — a bounded, in-person task done by a licensed partner-
   network professional. Same shape as secure transport above, and the same
   reasoning: this is a partner agreement, not an API key Safehubby can apply
   for, so it stays handoff until one exists rather than guessing an endpoint.
   ---------------------------------------------------------------------- */

const CONCIERGE_BASE = process.env.CONCIERGE_API_BASE;
const CONCIERGE_KEY = process.env.CONCIERGE_API_KEY;
const CONCIERGE_NAME = process.env.CONCIERGE_PROVIDER ?? "Nearby Aide";

export const concierge: ConciergePort = {
  status: statusFor(
    "concierge", CONCIERGE_NAME, Boolean(CONCIERGE_BASE && CONCIERGE_KEY),
    `A partner agreement with ${CONCIERGE_NAME} (or another vetted, insured concierge network), then CONCIERGE_API_BASE and CONCIERGE_API_KEY.`,
  ),

  async coversLocation(at): Promise<boolean> {
    if (!CONCIERGE_BASE || !CONCIERGE_KEY) return false;
    try {
      const url = `${CONCIERGE_BASE.replace(/\/$/, "")}/coverage?lat=${at.lat}&lng=${at.lng}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${CONCIERGE_KEY}` } });
      if (!res.ok) return false;
      const data = (await res.json()) as { covered?: boolean };
      return data.covered === true;
    } catch {
      // Unreachable provider means not covered. Failing open would offer a
      // task that never gets accepted.
      return false;
    }
  },

  /**
   * The roster, so a subscriber can pick a specific person rather than leave
   * assignment to the network. `max_concurrent_customers` is that assistant's
   * own stated comfort level, collected by the partner network when they
   * joined it — not something Safehubby asks or sets; see concierge.ts.
   */
  async listAssistants(input): Promise<AssistantListing[]> {
    if (!CONCIERGE_BASE || !CONCIERGE_KEY) return [];
    try {
      const url = `${CONCIERGE_BASE.replace(/\/$/, "")}/assistants`
        + `?category=${encodeURIComponent(input.category)}&lat=${input.location.lat}&lng=${input.location.lng}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${CONCIERGE_KEY}` } });
      if (!res.ok) return [];
      const data = (await res.json()) as { assistants?: any[] };
      return (data.assistants ?? []).map((a) => ({
        id: String(a.id ?? ""),
        name: String(a.name ?? "Assistant"),
        bio: a.bio ?? undefined,
        photoUrl: a.photo_url ?? undefined,
        categories: Array.isArray(a.categories) ? a.categories.map(String) : [],
        maxConcurrentCustomers: Number(a.max_concurrent_customers ?? 1),
        currentCustomers: Number(a.current_customers ?? 0),
      }));
    } catch {
      // Same as an empty roster from the network's own point of view — never
      // invent candidates because the request failed.
      return [];
    }
  },

  async quote(input: ConciergeTaskRequest): Promise<ConciergeQuote | null> {
    if (!CONCIERGE_BASE || !CONCIERGE_KEY) return null;
    if (!(await this.coversLocation(input.location))) return null;

    const data = await postJson(
      `${CONCIERGE_BASE.replace(/\/$/, "")}/quotes`,
      { authorization: `Bearer ${CONCIERGE_KEY}` },
      {
        category: input.category,
        location: { latitude: input.location.lat, longitude: input.location.lng },
        assistant_id: input.assistantId,
      },
    );

    return {
      provider: CONCIERGE_NAME,
      etaMinutes: Number(data.eta_minutes ?? 0),
      description: `A ${CONCIERGE_NAME} assistant comes to you for this task.`,
    };
  },

  async book(input: ConciergeTaskRequest): Promise<BookedConciergeTask> {
    if (!CONCIERGE_BASE || !CONCIERGE_KEY) throw new Error(`${CONCIERGE_NAME} is not configured.`);
    if (!(await this.coversLocation(input.location))) {
      throw new Error(`${CONCIERGE_NAME} does not operate where you are right now.`);
    }

    const data = await postJson(
      `${CONCIERGE_BASE.replace(/\/$/, "")}/tasks`,
      { authorization: `Bearer ${CONCIERGE_KEY}` },
      {
        category: input.category,
        note: input.note,
        location: { latitude: input.location.lat, longitude: input.location.lng, label: input.location.label },
        spend_cap_cents: input.spendCapCents,
        requester: { name: input.requesterName, phone: input.requesterPhone },
        assistant_id: input.assistantId,
        // The card is for the assistant to spend from, not for the partner
        // network to hold — passed along so their dispatch can hand it off.
        card: input.card ? { last4: input.card.last4, reveal_url: input.card.revealUrl } : undefined,
      },
    );

    return {
      provider: CONCIERGE_NAME,
      taskId: String(data.id ?? ""),
      etaMinutes: typeof data.eta_minutes === "number" ? data.eta_minutes : null,
      trackingUrl: data.tracking_url ?? null,
      assistant: data.assistant ? { name: data.assistant.name, phone: data.assistant.phone } : undefined,
    };
  },
};

/**
 * Whichever fulfiller is configured, in order of how close it gets to done.
 *
 * Instacart first: it already has the stores, the shoppers and the checkout, so
 * it needs an API key rather than a supplier agreement. The courier dispatchers
 * come after, and only make sense once Safehubby holds stock of its own.
 */
export const deliveryDispatcher = (): AutomaticDeliveryPort => {
  if (instacart.status.mode === "automatic") return instacart;
  if (uberDirect.status.mode === "automatic") return uberDirect;
  if (doordashDrive.status.mode === "automatic") return doordashDrive;
  return instacart;
};

export const fulfillmentStatus = () => ({
  rides: uberForBusiness.status,
  delivery: deliveryDispatcher().status,
  walmart: walmartStatus(),
  secureTransport: secureTransport.status,
  concierge: concierge.status,
  cardIssuing: revolutCards.status,
  /** Links used whenever a provider is in handoff mode. */
  fallbacks: { rides: ridesFor, pharmacy: pharmacySearch, walmart: walmartLink },
});
