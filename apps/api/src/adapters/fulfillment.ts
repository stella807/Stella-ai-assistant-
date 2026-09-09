import type {
  AutomaticDeliveryPort, AutomaticRidePort, BookedRide, DeliveryRequestInput,
  DispatchedDelivery, RideRequestInput, SecureTransportPort, SecureTransportQuote,
} from "@safehubby/core";
import { SECURE_TRANSPORT_DISCLOSURES, statusFor } from "@safehubby/core";
import { ridesFor, pharmacySearch } from "@safehubby/core";
import { instacart, walmartLink, walmartStatus } from "./grocery.ts";

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

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
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
   Uber for Business — "rides for others"
   Requires an Uber for Business organisation, an OAuth client, and the
   guest-rides scope. This is the successor to Uber Central and is the only
   sanctioned way for an app to book a ride for someone who is not the
   account holder.
   ---------------------------------------------------------------------- */

const UBER_TOKEN = process.env.UBER_BUSINESS_TOKEN;
const UBER_ORG = process.env.UBER_BUSINESS_ORG_ID;
const UBER_API = process.env.UBER_API_BASE ?? "https://api.uber.com/v1/guests";

export const uberForBusiness: AutomaticRidePort = {
  status: statusFor(
    "uber-business", "Uber", Boolean(UBER_TOKEN && UBER_ORG),
    "An Uber for Business organisation with guest-rides enabled, then UBER_BUSINESS_TOKEN and UBER_BUSINESS_ORG_ID.",
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
  /** Links used whenever a provider is in handoff mode. */
  fallbacks: { rides: ridesFor, pharmacy: pharmacySearch, walmart: walmartLink },
});
