import { createPrivateKey, randomUUID, sign } from "node:crypto";

/**
 * Signing in to PayAI's payment facilitator. PayAI's docs (docs.payai.network/x402/facilitators/authentication)
 * ask for an EdDSA-signed token, sent as a Bearer header on verify and settle only. The key ID and secret stay on
 * this server and are used only to sign: neither is ever sent. Written with Node's own crypto, so no package is
 * trusted with the secret.
 *
 * Not needed to start: PayAI settles the first 1,000 payments per receiving wallet with no key.
 */

const b64 = (data: string | Buffer) => Buffer.from(data).toString("base64url");
const LIFETIME_S = 120;
const REFRESH_BEFORE_S = 30;

export function payaiToken(keyId: string, secret: string, now: Date): string {
  let key;
  try {
    key = createPrivateKey({ key: Buffer.from(secret.replace(/^payai_sk_/, ""), "base64"), format: "der", type: "pkcs8" });
  } catch {
    // The message never includes the secret.
    throw new Error("The PayAI secret could not be read: expected the base64 key PayAI issued.");
  }
  const iat = Math.floor(now.getTime() / 1000);
  const head = b64(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: keyId }));
  const body = b64(JSON.stringify({ sub: keyId, iss: "payai-merchant", iat, exp: iat + LIFETIME_S, jti: randomUUID() }));
  return `${head}.${body}.${b64(sign(null, Buffer.from(`${head}.${body}`), key))}`;
}

/** Headers for the facilitator client: one token, kept until 30 seconds before it expires. */
export function payaiAuthHeaders(keyId: string, secret: string) {
  let cached: { token: string; exp: number } | null = null;
  return (now: Date = new Date()): { verify: Record<string, string>; settle: Record<string, string> } => {
    const t = now.getTime() / 1000;
    if (!cached || t >= cached.exp - REFRESH_BEFORE_S) cached = { token: payaiToken(keyId, secret, now), exp: Math.floor(t) + LIFETIME_S };
    const headers = { Authorization: `Bearer ${cached.token}` };
    return { verify: headers, settle: headers };
  };
}
