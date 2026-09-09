import { describe, expect, it } from "vitest";
import { keyFrom, makeCipher, openLocations, sealLocations, isCiphertext } from "../src/crypto.ts";

const cipher = makeCipher(keyFrom("a".repeat(64))!);

const dbWith = (pings: unknown) => ({ nights: [{ pings }] }) as any;

describe("keys", () => {
  it("accepts a 64-char hex key", () => {
    expect(keyFrom("ab".repeat(32))!.length).toBe(32);
  });

  it("derives 32 bytes from a passphrase", () => {
    expect(keyFrom("a reasonably long passphrase")!.length).toBe(32);
  });

  it("refuses nothing, and refuses something too short to be a secret", () => {
    expect(keyFrom(undefined)).toBeNull();
    expect(keyFrom("short")).toBeNull();
  });
});

describe("round trip", () => {
  it("encrypts and decrypts", () => {
    const secret = JSON.stringify([{ lat: 40.7148, lng: -74.0018 }]);
    const sealed = cipher.encrypt(secret);
    expect(sealed).not.toContain("40.7148");
    expect(cipher.decrypt(sealed)).toBe(secret);
  });

  it("produces a different ciphertext each time, so repeats are not linkable", () => {
    expect(cipher.encrypt("same")).not.toBe(cipher.encrypt("same"));
  });

  it("rejects a tampered ciphertext rather than returning wrong coordinates", () => {
    const sealed = cipher.encrypt("40.7148,-74.0018");
    const parts = sealed.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("evil").toString("base64url")].join(".");
    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("rejects an unrecognised envelope", () => {
    expect(() => cipher.decrypt("not-a-ciphertext")).toThrow(/unrecognised/i);
  });

  it("will not decrypt with the wrong key", () => {
    const other = makeCipher(keyFrom("b".repeat(64))!);
    expect(() => other.decrypt(cipher.encrypt("secret"))).toThrow();
  });
});

describe("sealing a database", () => {
  it("replaces pings with ciphertext and leaves the original untouched", () => {
    const db = dbWith([{ lat: 40.7148, lng: -74.0018, at: "2026-01-01T20:00:00Z" }]);
    const sealed = sealLocations(db, cipher);
    expect(isCiphertext(sealed.nights[0].pings)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("40.7148");
    expect(Array.isArray(db.nights[0].pings)).toBe(true);
  });

  it("round trips through the store", () => {
    const pings = [{ lat: 40.7148, lng: -74.0018, accuracyMeters: 20, at: "2026-01-01T20:00:00Z" }];
    const opened = openLocations(sealLocations(dbWith(pings), cipher), cipher);
    expect(opened.nights[0].pings).toEqual(pings);
  });

  it("does not double-encrypt an already sealed document", () => {
    const once = sealLocations(dbWith([{ lat: 1, lng: 2 }]), cipher);
    const twice = sealLocations(once, cipher);
    expect(openLocations(twice, cipher).nights[0].pings).toEqual([{ lat: 1, lng: 2 }]);
  });

  it("drops traces rather than exposing them when the key is missing", () => {
    const sealed = sealLocations(dbWith([{ lat: 40.7, lng: -74 }]), cipher);
    expect(openLocations(sealed, null).nights[0].pings).toEqual([]);
  });

  it("survives a corrupt ciphertext without taking the server down", () => {
    const db = dbWith("v1.aaa.bbb.ccc");
    expect(openLocations(db, cipher).nights[0].pings).toEqual([]);
  });

  it("is a no-op without a cipher, so development still works", () => {
    const db = dbWith([{ lat: 1, lng: 2 }]);
    expect(sealLocations(db, null)).toBe(db);
  });
});
