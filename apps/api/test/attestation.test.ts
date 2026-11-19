import { describe, expect, it } from "vitest";
import { keyFromSeed, newSigningKey, signResponse, verifyResponse } from "../src/attestation.ts";

describe("proving an answer came from Safehubby, and when", () => {
  const key = newSigningKey();
  const at = new Date("2026-11-18T12:00:00Z");
  const body = JSON.stringify({ facts: [{ title: "Premium plan", text: "Premium costs $93.99 a month." }] });
  const path = "/api/agent/facts?q=premium";

  it("signs the exact bytes sent, and a reader with only the public key can check them", () => {
    const header = signResponse(key, body, path, at);
    expect(header).toContain(`keyId="${key.keyId}"`);
    expect(header).toContain('created="2026-11-18T12:00:00.000Z"');
    expect(verifyResponse(key.publicKeyPem, header, body, path)).toBe(true);
  });

  it("signs a file as exactly as it signs text, byte for byte", () => {
    const file = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00, 0x80]);
    const header = signResponse(key, file, "/api/agent/books/x", at);
    expect(verifyResponse(key.publicKeyPem, header, file, "/api/agent/books/x")).toBe(true);
    expect(verifyResponse(key.publicKeyPem, header, Buffer.from([...file, 0]), "/api/agent/books/x")).toBe(false);
  });

  it("fails if a single character of the answer, the address asked, or the date changes", () => {
    const header = signResponse(key, body, path, at);
    expect(verifyResponse(key.publicKeyPem, header, body.replace("93.99", "9.99"), path)).toBe(false);
    expect(verifyResponse(key.publicKeyPem, header, body, "/api/agent/facts?q=basic")).toBe(false);
    expect(verifyResponse(key.publicKeyPem, header.replace("2026-11-18", "2026-11-19"), body, path)).toBe(false);
  });

  it("fails for another key, and for a header that is junk, without throwing", () => {
    const header = signResponse(key, body, path, at);
    expect(verifyResponse(newSigningKey().publicKeyPem, header, body, path)).toBe(false);
    for (const junk of ["", "sig=abc", 'keyId="x"; sig="!!!"', "a; b; c"]) expect(verifyResponse(key.publicKeyPem, junk, body, path)).toBe(false);
  });

  it("names a key by a short fingerprint of its public half, so a changed key is noticed", () => {
    expect(key.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(newSigningKey().keyId).not.toBe(key.keyId);
  });
});

describe("a signing key that survives losing the database", () => {
  const seed = "a-long-random-secret-the-owner-keeps-in-railway-0123456789";
  it("is the same key every time from the same secret, and a different one from another", () => {
    const a = keyFromSeed(seed), b = keyFromSeed(seed), c = keyFromSeed(seed + "x");
    expect(a.keyId).toBe(b.keyId);
    expect(a.publicKeyPem).toBe(b.publicKeyPem);
    expect(c.keyId).not.toBe(a.keyId);
  });
  it("signs and checks like any other key, so an old answer still verifies after the database is rebuilt", () => {
    const body = JSON.stringify({ facts: ["Premium costs a month."] });
    const header = signResponse(keyFromSeed(seed), body, "/api/agent/facts?q=premium", new Date("2026-11-19T12:00:00Z"));
    expect(verifyResponse(keyFromSeed(seed).publicKeyPem, header, body, "/api/agent/facts?q=premium")).toBe(true);
  });
  it("never accepts a secret too short to be one", () => {
    expect(() => keyFromSeed("short")).toThrow(/at least 32/);
  });
});
