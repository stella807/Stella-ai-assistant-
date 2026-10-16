/**
 * What Evertec's own payment button needs, and what it hands back.
 *
 * The button is theirs, not ours: it renders inside the container below,
 * the customer confirms in the ATH Móvil app, and the script then calls the
 * page's `authorizationATHM`. Everything here is the pure half — building
 * the config and reading the result — so it can be tested without loading
 * a third-party script. See apps/api/src/adapters/ath-movil.ts for the half
 * that does not trust this one.
 */

export const ATH_CONTAINER_ID = "ATHMovil_Checkout_Button_payment";
export const ATH_SCRIPT_URL = "https://payments.athmovil.com/api/modal/js/athmovil_base.js";

/** Evertec's accepted range for one payment. */
const MIN_TOTAL = 1;
const MAX_TOTAL = 1500;
const METADATA_MAX = 40;

export interface AthCheckoutInput {
  publicToken: string;
  /** Dollars as a string with two decimals, exactly as the server issued it. */
  total: string;
  metadata1: string;
  metadata2: string;
  lang: "en" | "es";
}

export interface AthCheckoutConfig {
  env: "production";
  publicToken: string;
  timeout: number;
  theme: "btn";
  lang: "en" | "es";
  total: number;
  subtotal: number;
  tax: number;
  metadata1: string;
  metadata2: string;
  items: { name: string; description: string; quantity: string; price: string; tax: string; metadata: string }[];
  phoneNumber: string;
}

export function athCheckoutConfig(input: AthCheckoutInput): AthCheckoutConfig {
  const total = Number(input.total);
  if (!Number.isFinite(total) || total < MIN_TOTAL || total > MAX_TOTAL) {
    throw new Error("That amount cannot be paid with ATH Móvil.");
  }
  const cut = (text: string) => text.slice(0, METADATA_MAX);
  return {
    env: "production",
    publicToken: input.publicToken,
    timeout: 600,
    theme: "btn",
    lang: input.lang,
    total,
    subtotal: total,
    tax: 0,
    metadata1: cut(input.metadata1),
    metadata2: cut(input.metadata2),
    items: [{
      name: "Safehubby balance", description: "Prepaid balance for errands and assistants",
      quantity: "1", price: total.toFixed(2), tax: "0", metadata: cut(input.metadata2),
    }],
    // Left blank so the customer types their own number inside ATH Móvil.
    phoneNumber: "",
  };
}

/** `authorization()` resolves to `{ status, data: { ecommerceId, ... } }`. */
export function ecommerceIdFrom(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as { status?: unknown; data?: { ecommerceId?: unknown } };
  if (r.status !== "success") return null;
  const id = r.data?.ecommerceId;
  return typeof id === "string" && id ? id : null;
}
