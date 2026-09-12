import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * PayPal as a second, independent payment processor — genuinely separate
 * from Stripe, unlike Apple Pay/Google Pay (see stripe.ts), since PayPal is
 * its own account, its own rails, and its own settlement.
 *
 * As with Stripe, the customer's PayPal button lives entirely in the
 * browser via PayPal's own JS SDK, which vaults the payment source and hands
 * back a payment-token id. This server never sees PayPal login credentials —
 * only that token, which `verifyMethod` resolves against PayPal's Vault API
 * to read back what was actually vaulted.
 *
 * Verified against PayPal's public API docs (developer.paypal.com/api/rest):
 *   POST /v1/oauth2/token             client-credentials → short-lived access token
 *   GET  /v3/vault/payment-tokens/{id} the vaulted payment source
 * `PAYPAL_API_BASE` should point at `api-m.sandbox.paypal.com` for testing
 * and `api-m.paypal.com` in production — PayPal does not use a query-param
 * or header flag to pick the environment the way Uber's sandbox does.
 */

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = (process.env.PAYPAL_API_BASE ?? "https://api-m.paypal.com").replace(/\/$/, "");

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  return String(data.access_token ?? "");
}

export const paypalProcessor: ChargeProcessorPort = {
  status: statusFor(
    "paypal", "PayPal", Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
    "A PayPal REST app's client id and secret, then PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
  ),

  async verifyMethod(token: string): Promise<VerifiedMethod> {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("PayPal is not configured.");

    const accessToken = await getAccessToken();
    const res = await fetch(`${PAYPAL_API}/v3/vault/payment-tokens/${encodeURIComponent(token)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`PayPal could not verify that payment method: ${res.status}`);
    const data = (await res.json()) as {
      payment_source?: { card?: { brand?: string; last_digits?: string; expiry?: string } };
    };
    const card = data.payment_source?.card ?? {};

    return {
      brand: String(card.brand ?? "PayPal"),
      last4: String(card.last_digits ?? ""),
      expMonth: Number((card.expiry ?? "").split("-")[1] ?? 0),
      expYear: Number((card.expiry ?? "").split("-")[0] ?? 0),
    };
  },
};
