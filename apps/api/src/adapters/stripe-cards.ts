import type { CardIssuingPort, IssuedCard, ProviderStatus } from "@safehubby/core";
import { statusFor } from "@safehubby/core";

/**
 * Single-use, spend-capped virtual cards issued with Stripe Issuing — the same
 * Stripe account that charges customers.
 *
 * Each task gets its own virtual card, limited to exactly the task's spend
 * limit and cancelled the moment the task ends. Cards hang off one company
 * cardholder, which the server finds or creates itself (`ensureStripeCardholder`)
 * from the business details already on the Stripe account — or the one named
 * by STRIPE_ISSUING_CARDHOLDER, if set. Issuing has to be approved first.
 *
 * The full number is never fetched here: Stripe shows it to the assistant
 * through its own Issuing Elements (see `cardViewKey`), which keeps Safehubby
 * out of PCI scope.
 */
const api = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");
const secret = () => (process.env.STRIPE_SECRET_KEY ?? "").trim();
/** Found or created at boot by `ensureStripeCardholder`, when not set by hand. */
let autoCardholder: string | null = null;
const cardholder = () => (process.env.STRIPE_ISSUING_CARDHOLDER ?? "").trim() || autoCardholder || "";
export const stripeIssuingReady = () => Boolean(secret() && cardholder());

/** Stripe's own card ids, so a cancel always goes to the issuer that made the card. */
export const isStripeCardId = (id: string) => id.startsWith("ic_");

async function stripeForm(path: string, fields: Record<string, string | number>): Promise<any> {
  const res = await fetch(`${api()}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret()}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.entries(fields).map(([k, v]): [string, string] => [k, String(v)])).toString(),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(detail?.error?.message ?? `Stripe Issuing rejected ${path}: ${res.status}`);
  }
  return res.json();
}

let statusOverride: ProviderStatus | undefined;

export const stripeTaskCards: CardIssuingPort = {
  // A getter so the keys can be set without a restart; the setter lets tests stand a status in.
  get status() {
    return statusOverride ?? statusFor(
      "stripe-issuing", "Stripe Issuing", stripeIssuingReady(),
      "Stripe Issuing approved on your Stripe account, a company cardholder created once in the Dashboard, then STRIPE_SECRET_KEY and STRIPE_ISSUING_CARDHOLDER.",
    );
  },
  set status(value) { statusOverride = value; },

  async issueCard(input): Promise<IssuedCard> {
    if (!stripeIssuingReady()) throw new Error("Stripe Issuing is not configured.");
    const card = await stripeForm("/v1/issuing/cards", {
      cardholder: cardholder(),
      currency: input.currency.toLowerCase(),
      type: "virtual",
      status: "active",
      // The whole limit, once — the cap is exact, not something to swipe twice.
      "spending_controls[spending_limits][0][amount]": input.capCents,
      "spending_controls[spending_limits][0][interval]": "all_time",
      "metadata[label]": input.label.slice(0, 200),
      "metadata[expires_at]": input.expiresAt,
    });
    return {
      id: String(card.id ?? ""),
      last4: String(card.last4 ?? "").slice(-4),
      network: card.brand ?? "Visa",
      expMonth: Number(card.exp_month ?? 0),
      expYear: Number(card.exp_year ?? 0),
      revealUrl: null,
    };
  },

  async revealCard(): Promise<string | null> {
    return null;
  },

  async cancelCard(cardId: string): Promise<void> {
    if (!secret()) return;
    await stripeForm(`/v1/issuing/cards/${encodeURIComponent(cardId)}`, { status: "canceled" });
  },
};

/** The API version the ephemeral key is made for; Stripe.js's Issuing
 *  Elements need the key and the call to agree on one. */
export const ISSUING_ELEMENTS_API_VERSION = "2024-06-20";

/**
 * A short-lived key that lets Stripe's Issuing Elements, in the assistant's
 * browser, show this one card's number, expiry and CVC. The number goes from
 * Stripe straight to that browser — never through this server. The nonce
 * comes from Stripe.js (`createEphemeralKeyNonce`), tying the key to the page
 * that asked for it.
 */
export async function cardViewKey(cardId: string, nonce: string): Promise<string> {
  if (!secret()) throw new Error("Stripe is not configured.");
  const res = await fetch(`${api()}/v1/ephemeral_keys`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret()}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": ISSUING_ELEMENTS_API_VERSION,
    },
    body: new URLSearchParams({ issuing_card: cardId, nonce }).toString(),
  });
  if (!res.ok) throw new Error(`Stripe would not open this card: ${res.status}`);
  const key = (await res.json()) as { secret?: string };
  if (!key.secret) throw new Error("Stripe returned no key for this card.");
  return key.secret;
}

/**
 * Finds the Safehubby company cardholder, or creates it from the account's own
 * business name and address, so nobody has to make one in the Dashboard and
 * copy its id into Railway. Tagged `metadata.safehubby = company`, so it is
 * found again on every restart rather than duplicated. Returns why it could
 * not, for the boot log; a missing Issuing approval is the usual reason.
 */
export async function ensureStripeCardholder(): Promise<{ id: string; created: boolean } | { error: string }> {
  if ((process.env.STRIPE_ISSUING_CARDHOLDER ?? "").trim()) return { id: cardholder(), created: false };
  if (!secret()) return { error: "STRIPE_SECRET_KEY is not set" };
  const get = async (path: string) => {
    const res = await fetch(`${api()}${path}`, { headers: { authorization: `Bearer ${secret()}` } });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(data?.error?.message ?? `Stripe refused ${path}: ${res.status}`);
    return data;
  };
  try {
    const list = await get("/v1/issuing/cardholders?limit=100&type=company&status=active");
    const found = (list.data ?? []).find((c: any) => c.metadata?.safehubby === "company");
    if (found) { autoCardholder = found.id; return { id: found.id, created: false }; }

    const account = await get("/v1/account");
    const address = account.company?.address ?? account.business_profile?.support_address ?? account.individual?.address;
    if (!address?.line1 || !address?.city || !address?.postal_code) {
      return { error: "the Stripe account has no business address to put on the cardholder — add one under Settings → Business" };
    }
    const fields: Record<string, string> = {
      type: "company",
      name: String(account.business_profile?.name || account.settings?.dashboard?.display_name || "Safehubby").slice(0, 24),
      "billing[address][line1]": address.line1,
      "billing[address][city]": address.city,
      "billing[address][postal_code]": address.postal_code,
      "billing[address][country]": address.country || "US",
      "metadata[safehubby]": "company",
    };
    if (address.line2) fields["billing[address][line2]"] = address.line2;
    if (address.state) fields["billing[address][state]"] = address.state;
    const email = account.business_profile?.support_email || account.email;
    if (email) fields.email = email;
    const created = await stripeForm("/v1/issuing/cardholders", fields);
    autoCardholder = String(created.id);
    return { id: autoCardholder, created: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
