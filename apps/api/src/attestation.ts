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

const hashOf = (body: string | Buffer) => createHash("sha256").update(body).digest("hex");

// Version 1 is every answer that was not paid for, and every answer signed before payments were: it must never change.
const messageV1 = (body: string | Buffer, path: string, created: string) => `safehubby-v1\n${path}\n${created}\n${hashOf(body)}`;

// Version 2 adds the payment the answer was given for, so the buyer's payment and the seller's record of what it bought
// join on one id. The payment lives in the signature, never in the body: the body's hash is what the currency check compares.
const messageV2 = (body: string | Buffer, path: string, created: string, payment: string) =>
  `safehubby-v2\n${path}\n${created}\n${hashOf(body)}\n${payment}`;

/** A network and a transaction id, for example "eip155:8453:0xabc": nothing that could close the quoted field or add another. */
export const isPaymentRef = (value: string): boolean => /^[A-Za-z0-9:._-]{1,200}$/.test(value);

/** The value of the X-Safehubby-Signature header. Give `payment` only for an answer that was paid for. */
export function signResponse(key: SigningKeyRecord, body: string | Buffer, path: string, created: Date, payment?: string): string {
  const at = created.toISOString();
  if (payment !== undefined && !isPaymentRef(payment)) throw new Error("The payment reference must be a network and a transaction id.");
  const msg = payment === undefined ? messageV1(body, path, at) : messageV2(body, path, at, payment);
  const sig = sign(null, Buffer.from(msg), createPrivateKey(key.privateKeyPem)).toString("base64");
  return payment === undefined
    ? `keyId="${key.keyId}"; alg="ed25519"; created="${at}"; sig="${sig}"`
    : `keyId="${key.keyId}"; alg="ed25519"; v="2"; created="${at}"; payment="${payment}"; sig="${sig}"`;
}

/** One field of the header, read by its exact name: a field called "xsig" is never taken for "sig". */
export const headerField = (header: string, name: string): string | undefined =>
  new RegExp(`(?:^|;)\\s*${name}="([^"]*)"`).exec(header)?.[1];

/** What an agent does with the public key. Never throws: a bad header is simply not valid. */
export function verifyResponse(publicKeyPem: string, header: string, body: string | Buffer, path: string): boolean {
  try {
    const created = headerField(header, "created"); const sig = headerField(header, "sig");
    if (!created || !sig || !/^[A-Za-z0-9+/=]+$/.test(sig)) return false;
    const version = headerField(header, "v") ?? "1";
    const payment = headerField(header, "payment");
    let msg: string;
    if (version === "1") msg = messageV1(body, path, created);
    else if (version === "2" && payment && isPaymentRef(payment)) msg = messageV2(body, path, created, payment);
    else return false;
    return verify(null, Buffer.from(msg), createPublicKey(publicKeyPem), Buffer.from(sig, "base64"));
  } catch { return false; }
}
