import { describe, expect, it } from "vitest";
import {
  cipherFromEnv, isCiphertext, keyFrom, makeCipher, openLocations, openPayoutDestination, openTaskMessages,
  countUnreadable, resealPayoutDestinations, sealLocations, sealPayoutDestination, sealTaskMessages,
} from "../src/crypto.ts";

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

describe("sealing a task's thread", () => {
  const cipher = makeCipher(keyFrom("a-long-enough-local-test-passphrase")!);

  /** A document with content in every place a message can hide. */
  const dbWith = () => ({
    nights: [],
    voiceMessages: [
      { id: "v1", audioBase64: "AAAAvoiceclip", mimeType: "audio/webm", durationSeconds: 4 },
    ],
    textMessages: [
      { id: "m1", body: "The 8ft ones, not the 10ft", sender: "traveler" },
    ],
    conciergeTasks: [{
      id: "t1",
      identityPhotos: {
        assistant: { base64: "AAAAselfie", mimeType: "image/jpeg", capturedAt: "x" },
        traveler: { base64: "AAAAtraveler", mimeType: "image/jpeg", capturedAt: "x" },
      },
      spendRequests: [{ id: "s1", photo: { base64: "AAAAreceipt", mimeType: "image/jpeg", capturedAt: "x" } }],
    }],
  });

  const contents = (db: ReturnType<typeof dbWith>) => [
    db.voiceMessages[0]!.audioBase64,
    db.textMessages[0]!.body,
    db.conciergeTasks[0]!.identityPhotos.assistant.base64,
    db.conciergeTasks[0]!.identityPhotos.traveler.base64,
    db.conciergeTasks[0]!.spendRequests[0]!.photo.base64,
  ];

  it("encrypts every one of them — voice, text and both kinds of photo", () => {
    // The bug this exists for is a field that is added later and quietly
    // written in the clear, so it asserts on all of them rather than a sample.
    const sealed = sealTaskMessages(dbWith(), cipher);
    for (const value of contents(sealed)) {
      expect(value.startsWith("v1.")).toBe(true);
      expect(value).not.toMatch(/voiceclip|8ft|selfie|traveler|receipt/);
    }
  });

  it("gives them all back unchanged with the key", () => {
    const opened = openTaskMessages(sealTaskMessages(dbWith(), cipher), cipher);
    expect(contents(opened)).toEqual(contents(dbWith()));
  });

  it("leaves the metadata readable, so support can see a thread exists", () => {
    const sealed = sealTaskMessages(dbWith(), cipher);
    expect(sealed.voiceMessages[0]!.durationSeconds).toBe(4);
    expect(sealed.voiceMessages[0]!.mimeType).toBe("audio/webm");
    expect(sealed.textMessages[0]!.sender).toBe("traveler");
    expect(sealed.conciergeTasks[0]!.id).toBe("t1");
  });

  it("does not double-seal on a second save", () => {
    const once = sealTaskMessages(dbWith(), cipher);
    const twice = sealTaskMessages(once, cipher);
    expect(contents(twice)).toEqual(contents(once));
  });

  it("returns nothing rather than ciphertext when the key is gone", () => {
    // Losing a message is the correct failure. Handing back the envelope
    // would put base64 gibberish on somebody's screen and call it a message.
    const opened = openTaskMessages(sealTaskMessages(dbWith(), cipher), null);
    for (const value of contents(opened)) expect(value).toBe("");
  });

  it("returns nothing rather than throwing on a tampered envelope", () => {
    const sealed = sealTaskMessages(dbWith(), cipher);
    sealed.textMessages[0]!.body = `${sealed.textMessages[0]!.body}tampered`;
    expect(() => openTaskMessages(sealed, cipher)).not.toThrow();
    expect(sealed.textMessages[0]!.body).toBe("");
  });

  it("is a no-op without a cipher, so local development still runs", () => {
    const plain = sealTaskMessages(dbWith(), null);
    expect(contents(plain)).toEqual(contents(dbWith()));
  });
});

/**
 * A key that may have leaked has to be replaceable without losing what it
 * sealed. The old key stays readable for one deploy, everything is written
 * back under the new one, and then the old key can be deleted.
 */
describe("rotating the key", () => {
  const oldKey = keyFrom("a".repeat(64))!;
  const newKey = keyFrom("b".repeat(64))!;
  const before = makeCipher(oldKey);
  const rotating = makeCipher(newKey, [oldKey]);
  const after = makeCipher(newKey);
  const bank = { accountHolderName: "Mark Rivera", routingNumber: "021000021", accountNumber: "000123456789" };

  it("reads what the previous key sealed, and seals only with the new one", () => {
    expect(rotating.decrypt(before.encrypt("old secret"))).toBe("old secret");
    const fresh = rotating.encrypt("new secret");
    expect(after.decrypt(fresh)).toBe("new secret");
    expect(() => before.decrypt(fresh)).toThrow();
  });

  it("still refuses a key that is neither the current one nor the previous one", () => {
    const stranger = makeCipher(keyFrom("c".repeat(64))!);
    expect(() => rotating.decrypt(stranger.encrypt("secret"))).toThrow();
  });

  it("says when it is rotating, so the server can log it", () => {
    expect(rotating.rotating).toBe(true);
    expect(after.rotating).toBe(false);
  });

  it("moves location history to the new key on the next save", () => {
    const stored = sealLocations(dbWith([{ lat: 18.4, lng: -66.1 }]), before);
    const resaved = sealLocations(openLocations(stored, rotating), rotating);
    expect(openLocations(resaved, after).nights[0].pings).toEqual([{ lat: 18.4, lng: -66.1 }]);
  });

  it("moves a payout destination to the new key", () => {
    const db = { assistantPayoutDestinations: { asst_mark: { ...sealPayoutDestination(bank, before), updatedAt: "2026-10-01T00:00:00Z" } } };
    resealPayoutDestinations(db, rotating);
    expect(openPayoutDestination(db.assistantPayoutDestinations.asst_mark, after)).toEqual(bank);
    expect(db.assistantPayoutDestinations.asst_mark.accountNumberLast4).toBe("6789");
  });

  it("leaves a payout destination already under the new key exactly as it is", () => {
    const sealed = sealPayoutDestination(bank, after);
    const db = { assistantPayoutDestinations: { asst_mark: { ...sealed, updatedAt: "2026-10-01T00:00:00Z" } } };
    resealPayoutDestinations(db, rotating);
    expect(db.assistantPayoutDestinations.asst_mark.accountNumberEnc).toBe(sealed.accountNumberEnc);
  });

  it("leaves a payout destination it cannot read untouched rather than destroying it", () => {
    const stranger = makeCipher(keyFrom("c".repeat(64))!);
    const sealed = sealPayoutDestination(bank, stranger);
    const db = { assistantPayoutDestinations: { asst_mark: { ...sealed, updatedAt: "2026-10-01T00:00:00Z" } } };
    resealPayoutDestinations(db, rotating);
    expect(db.assistantPayoutDestinations.asst_mark.accountNumberEnc).toBe(sealed.accountNumberEnc);
  });

  it("reads the previous key from SAFEHUBBY_ENCRYPTION_KEY_PREVIOUS", () => {
    const saved = { ...process.env };
    try {
      process.env.SAFEHUBBY_ENCRYPTION_KEY = "b".repeat(64);
      process.env.SAFEHUBBY_ENCRYPTION_KEY_PREVIOUS = "a".repeat(64);
      const fromEnv = cipherFromEnv()!;
      expect(fromEnv.rotating).toBe(true);
      expect(fromEnv.decrypt(before.encrypt("old secret"))).toBe("old secret");
      delete process.env.SAFEHUBBY_ENCRYPTION_KEY_PREVIOUS;
      expect(cipherFromEnv()!.rotating).toBe(false);
    } finally {
      process.env = saved;
    }
  });
});

describe("a rotation with the wrong previous key", () => {
  const oldKey = keyFrom("a".repeat(64))!;
  const before = makeCipher(oldKey);
  const thread = (body: unknown) => ({ voiceMessages: [], textMessages: [{ body }], conciergeTasks: [] }) as any;

  it("counts nothing unreadable when the previous key is the right one", () => {
    const rotating = makeCipher(keyFrom("b".repeat(64))!, [oldKey]);
    const db = { ...sealLocations(dbWith([{ lat: 18.4 }]), before), ...thread(before.encrypt("hola")) };
    expect(countUnreadable(db, rotating)).toBe(0);
  });

  it("counts what neither key opens, so the server can refuse to start before a save wipes it", () => {
    const wrong = makeCipher(keyFrom("b".repeat(64))!, [keyFrom("c".repeat(64))!]);
    const db = { ...sealLocations(dbWith([{ lat: 18.4 }]), before), ...thread(before.encrypt("hola")) };
    expect(countUnreadable(db, wrong)).toBe(2);
  });
});
