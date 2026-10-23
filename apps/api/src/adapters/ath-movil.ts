/**
 * ATH Móvil, through ATH Business's Payment Button API (Evertec).
 *
 * A payment is one the customer approves in their own ATH Móvil app: we open
 * it for an amount and their ATH Móvil phone number, they approve it on the
 * phone (status CONFIRM), and only then does this server authorize it, which
 * is what actually moves the money (status COMPLETED). There is no saved
 * account to charge later, so — like crypto — it only ever loads the prepaid
 * balance.
 *
 * Evertec offers no test environment, so tests stub `fetch` and the first real
 * check is a small live payment. Tokens are read at call time, so setting them
 * in Railway takes effect without a restart.
 */

const base = () => (process.env.ATH_MOVIL_API_BASE ?? "https://payments.athmovil.com").replace(/\/$/, "");
const publicToken = () => (process.env.ATH_MOVIL_PUBLIC_TOKEN ?? "").trim();
const privateToken = () => (process.env.ATH_MOVIL_PRIVATE_TOKEN ?? "").trim();

export const athReady = () => Boolean(publicToken());
export const athRequires =
  "An ATH Business account's tokens in ATH_MOVIL_PUBLIC_TOKEN and ATH_MOVIL_PRIVATE_TOKEN (ATH Business app → Settings → Development).";

/** How long the customer has to approve it in the app. Evertec allows 120–600. */
export const ATH_TIMEOUT_SECONDS = 600;

export type AthStatus = "OPEN" | "CONFIRM" | "COMPLETED" | "CANCEL";

const PATH = "/api/business-transaction/ecommerce";

async function athPost<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  const res = await fetch(`${base()}${PATH}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json", "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { status?: string; data?: T; message?: string; errorcode?: string } | null;
  if (!res.ok || json?.status !== "success" || json.data === undefined) {
    throw new Error(json?.message ? `ATH Móvil: ${json.message}` : `ATH Móvil refused the request (${res.status}).`);
  }
  return json.data;
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Opens a payment for the customer to approve in their ATH Móvil app. */
export async function createAthPayment(input: { amountCents: number; phone: string; loadId: string }): Promise<{ ecommerceId: string; authToken: string }> {
  if (!athReady()) throw new Error(athRequires);
  const total = dollars(input.amountCents);
  const data = await athPost<{ ecommerceId?: string; auth_token?: string }>("/payment", {
    env: "production",
    publicToken: publicToken(),
    timeout: String(ATH_TIMEOUT_SECONDS),
    total, subtotal: total, tax: "0.00",
    metadata1: "Safehubby balance",
    // Read back on ATH's side to match a payment to its load.
    metadata2: input.loadId.slice(0, 40),
    items: [{ name: "Safehubby balance", description: "Prepaid balance", quantity: "1", price: total, tax: null, metadata: null }],
    phoneNumber: input.phone,
  });
  if (!data.ecommerceId || !data.auth_token) throw new Error("ATH Móvil did not return a payment to approve.");
  return { ecommerceId: data.ecommerceId, authToken: data.auth_token };
}

export async function findAthPayment(ecommerceId: string, authToken: string): Promise<{ status: AthStatus; referenceNumber?: string; totalCents?: number }> {
  const data = await athPost<{ ecommerceStatus?: string; referenceNumber?: string; total?: number | string }>(
    "/business/findPayment", { ecommerceId, publicToken: publicToken() }, authToken,
  );
  const status = String(data.ecommerceStatus ?? "").toUpperCase();
  // The docs say both CONFIRM and CONFIRMED; treat them as one.
  const normal: AthStatus = status.startsWith("CONFIRM") ? "CONFIRM"
    : status === "COMPLETED" ? "COMPLETED" : status === "CANCEL" || status === "CANCELLED" ? "CANCEL" : "OPEN";
  const total = Number(data.total);
  return {
    status: normal,
    ...(data.referenceNumber ? { referenceNumber: String(data.referenceNumber) } : {}),
    ...(Number.isFinite(total) ? { totalCents: Math.round(total * 100) } : {}),
  };
}

/** Takes the money once the customer has approved. Returns ATH's reference, which a refund is issued against. */
export async function authorizeAthPayment(authToken: string): Promise<{ referenceNumber: string; totalCents?: number }> {
  const data = await athPost<{ ecommerceStatus?: string; referenceNumber?: string; total?: number | string }>("/authorization", undefined, authToken);
  if (String(data.ecommerceStatus ?? "").toUpperCase() !== "COMPLETED" || !data.referenceNumber) {
    throw new Error("ATH Móvil did not complete the payment.");
  }
  const total = Number(data.total);
  return { referenceNumber: String(data.referenceNumber), ...(Number.isFinite(total) ? { totalCents: Math.round(total * 100) } : {}) };
}

export async function cancelAthPayment(ecommerceId: string): Promise<void> {
  await athPost("/business/cancel", { ecommerceId, publicToken: publicToken() });
}

/** Refunds all or part of a completed payment. Needs the private token. */
export async function refundAthPayment(referenceNumber: string, amountCents: number, message = "Safehubby refund"): Promise<void> {
  if (!privateToken()) throw new Error("ATH_MOVIL_PRIVATE_TOKEN is needed to refund.");
  await athPost("/refund", {
    publicToken: publicToken(), privateToken: privateToken(), referenceNumber,
    amount: dollars(amountCents), message: message.slice(0, 50),
  });
}

/**
 * An ATH Móvil phone number as the API wants it: ten digits. Accepts the
 * usual ways people type one — (787) 555-1234, 787-555-1234, +1 787…
 */
export function normalizeAthPhone(input: string): string {
  const digits = String(input ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!/^\d{10}$/.test(digits)) throw new Error("Enter the 10-digit phone number on your ATH Móvil account.");
  return digits;
}
