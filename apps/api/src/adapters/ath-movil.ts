import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * ATH Móvil, Puerto Rico's own payment network, run by Evertec.
 *
 * A processor of its own, separate from PayPal: a separate merchant account,
 * separate credentials, separate settlement — so it gets an adapter.
 *
 * Worth supporting for the obvious reason: on the island ATH Móvil is not an
 * alternative to cards, it is the default way people pay each other, and a
 * meaningful number of customers have it where they do not have a card they
 * would type into a form.
 *
 * As with PayPal, the customer-facing half lives in the browser:
 * Evertec's own `athmovil-javascript-api` renders the Payment Button, the
 * customer confirms in the ATH Móvil app, and the button hands back an
 * `ecommerceId`. This server never sees an ATH Móvil login. `verifyMethod`
 * resolves that id against the Payment Button API to read back what Evertec
 * itself recorded, rather than trusting the browser's claim.
 *
 * Verified against Evertec's public repository (github.com/evertec/ATHM-Payment-Button-API):
 *   POST https://payments.athmovil.com/api/business-transaction/ecommerce/business/findPayment
 *        { ecommerceId, publicToken } → { ecommerceStatus, referenceNumber, ... }
 * The public token is the merchant's own, from the Settings section of the
 * ATH Móvil Business app; the private token is only needed for refunds, so
 * it is required here too rather than deferred — a processor that can take
 * money but not give it back is not one worth turning on.
 *
 * Testing: Evertec accepts the literal public token `dummy` for simulated
 * payments against production, so there is no separate sandbox host to
 * configure the way PayPal needs one.
 */

// Read at the moment of use rather than at import, so a test (or a redeploy
// that sets the variables) is never stuck with what the process booted with.
const publicToken = () => process.env.ATH_MOVIL_PUBLIC_TOKEN;
const privateToken = () => process.env.ATH_MOVIL_PRIVATE_TOKEN;
const apiBase = () => (process.env.ATH_MOVIL_API_BASE ?? "https://payments.athmovil.com").replace(/\/$/, "");

/** ATH Móvil settles in US dollars only — it is a Puerto Rico network, and
 *  the island is on USD. Stated here so nothing upstream assumes otherwise. */
export const ATH_MOVIL_CURRENCY = "USD";

export const athMovilProcessor: ChargeProcessorPort = {
  get status() {
    return statusFor(
      "ath-movil", "ATH Móvil", Boolean(publicToken() && privateToken()),
      "An ATH Móvil Business account, then ATH_MOVIL_PUBLIC_TOKEN and ATH_MOVIL_PRIVATE_TOKEN from its Settings tab.",
    );
  },

  async verifyMethod(ecommerceId: string): Promise<VerifiedMethod> {
    if (!publicToken() || !privateToken()) throw new Error("ATH Móvil is not configured.");
    const data = await findAthPayment(ecommerceId);
    if (data.ecommerceStatus !== "COMPLETED") {
      throw new Error(`ATH Móvil reported the payment as ${data.ecommerceStatus ?? "unknown"}, not completed.`);
    }

    // No card behind this, so no expiry to read back — see the optional
    // expiry on `PaymentMethodOnFile`. The last four of the linked phone
    // number is what the customer recognises the account by, and is the
    // only identifying digits Evertec returns worth storing.
    return {
      brand: "ATH Móvil",
      last4: String(data.phoneNumber ?? "").replace(/\D/g, "").slice(-4),
    };
  },
};

export interface AthPayment {
  ecommerceStatus?: string;
  referenceNumber?: string;
  phoneNumber?: string;
  /** Dollars, as Evertec reports it. */
  total?: number;
  metadata1?: string;
  metadata2?: string;
}

/** What Evertec itself recorded for a payment — the only thing worth believing
 *  about one, since the browser's callback is just the customer's own claim. */
export async function findAthPayment(ecommerceId: string): Promise<AthPayment> {
  const token = publicToken();
  if (!token) throw new Error("ATH Móvil is not configured.");
  const res = await fetch(`${apiBase()}/api/business-transaction/ecommerce/business/findPayment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ecommerceId, publicToken: token }),
  });
  if (!res.ok) throw new Error(`ATH Móvil could not verify that payment: ${res.status}`);
  return (await res.json()) as AthPayment;
}

/** The merchant's public token, which Evertec's own browser button needs.
 *  Public by design — it only identifies the business; the private token,
 *  which can refund, never leaves the server. */
export const athPublicToken = (): string | null => publicToken() ?? null;

/** Refunds part or all of one original payment, back to the customer's own ATH Móvil. */
export async function refundAthPayment(referenceNumber: string, amountCents: number): Promise<void> {
  const pub = publicToken();
  const priv = privateToken();
  if (!pub || !priv) throw new Error("ATH Móvil is not configured.");
  const res = await fetch(`${apiBase()}/api/business-transaction/ecommerce/refund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicToken: pub, privateToken: priv, referenceNumber,
      amount: (amountCents / 100).toFixed(2), message: "Safehubby balance refund",
    }),
  });
  if (!res.ok) throw new Error(`ATH Móvil could not refund that payment: ${res.status}`);
  const data = (await res.json()) as { refund?: { status?: string } };
  if (data.refund?.status !== "COMPLETED") {
    throw new Error(`ATH Móvil reported the refund as ${data.refund?.status ?? "unknown"}.`);
  }
}
