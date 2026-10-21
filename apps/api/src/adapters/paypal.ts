import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * PayPal, Safehubby's processor for saved payment methods: its own account,
 * its own rails and its own settlement.
 *
 * The customer's PayPal button lives entirely in the browser via PayPal's own
 * JS SDK, which vaults the payment source and hands back a payment-token id.
 * This server never sees PayPal login credentials — only that token, which
 * `verifyMethod` resolves against PayPal's Vault API to read back what was
 * actually vaulted. Taking money from it later is at the bottom of this file.
 *
 * Verified against PayPal's public API docs (developer.paypal.com/api/rest):
 *   POST /v1/oauth2/token             client-credentials → short-lived access token
 *   GET  /v3/vault/payment-tokens/{id} the vaulted payment source
 * `PAYPAL_API_BASE` should point at `api-m.sandbox.paypal.com` for testing
 * and `api-m.paypal.com` in production — PayPal does not use a query-param
 * or header flag to pick the environment.
 */

// Read when used, not at import, so a redeploy or a test is never stuck with
// what the process booted with.
const clientId = () => process.env.PAYPAL_CLIENT_ID;
const clientSecret = () => process.env.PAYPAL_CLIENT_SECRET;
const apiBase = () => (process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com").replace(/\/$/, "");

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  return String(data.access_token ?? "");
}

/** The merchant's client id, which PayPal's own browser button needs. Public
 *  by design; the secret never leaves the server. */
export const paypalClientId = (): string | null => clientId() ?? null;

/** `jordan.lee@gmail.com` -> `j***@gmail.com`: enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  if (!name || !domain) return "PayPal account";
  return `${name[0]}***@${domain}`;
}

const jsonHeaders = (accessToken: string) => ({
  "content-type": "application/json",
  authorization: `Bearer ${accessToken}`,
  // PayPal de-duplicates on this, so a retried request cannot vault twice.
  "paypal-request-id": `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
});

/** What a setup token is for: a PayPal account (PayPal's button) or a typed
 *  card (PayPal's card fields). */
export type SetupKind = "paypal" | "card";

/** The setup token's body. A card is saved empty — PayPal's own fields fill
 *  in the number, so it never reaches this server — and asks the bank for
 *  3-D Secure only when the bank wants it. */
export function setupTokenBody(kind: SetupKind, returnUrl: string) {
  const experience_context = { return_url: returnUrl, cancel_url: returnUrl };
  return kind === "card"
    ? { payment_source: { card: { verification_method: "SCA_WHEN_REQUIRED", experience_context } } }
    : { payment_source: { paypal: { usage_type: "MERCHANT", experience_context } } };
}

/**
 * Step one of saving a payment method without a purchase: ask PayPal for a
 * setup token, which the browser's PayPal button or card fields then complete.
 * Nothing is charged — see developer.paypal.com/docs/checkout/save-payment-methods/purchase-later.
 */
export async function createSetupToken(returnUrl: string, kind: SetupKind = "paypal"): Promise<string> {
  if (!clientId() || !clientSecret()) throw new Error("PayPal is not configured.");
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase()}/v3/vault/setup-tokens`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(setupTokenBody(kind, returnUrl)),
  });
  if (!res.ok) throw await paypalError(res, kind === "card" ? "PayPal could not start saving that card" : "PayPal could not start saving that account");
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("PayPal did not return a setup token.");
  return data.id;
}

/** Step two, after the customer approves: turn the setup token into the
 *  durable payment token that `verifyMethod` reads back and a later charge uses. */
export async function exchangeSetupToken(setupTokenId: string): Promise<string> {
  if (!clientId() || !clientSecret()) throw new Error("PayPal is not configured.");
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase()}/v3/vault/payment-tokens`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({ payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } }),
  });
  if (!res.ok) throw new Error(`PayPal could not save that account: ${res.status}`);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("PayPal did not return a payment token.");
  return data.id;
}

export const paypalProcessor: ChargeProcessorPort = {
  get status() {
    return statusFor(
      "paypal", "PayPal", Boolean(clientId() && clientSecret()),
      "A PayPal REST app's client id and secret, then PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  },

  async verifyMethod(token: string): Promise<VerifiedMethod> {
    if (!clientId() || !clientSecret()) throw new Error("PayPal is not configured.");

    const accessToken = await getAccessToken();
    const res = await fetch(`${apiBase()}/v3/vault/payment-tokens/${encodeURIComponent(token)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`PayPal could not verify that payment method: ${res.status}`);
    const data = (await res.json()) as {
      payment_source?: {
        card?: { brand?: string; last_digits?: string; expiry?: string };
        paypal?: { email_address?: string };
      };
    };
    const source = data.payment_source ?? {};

    // A vaulted PayPal account has no card behind it: no digits and nothing
    // to expire. It is recognised by its masked email.
    const wallet = source.paypal;
    if (wallet) {
      return {
        brand: "PayPal",
        last4: "",
        accountLabel: maskEmail(String(wallet.email_address ?? "")),
      };
    }

    const card = source.card ?? {};
    return {
      brand: String(card.brand ?? "PayPal"),
      last4: String(card.last_digits ?? ""),
      expMonth: Number((card.expiry ?? "").split("-")[1] ?? 0),
      expYear: Number((card.expiry ?? "").split("-")[0] ?? 0),
    };
  },
};

/* ---------------------------------------------------------------------------
   Taking money from a saved PayPal account: reserve, take, release, charge
   ------------------------------------------------------------------------ */

export const paypalChargingReady = () => Boolean(clientId() && clientSecret());

/** A hold's `processorRef` for PayPal, so a later capture or void knows whose it is. */
export const PAYPAL_REF_PREFIX = "paypal:";

const dollarString = (cents: number) => (cents / 100).toFixed(2);

/** Which `payment_source` key a saved method belongs under. */
export function sourceKeyFor(method: { brand: string; last4: string }): "paypal" | "card" {
  return method.last4 ? "card" : "paypal";
}

/** PayPal's own words for what went wrong, rather than a bare status code. */
async function paypalError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as
    | { message?: string; details?: { issue?: string; description?: string }[] } | null;
  return new Error(body?.details?.[0]?.description ?? body?.message ?? `${fallback} (${res.status})`);
}

async function paypalPost<T>(path: string, body: unknown, requestId: string): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      // PayPal de-duplicates on this, so a retried or repeated request never charges twice.
      "paypal-request-id": requestId,
      prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await paypalError(res, "PayPal rejected that request");
  return (await res.json().catch(() => ({}))) as T;
}

interface PaypalOrder {
  id?: string;
  status?: string;
  purchase_units?: { payments?: {
    authorizations?: { id?: string; status?: string }[];
    captures?: { id?: string; status?: string }[];
  } }[];
}

/** An order that charges a saved method with nobody present — merchant-initiated. */
function orderFor(input: {
  paymentTokenId: string; method: { brand: string; last4: string }; amountCents: number; description: string;
  intent: "AUTHORIZE" | "CAPTURE";
}) {
  const key = sourceKeyFor(input.method);
  return {
    intent: input.intent,
    purchase_units: [{
      amount: { currency_code: "USD", value: dollarString(input.amountCents) },
      description: input.description.slice(0, 127),
    }],
    payment_source: {
      [key]: {
        vault_id: input.paymentTokenId,
        stored_credential: { payment_initiator: "MERCHANT", usage: "SUBSEQUENT", ...(key === "card" ? { payment_type: "UNSCHEDULED" } : {}) },
      },
    },
  };
}

/**
 * Reserves an exact amount on a saved PayPal account without taking it — the
 * a held amount that is captured later or released. PayPal keeps an authorization
 * open for 29 days (honoured for the first 3), far longer than the 24-hour
 * hold the app places, so it is captured or voided well inside that.
 */
export async function authorizeWithPaypal(input: {
  paymentTokenId: string; method: { brand: string; last4: string }; amountCents: number; description: string; idempotencyKey: string;
}): Promise<{ id: string }> {
  if (!paypalChargingReady()) throw new Error("PayPal is not configured.");
  const order = await paypalPost<PaypalOrder>("/v2/checkout/orders", orderFor({ ...input, intent: "AUTHORIZE" }), input.idempotencyKey);
  const auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (order.status !== "COMPLETED" || !auth?.id || auth.status === "DENIED") {
    // Usually PayPal wanting the customer to approve it themselves, with
    // nobody there to do it.
    throw new Error("PayPal needs you to approve this payment yourself. Open PayPal, or use a different payment method.");
  }
  return { id: `${PAYPAL_REF_PREFIX}${auth.id}` };
}

const authIdOf = (ref: string) => ref.startsWith(PAYPAL_REF_PREFIX) ? ref.slice(PAYPAL_REF_PREFIX.length) : ref;

/** Takes what was spent and lets the rest of the reservation go. */
export async function capturePaypalHold(ref: string, amountCents: number): Promise<void> {
  if (!paypalChargingReady()) throw new Error("PayPal is not configured.");
  if (amountCents <= 0) { await voidPaypalHold(ref); return; }
  const id = authIdOf(ref);
  const capture = await paypalPost<{ status?: string }>(`/v2/payments/authorizations/${encodeURIComponent(id)}/capture`, {
    amount: { currency_code: "USD", value: dollarString(amountCents) },
    // Final: whatever is left of the reservation is released, not left open.
    final_capture: true,
  }, `capture-${id}`);
  if (capture.status === "DECLINED" || capture.status === "FAILED") throw new Error("PayPal declined to take that payment.");
}

export async function voidPaypalHold(ref: string): Promise<void> {
  if (!paypalChargingReady()) throw new Error("PayPal is not configured.");
  const id = authIdOf(ref);
  await paypalPost(`/v2/payments/authorizations/${encodeURIComponent(id)}/void`, {}, `void-${id}`);
}

/** Takes a payment outright from a saved PayPal account — a plan's charge. */
export async function chargeWithPaypal(input: {
  paymentTokenId: string; method: { brand: string; last4: string }; amountCents: number; description: string; idempotencyKey: string;
}): Promise<{ id: string }> {
  if (!paypalChargingReady()) throw new Error("PayPal is not configured.");
  const order = await paypalPost<PaypalOrder>("/v2/checkout/orders", orderFor({ ...input, intent: "CAPTURE" }), input.idempotencyKey);
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  // PENDING is PayPal reviewing a payment it has accepted; the money is coming.
  const accepted = capture?.status === "COMPLETED" || capture?.status === "PENDING";
  if (order.status !== "COMPLETED" || !capture?.id || !accepted) {
    throw new Error("PayPal needs you to approve this payment yourself. Open PayPal, or use a different payment method.");
  }
  return { id: capture.id };
}
