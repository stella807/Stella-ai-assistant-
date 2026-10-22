/**
 * The pure half of PayPal's button: where its script comes from and how to
 * read what it hands back. The button itself is PayPal's — it draws inside
 * the page, the customer approves in PayPal's own window, and this app never
 * sees a PayPal password. Whatever the browser reports is only a claim; the
 * server asks PayPal what was actually saved before storing anything.
 */

/** PayPal's button and its card fields, and nothing else from PayPal. */
export function paypalSdkUrl(clientId: string): string {
  const url = new URL("https://www.paypal.com/sdk/js");
  url.searchParams.set("client-id", clientId);
  url.searchParams.set("components", "buttons");
  return url.toString();
}

/** PayPal's `onApprove` receives `{ vaultSetupToken }`. */
export function setupTokenFromApproval(approval: unknown): string | null {
  if (typeof approval !== "object" || approval === null) return null;
  const token = (approval as { vaultSetupToken?: unknown }).vaultSetupToken;
  return typeof token === "string" && token ? token : null;
}
