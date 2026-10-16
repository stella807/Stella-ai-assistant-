import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRevolutAuth } from "../src/adapters/revolut-auth.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const NOW = new Date("2026-12-05T12:00:00Z");

const b64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");

function fakeFetch(responses: Record<string, unknown>[]) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
    return Response.json(responses.shift() ?? {}, { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const base = { clientId: "cid", privateKeyPem: pem, issuer: "safehubby.com", environment: "sandbox" as const };

describe("Revolut Business sign-in (OAuth2 with a signed JWT)", () => {
  it("signs a client assertion Revolut can check with the uploaded public key", () => {
    const auth = createRevolutAuth({ ...base, now: () => NOW });
    const jwt = auth.clientAssertion();
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(b64url(h!))).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = JSON.parse(b64url(p!));
    expect(payload).toMatchObject({ iss: "safehubby.com", sub: "cid", aud: "https://revolut.com" });
    expect(payload.exp).toBeGreaterThan(NOW.getTime() / 1000);
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
  });

  it("sends the owner to Revolut's consent page and back to our callback", () => {
    const url = new URL(createRevolutAuth({ ...base, now: () => NOW }).consentUrl());
    expect(url.origin).toBe("https://sandbox-business.revolut.com");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://safehubby.com/master");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("trades the one-time code for tokens and keeps the refresh token", async () => {
    const { fn, calls } = fakeFetch([{ access_token: "AT1", refresh_token: "RT1", expires_in: 2399 }]);
    const saved: string[] = [];
    const auth = createRevolutAuth({ ...base, now: () => NOW, fetch: fn, onRefreshToken: (t) => saved.push(t) });
    await auth.exchangeCode("CODE");
    expect(calls[0]!.url).toBe("https://sandbox-b2b.revolut.com/api/1.0/auth/token");
    expect(calls[0]!.body.get("grant_type")).toBe("authorization_code");
    expect(calls[0]!.body.get("code")).toBe("CODE");
    expect(calls[0]!.body.get("client_assertion_type")).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    expect(saved).toEqual(["RT1"]);
    expect(await auth.accessToken()).toBe("AT1");
    expect(calls).toHaveLength(1);
  });

  it("refreshes the access token before it runs out, and only then", async () => {
    let now = NOW;
    const { fn, calls } = fakeFetch([{ access_token: "AT1", expires_in: 2399 }, { access_token: "AT2", expires_in: 2399 }]);
    const auth = createRevolutAuth({ ...base, refreshToken: "RT", now: () => now, fetch: fn });
    expect(await auth.accessToken()).toBe("AT1");
    now = new Date(NOW.getTime() + 20 * 60_000);
    expect(await auth.accessToken()).toBe("AT1");
    now = new Date(NOW.getTime() + 39 * 60_000);
    expect(await auth.accessToken()).toBe("AT2");
    expect(calls.map((c) => c.body.get("grant_type"))).toEqual(["refresh_token", "refresh_token"]);
    expect(calls[0]!.body.get("refresh_token")).toBe("RT");
  });

  it("says plainly it is not connected until the owner has approved it", async () => {
    const auth = createRevolutAuth({ ...base, now: () => NOW });
    expect(auth.connected()).toBe(false);
    await expect(auth.accessToken()).rejects.toThrow(/not connected/i);
    expect(createRevolutAuth({ ...base, refreshToken: "RT", now: () => NOW }).connected()).toBe(true);
  });

  it("uses Revolut's production hosts in production", () => {
    const auth = createRevolutAuth({ ...base, environment: "production", now: () => NOW });
    expect(auth.apiBase()).toBe("https://b2b.revolut.com/api");
    expect(new URL(auth.consentUrl()).origin).toBe("https://business.revolut.com");
  });
});
