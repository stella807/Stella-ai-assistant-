import type { AutomaticDeliveryPort, DeliveryRequestInput, DispatchedDelivery, NearbyStore, StorePort } from "@safehubby/core";
import { statusFor } from "@safehubby/core";
import { mockStores } from "./mock-providers.ts";

/**
 * Grocery and pharmacy fulfilment via Instacart and Walmart.
 *
 * These replaced the courier dispatchers because they fit the actual job. Uber
 * Direct and DoorDash Drive move *your own* goods, so using them meant becoming
 * a merchant and holding stock. Instacart already has the stores, the shoppers
 * and the checkout.
 *
 * What each one can really do, checked against their documentation rather than
 * assumed:
 *
 *  - **Instacart Developer Platform** — self-serve API key. The Shopping Lists
 *    API takes line items and returns a link that opens Instacart with the
 *    basket already built; the customer completes checkout there. That is one
 *    tap from done, and it is genuinely automatic on our side: the basket is
 *    assembled by us, not typed by a drunk person at 1am.
 *
 *  - **Walmart** — no public consumer ordering API. The Content Provider
 *    (affiliate) API gives catalogue data and tracked links that earn
 *    commission, and an AddToCart proxy exists but needs approval and a
 *    business case. So Walmart is the affiliate path and the fallback, not the
 *    fulfilment path.
 *
 * Neither charges the user's card through us, which keeps the consent rule
 * from care-package.ts intact: Safehubby prepares, the customer confirms.
 */

const TIMEOUT_MS = 8000;

/* -------------------------------------------------------- Picking a store */

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const STORE_SEARCH_RADIUS_M = 1500;

/**
 * Real, nearby, named stores to choose from — same Google Places key and
 * request shape venues.ts uses for bars, aimed at grocery and pharmacy types
 * instead.
 *
 * What this can and cannot do: Places can tell you a Walgreens exists three
 * blocks away. It cannot tell you Instacart's internal id for that Walgreens —
 * that comes only from Instacart's own Retailers endpoint, keyed by postal
 * code, which is a separate integration this app does not have. So picking a
 * store here does not silently reroute the Instacart cart to it; it is passed
 * along as a note on the order (`buildStoreNote` below) — a real preference
 * the shopper sees, not a routing guarantee this app cannot back.
 */
async function placesNearbyStores(at: { lat: number; lng: number }): Promise<NearbyStore[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY!,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        includedTypes: ["grocery_store", "supermarket", "pharmacy", "convenience_store"],
        maxResultCount: 12,
        locationRestriction: { circle: { center: { latitude: at.lat, longitude: at.lng }, radius: STORE_SEARCH_RADIUS_M } },
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { places?: any[] };
    return (data.places ?? []).map((p: any): NearbyStore => ({
      id: `places:${p.id}`,
      name: p.displayName?.text ?? "Unnamed store",
      address: p.formattedAddress ?? "",
      lat: p.location?.latitude ?? at.lat,
      lng: p.location?.longitude ?? at.lng,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/** Google Places when configured, the fixed mock list otherwise — the app runs with no key. */
export const storeLocator: StorePort = {
  async nearby(at) {
    if (PLACES_KEY) {
      try {
        const found = await placesNearbyStores(at);
        if (found.length) return found;
      } catch {
        // fall through to the mock rather than an empty picker
      }
    }
    return mockStores.nearby(at);
  },
};

export const storeLocatorSource = PLACES_KEY ? "google-places" : "mock";

/**
 * Turns a chosen store into the free-text note Instacart shows the shopper
 * (`instructions` on the Shopping List). Pure and exported so the wording is
 * testable without a network call.
 */
export function buildStoreNote(store: { name: string; address?: string } | null | undefined): string | undefined {
  if (!store?.name) return undefined;
  return store.address
    ? `Please shop at ${store.name}, ${store.address} if it's available.`
    : `Please shop at ${store.name} if it's available.`;
}

/* ---------------------------------------------------------------- Instacart */

const INSTACART_KEY = process.env.INSTACART_API_KEY;
const INSTACART_BASE = process.env.INSTACART_API_BASE ?? "https://connect.instacart.com";
const LINKBACK_URL = process.env.PUBLIC_APP_URL;

/**
 * Built from the documented Shopping Lists shape. Response and request fields
 * are read defensively and mapped in one place, so if their schema differs from
 * the docs this is a small edit rather than a rewrite — see docs/fulfillment.md.
 */
export const instacart: AutomaticDeliveryPort = {
  status: statusFor(
    "instacart", "Instacart", Boolean(INSTACART_KEY),
    "An Instacart Developer Platform API key (self-serve at docs.instacart.com), then INSTACART_API_KEY.",
  ),

  async dispatch(input: DeliveryRequestInput): Promise<DispatchedDelivery> {
    if (!INSTACART_KEY) throw new Error("Instacart is not configured.");
    const totalCents = input.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${INSTACART_BASE.replace(/\/$/, "")}/idp/v1/products/products_link`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${INSTACART_KEY}` },
        body: JSON.stringify({
          title: "Safehubby — getting you through tonight",
          link_type: "shopping_list",
          // Short-lived on purpose: a cart built for one night should not sit
          // in someone's messages for a fortnight waiting to be tapped.
          expires_in: 1,
          instructions: input.note ? [input.note] : undefined,
          line_items: input.items.map((i) => ({
            name: i.name,
            quantity: i.qty,
            unit: "each",
            display_text: i.name,
          })),
          landing_page_configuration: {
            partner_linkback_url: LINKBACK_URL,
            enable_pantry_items: true,
          },
        }),
      });

      if (!res.ok) throw new Error(`Instacart ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
      const data = (await res.json()) as { products_link_url?: string };

      return {
        provider: "Instacart",
        deliveryId: `ic_${Date.now().toString(36)}`,
        totalCents,
        // Instacart quotes the delivery window at checkout; we do not guess it.
        etaMinutes: null,
        trackingUrl: data.products_link_url ?? null,
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

/* ------------------------------------------------------------------ Walmart */

const WALMART_PUBLISHER = process.env.WALMART_PUBLISHER_ID;
const WALMART_CAMPAIGN = process.env.WALMART_CAMPAIGN_ID ?? "9383";

/**
 * A tracked affiliate link into a Walmart search.
 *
 * This is the honest ceiling without approval: Walmart publishes no consumer
 * ordering API, and its terms forbid scraping the catalogue. The affiliate
 * programme does pay commission on what people buy through the link, which is
 * a real revenue line — and one that replaces the ride commission that turned
 * out not to exist.
 */
export function walmartLink(query: string): { provider: string; url: string; tracked: boolean; description: string } {
  const search = `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;
  if (!WALMART_PUBLISHER) {
    return {
      provider: "Walmart",
      url: search,
      tracked: false,
      description: "Opens Walmart with the basket searched. You place the order there.",
    };
  }
  return {
    provider: "Walmart",
    url: `https://goto.walmart.com/c/${WALMART_PUBLISHER}/${WALMART_CAMPAIGN}/9383?u=${encodeURIComponent(search)}`,
    tracked: true,
    description: "Opens Walmart with the basket searched. You place the order there.",
  };
}

export const walmartStatus = () =>
  statusFor(
    "walmart", "Walmart", Boolean(WALMART_PUBLISHER),
    "A Walmart affiliate (Content Provider) account, then WALMART_PUBLISHER_ID. Ordering in-app additionally needs AddToCart approval.",
  );
