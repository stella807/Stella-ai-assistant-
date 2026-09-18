import type { ChargeProcessorPort, VerifiedMethod } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * ATH Móvil, Puerto Rico's own payment network, run by Evertec.
 *
 * The third real processor here, and the only one of the recent additions
 * that earns that: Klarna, Amazon Pay, Cash App and the rest are brands
 * Stripe surfaces on the Stripe account this app already has, so they need
 * no backend of their own (see `PayBrand` in payment.ts). ATH Móvil is
 * reachable through neither Stripe nor PayPal — it is a separate merchant
 * account, separate credentials, separate settlement — so it gets an adapter.
 *
 * Worth supporting for the obvious reason: on the island ATH Móvil is not an
 * alternative to cards, it is the default way people pay each other, and a
 * meaningful number of customers have it where they do not have a card they
 * would type into a form.
 *
 * As with Stripe and PayPal, the customer-facing half lives in the browser:
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

const ATH_PUBLIC_TOKEN = process.env.ATH_MOVIL_PUBLIC_TOKEN;
const ATH_PRIVATE_TOKEN = process.env.ATH_MOVIL_PRIVATE_TOKEN;
const ATH_API = (process.env.ATH_MOVIL_API_BASE ?? "https://payments.athmovil.com").replace(/\/$/, "");

/** ATH Móvil settles in US dollars only — it is a Puerto Rico network, and
 *  the island is on USD. Stated here so nothing upstream assumes otherwise. */
export const ATH_MOVIL_CURRENCY = "USD";

export const athMovilProcessor: ChargeProcessorPort = {
  status: statusFor(
    "ath-movil", "ATH Móvil", Boolean(ATH_PUBLIC_TOKEN && ATH_PRIVATE_TOKEN),
    "An ATH Móvil Business account, then ATH_MOVIL_PUBLIC_TOKEN and ATH_MOVIL_PRIVATE_TOKEN from its Settings tab.",
  ),

  async verifyMethod(ecommerceId: string): Promise<VerifiedMethod> {
    if (!ATH_PUBLIC_TOKEN || !ATH_PRIVATE_TOKEN) throw new Error("ATH Móvil is not configured.");

    const res = await fetch(`${ATH_API}/api/business-transaction/ecommerce/business/findPayment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ecommerceId, publicToken: ATH_PUBLIC_TOKEN }),
    });
    if (!res.ok) throw new Error(`ATH Móvil could not verify that payment: ${res.status}`);

    const data = (await res.json()) as {
      ecommerceStatus?: string;
      referenceNumber?: string;
      phoneNumber?: string;
    };
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
