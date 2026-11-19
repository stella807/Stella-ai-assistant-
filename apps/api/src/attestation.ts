import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

/**
 * Proof that an answer came from Safehubby and when. Every answer from the agent store is signed with an Ed25519 key.
 * The public half is free at /api/agent/key, so an agent can check an answer offline and show its own human where a fact
 * came from. The private half is made on first use, kept in the database, and never sent anywhere.
 *
 * What is signed is the exact bytes of the response, the address that was asked (path and query) and the time it was
 * made, so changing one character, asking for a different thing, or replaying an old answer as new all fail the check.
 */
export interface SigningKeyRecord { keyId: string; privateKeyPem: string; publicKeyPem: string }

/** A short fingerprint of the public key, so a changed key is noticed. */
export const keyIdFor = (publicKeyPem: string): string => createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);

export function newSigningKey(): SigningKeyRecord {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { keyId: keyIdFor(publicKeyPem), privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem };
}

/**
 * A key made from a secret the owner keeps (in Railway's variables), so the same key comes back after the database is rebuilt
 * and answers signed years ago still verify. The secret is hashed to the 32 bytes an Ed25519 key is made from.
 */
export function keyFromSeed(seed: string): SigningKeyRecord {
  if (seed.length < 32) throw new Error("The signing secret must be at least 32 characters.");
  const raw = createHash("sha256").update(`safehubby-signing-key-v1\n${seed}`).digest();
  // PKCS#8 wrapper for a raw Ed25519 seed.
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), raw]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  return { keyId: keyIdFor(publicKeyPem), privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKeyPem };
}

const message = (body: string | Buffer, path: string, created: string) =>
  `safehubby-v1\n${path}\n${created}\n${createHash("sha256").update(body).digest("hex")}`;

/** The value of the X-Safehubby-Signature header. */
export function signResponse(key: SigningKeyRecord, body: string | Buffer, path: string, created: Date): string {
  const at = created.toISOString();
  const sig = sign(null, Buffer.from(message(body, path, at)), createPrivateKey(key.privateKeyPem)).toString("base64");
  return `keyId="${key.keyId}"; alg="ed25519"; created="${at}"; sig="${sig}"`;
}

/** What an agent does with the public key. Never throws: a bad header is simply not valid. */
export function verifyResponse(publicKeyPem: string, header: string, body: string | Buffer, path: string): boolean {
  try {
    const field = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(header)?.[1];
    const created = field("created"); const sig = field("sig");
    if (!created || !sig || !/^[A-Za-z0-9+/=]+$/.test(sig)) return false;
    return verify(null, Buffer.from(message(body, path, created)), createPublicKey(publicKeyPem), Buffer.from(sig, "base64"));
  } catch { return false; }
}
