import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { payaiAuthHeaders, payaiToken } from "../src/payai-auth.ts";

const keys = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const secret = "payai_sk_" + privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  return { publicKey, secret };
};
const b64 = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString());

describe("signing in to PayAI's facilitator", () => {
  it("makes a short-lived EdDSA token that its public key verifies, with the fields PayAI documents", () => {
    const { publicKey, secret } = keys();
    const now = new Date("2026-11-18T12:00:00Z");
    const [h, p, sig] = payaiToken("key_123", secret, now).split(".") as [string, string, string];
    expect(b64(h)).toEqual({ alg: "EdDSA", typ: "JWT", kid: "key_123" });
    const body = b64(p);
    expect(body).toMatchObject({ sub: "key_123", iss: "payai-merchant", iat: 1795003200, exp: 1795003320 });
    expect(body.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(verify(null, Buffer.from(`${h}.${p}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("accepts the secret with or without its prefix", () => {
    const { secret } = keys();
    expect(() => payaiToken("k", secret.replace("payai_sk_", ""), new Date())).not.toThrow();
  });

  it("asks only verify and settle to carry the token, and reuses it until just before it expires", () => {
    const { secret } = keys();
    const make = payaiAuthHeaders("k", secret);
    const a = make(new Date("2026-11-18T12:00:00Z"));
    expect(Object.keys(a).sort()).toEqual(["settle", "verify"]);
    expect(a.verify.Authorization).toMatch(/^Bearer ey/);
    expect(make(new Date("2026-11-18T12:01:00Z")).verify.Authorization).toBe(a.verify.Authorization);
    expect(make(new Date("2026-11-18T12:01:45Z")).verify.Authorization).not.toBe(a.verify.Authorization);
  });

  it("never puts the secret in what it returns or in an error", () => {
    const { secret } = keys();
    expect(JSON.stringify(payaiAuthHeaders("k", secret)(new Date()))).not.toContain(secret.replace("payai_sk_", "").slice(0, 20));
    expect(() => payaiToken("k", "payai_sk_not-a-key", new Date())).toThrow(/could not be read/i);
    try { payaiToken("k", "payai_sk_not-a-key", new Date()); } catch (e) { expect(String((e as Error).message)).not.toContain("not-a-key"); }
  });
});
