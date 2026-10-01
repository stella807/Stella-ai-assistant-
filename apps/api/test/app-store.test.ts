import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  APPLE_ROOT_CA_G3_PEM,
  AppStoreVerificationError,
  verifyAppStoreNotification,
  verifyAppStoreTransaction,
} from "../src/app-store.ts";
import { NOW, TEST_ROOT_PEM, signAppleJws, transaction } from "./app-store-signing.ts";

const options = { trustedRoots: [TEST_ROOT_PEM], now: NOW };

describe("Apple's root certificate", () => {
  it("is the real Apple Root CA - G3, pinned by the fingerprint Apple publishes", () => {
    const root = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
    expect(root.subject).toContain("CN=Apple Root CA - G3");
    expect(root.fingerprint256).toBe(
      "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79",
    );
  });
});

describe("verifyAppStoreTransaction", () => {
  it("accepts a transaction signed through a trusted chain", () => {
    const tx = verifyAppStoreTransaction(signAppleJws(transaction()), options);
    expect(tx).toMatchObject({
      transactionId: "2000000100",
      originalTransactionId: "2000000001",
      productId: "app.safehubby.premium-plus.monthly",
      environment: "Production",
    });
  });

  it("refuses a chain that does not end at a trusted root", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction(), "rogue"), options))
      .toThrow(AppStoreVerificationError);
  });

  it("refuses a real Apple chain when it is not the one being trusted", () => {
    // Production trusts only Apple's root, so the test chain must fail there.
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction()), { now: NOW }))
      .toThrow(/trusted root/);
  });

  it("refuses a signing certificate without Apple's StoreKit marker", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction(), "unmarked"), options))
      .toThrow(/StoreKit/);
  });

  it("refuses a payload edited after signing", () => {
    const [head, , sig] = signAppleJws(transaction()).split(".");
    const forged = Buffer.from(JSON.stringify(transaction({ productId: "app.safehubby.elite.annual" }))).toString("base64url");
    expect(() => verifyAppStoreTransaction(`${head}.${forged}.${sig}`, options)).toThrow(/signature/);
  });

  it("refuses anything but ES256, including an unsigned token", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction(), "trusted", { alg: "none" }), options))
      .toThrow(/ES256/);
    expect(() => verifyAppStoreTransaction("not-a-jws", options)).toThrow(AppStoreVerificationError);
  });

  it("refuses a certificate that was not valid when the payload was signed", () => {
    // The test chain is valid for a century; sign after that, and verify then.
    const farFuture = new Date("2200-01-01T00:00:00Z");
    const jws = signAppleJws(transaction({ signedDate: farFuture.getTime() }));
    expect(() => verifyAppStoreTransaction(jws, { ...options, now: farFuture })).toThrow(/valid/);
  });

  it("does not let a future signedDate stretch a certificate's validity", () => {
    const farFuture = new Date("2200-01-01T00:00:00Z");
    // Checked at "now" instead, where the certificate is still valid.
    expect(verifyAppStoreTransaction(signAppleJws(transaction({ signedDate: farFuture.getTime() })), options))
      .toMatchObject({ transactionId: "2000000100" });
  });

  it("names the offending bundle in the error", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction({ bundleId: "com.someone.else" })), options))
      .toThrow('Purchase is for bundle "com.someone.else", not this app.');
  });

  it("refuses another app's purchase", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction({ bundleId: "com.someone.else" })), options))
      .toThrow(/bundle/);
  });

  it("refuses local StoreKit-testing transactions, which no money stands behind", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction({ environment: "Xcode" })), options))
      .toThrow(/environment/);
  });

  it("refuses a transaction missing the fields a subscription needs", () => {
    expect(() => verifyAppStoreTransaction(signAppleJws(transaction({ expiresDate: undefined })), options))
      .toThrow(/expiresDate/);
  });
});

describe("verifyAppStoreNotification", () => {
  it("verifies the notification and the transaction inside it", () => {
    const signedPayload = signAppleJws({
      notificationType: "DID_RENEW",
      notificationUUID: "n-1",
      signedDate: NOW.getTime(),
      data: {
        bundleId: "app.safehubby",
        environment: "Production",
        signedTransactionInfo: signAppleJws(transaction({ transactionId: "2000000200" })),
      },
    });
    expect(verifyAppStoreNotification(signedPayload, options)).toMatchObject({
      notificationType: "DID_RENEW",
      notificationUUID: "n-1",
      transaction: { transactionId: "2000000200" },
    });
  });

  it("refuses a genuine envelope carrying a forged transaction", () => {
    const signedPayload = signAppleJws({
      notificationType: "DID_RENEW",
      notificationUUID: "n-2",
      signedDate: NOW.getTime(),
      data: {
        bundleId: "app.safehubby",
        environment: "Production",
        signedTransactionInfo: signAppleJws(transaction(), "rogue"),
      },
    });
    expect(() => verifyAppStoreNotification(signedPayload, options)).toThrow(AppStoreVerificationError);
  });

  it("accepts a notification with no transaction, such as Apple's TEST ping", () => {
    const signedPayload = signAppleJws({
      notificationType: "TEST",
      notificationUUID: "n-3",
      signedDate: NOW.getTime(),
      data: { bundleId: "app.safehubby", environment: "Sandbox" },
    });
    expect(verifyAppStoreNotification(signedPayload, options)).toMatchObject({
      notificationType: "TEST",
      transaction: null,
    });
  });
});
