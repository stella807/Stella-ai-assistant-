import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Field-level encryption for location history.
 *
 * Location traces are the most sensitive thing this product touches: a night of
 * pings identifies a person, their local, and who they were with, and they are
 * notoriously re-identifiable even stripped of names. So they are encrypted
 * before they reach the database rather than relying on the platform's
 * disk-level encryption, which protects against a stolen drive and nothing else
 * — not a leaked backup, not a misconfigured read replica, not an operator with
 * a psql prompt.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than silently yielding wrong coordinates.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_ENV = "SAFEHUBBY_ENCRYPTION_KEY";

export class MissingKeyError extends Error {}

/**
 * Accepts a 64-char hex key or any passphrase, which is hashed to 32 bytes.
 * Hashing a passphrase is weaker than a generated key and the deploy docs say
 * so; it exists because a deploy that falls back to *no* encryption because
 * someone pasted the wrong format is the worse failure.
 */
export function keyFrom(secret: string | undefined): Buffer | null {
  if (!secret) return null;
  const trimmed = secret.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  if (trimmed.length < 16) return null;
  return createHash("sha256").update(trimmed).digest();
}

export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
  readonly enabled: true;
}

/** Envelope: v1.<iv>.<authTag>.<ciphertext>, all base64url. */
export function makeCipher(key: Buffer): Cipher {
  return {
    enabled: true,
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGO, key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
    },
    decrypt(payload: string): string {
      const [version, ivB64, tagB64, dataB64] = payload.split(".");
      if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Unrecognised ciphertext");
      const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}

export function cipherFromEnv(): Cipher | null {
  const key = keyFrom(process.env[KEY_ENV]);
  return key ? makeCipher(key) : null;
}

export const isCiphertext = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("v1.");

/**
 * Encrypts the location pings on every night in a database document, in place
 * on a copy. Everything else stays readable, so the store remains inspectable
 * for support without exposing where anyone was.
 */
export function sealLocations<T extends { nights: { pings: unknown }[] }>(db: T, cipher: Cipher | null): T {
  if (!cipher) return db;
  const copy = structuredClone(db);
  for (const night of copy.nights) {
    if (!isCiphertext(night.pings)) night.pings = cipher.encrypt(JSON.stringify(night.pings ?? []));
  }
  return copy;
}

export function openLocations<T extends { nights: { pings: unknown }[] }>(db: T, cipher: Cipher | null): T {
  for (const night of db.nights) {
    if (!isCiphertext(night.pings)) continue;
    if (!cipher) {
      // Without the key the traces stay sealed. Losing location history is the
      // correct failure here; handing it back in the clear is not.
      night.pings = [];
      continue;
    }
    try {
      night.pings = JSON.parse(cipher.decrypt(night.pings));
    } catch {
      night.pings = [];
    }
  }
  return db;
}
