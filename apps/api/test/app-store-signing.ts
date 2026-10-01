import { readFileSync } from "node:fs";
import { sign } from "node:crypto";
import { join } from "node:path";

/**
 * Builds StoreKit-style signed payloads for tests.
 *
 * A genuine one needs Apple's private key, so these are signed by a stand-in
 * chain shaped like Apple's (root → intermediate → leaf, with Apple's marker
 * extensions on the last two). Production trusts only Apple Root CA - G3; tests
 * hand the verifier this chain's root instead. See fixtures/app-store/README.md.
 */
const dir = join(import.meta.dirname, "fixtures", "app-store");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const der = (pem: string) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");

export const TEST_ROOT_PEM = read("trusted-root.pem");

type ChainName = "trusted" | "rogue" | "unmarked";

const CHAINS: Record<ChainName, { key: string; certs: string[] }> = {
  trusted: {
    key: read("trusted-leaf.key"),
    certs: [read("trusted-leaf.pem"), read("trusted-intermediate.pem"), read("trusted-root.pem")],
  },
  // A complete, internally valid chain whose root nobody trusts.
  rogue: {
    key: read("rogue-leaf.key"),
    certs: [read("rogue-leaf.pem"), read("rogue-intermediate.pem"), read("rogue-root.pem")],
  },
  // Signed by the trusted intermediate, but missing the StoreKit leaf marker.
  unmarked: {
    key: read("unmarked-leaf.key"),
    certs: [read("unmarked-leaf.pem"), read("trusted-intermediate.pem"), read("trusted-root.pem")],
  },
};

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export function signAppleJws(payload: unknown, chain: ChainName = "trusted", header: Record<string, unknown> = {}): string {
  const { key, certs } = CHAINS[chain];
  const head = b64url(JSON.stringify({ alg: "ES256", x5c: certs.map(der), ...header }));
  const body = b64url(JSON.stringify(payload));
  const signature = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(signature)}`;
}

export const NOW = new Date("2027-03-01T12:00:00Z");

/** A StoreKit 2 transaction for a subscription, as Apple's JWSTransaction decodes. */
export function transaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: "2000000100",
    originalTransactionId: "2000000001",
    bundleId: "app.safehubby",
    productId: "app.safehubby.premium-plus.monthly",
    purchaseDate: NOW.getTime() - 60_000,
    originalPurchaseDate: NOW.getTime() - 60_000,
    expiresDate: NOW.getTime() + 30 * 86_400_000,
    type: "Auto-Renewable Subscription",
    environment: "Production",
    signedDate: NOW.getTime(),
    ...overrides,
  };
}
