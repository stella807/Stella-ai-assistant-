import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, len: number) => Promise<Buffer>;

const KEY_LEN = 64;
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Sessions are opaque random strings; nothing is derived from the user id. */
const TOKEN_BYTES = 32;

/**
 * scrypt with a per-password salt. Node ships it, so there is no dependency to
 * keep patched, and it is memory-hard in a way a plain SHA is not.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  // Constant-time: a length mismatch must not short-circuit into a timing leak.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * A one-time, system-generated password for a freshly provisioned assistant
 * account — see `provisionAssistantCredentials` in routes.ts. Shorter than a
 * session token because a person has to type it once, on whatever device the
 * partner network relayed it to; the account is expected to change it
 * immediately after, so it does not need to be memorable or long-lived.
 */
export function newTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * Password rules kept deliberately minimal: length is what actually matters,
 * and composition rules push people toward predictable substitutions.
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export const SESSION_COOKIE = "sh_session";

/**
 * A second, distinct cookie for the employee/assistant portal — see
 * `ASSISTANT_SESSION_TTL_MS` and routes.ts's `assistant/auth/*` routes. Kept
 * entirely separate from `SESSION_COOKIE` so the two areas never share or
 * confuse identity: a browser can hold a traveler session and an assistant
 * session at once with no interaction between them, and signing out of one
 * never touches the other.
 */
export const ASSISTANT_SESSION_COOKIE = "sh_assistant_session";

/** Employee sessions are shorter-lived than a traveler's — a work portal
 *  logged into on a shared or borrowed device is a different risk profile
 *  than a personal safety app. */
export const ASSISTANT_SESSION_TTL_MS = 12 * 3_600_000;

export function sessionCookie(token: string, secure: boolean, name: string = SESSION_COOKIE, maxAgeMs: number = SESSION_TTL_MS): string {
  const parts = [
    `${name}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedCookie(secure: boolean, name: string = SESSION_COOKIE): string {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Fixed-window limiter, in memory. Enough to blunt credential stuffing on a
 * single instance; a multi-instance deployment needs a shared store, which is
 * noted in SECURITY.md rather than pretended away here.
 */
export class RateLimiter {
  #hits = new Map<string, { count: number; resetAt: number }>();
  #limit: number;
  #windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Returns true when the caller is over budget. */
  hit(key: string, now = Date.now()): boolean {
    const entry = this.#hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.#hits.set(key, { count: 1, resetAt: now + this.#windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > this.#limit;
  }

  reset(key: string): void {
    this.#hits.delete(key);
  }
}

/**
 * Drops sessions whose expiry has passed.
 *
 * `resolveActor` already treats an expired session as absent, so this is not
 * an authorization fix — it is a storage one. Nothing removed them, so every
 * login added a row that lived forever, in a store that rewrites the entire
 * document on every update. Left alone that is unbounded growth plus a pile of
 * stale credentials kept long after they stopped meaning anything, which is
 * precisely the sort of thing a retention policy exists to prevent.
 */
export function sweepExpiredSessions<T extends { expiresAt: string }>(sessions: T[], now: Date): T[] {
  const cutoff = now.getTime();
  return sessions.filter((s) => new Date(s.expiresAt).getTime() > cutoff);
}
