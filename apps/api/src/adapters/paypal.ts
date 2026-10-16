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

/**
 * Step one of saving a PayPal account without a purchase: ask PayPal for a
 * setup token, which the browser's PayPal button then asks the customer to
 * approve. Nothing is charged — see developer.paypal.com/sdk/js/v5/save-without-purchase/paypal.
 */
export async function createSetupToken(returnUrl: string): Promise<string> {
  if (!clientId() || !clientSecret()) throw new Error("PayPal is not configured.");
  const accessToken = await getAccessToken();
  const res = await fetch(`${apiBase()}/v3/vault/setup-tokens`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          experience_context: { return_url: returnUrl, cancel_url: returnUrl },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`PayPal could not start saving that account: ${res.status}`);
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
        venmo?: { email_address?: string };
      };
    };
    const source = data.payment_source ?? {};

    // A vaulted PayPal or Venmo account has no card behind it: no digits and
    // nothing to expire. It is recognised by its masked email.
    const wallet = source.paypal ?? source.venmo;
    if (wallet) {
      return {
        brand: source.venmo ? "Venmo" : "PayPal",
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
