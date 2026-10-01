import { X509Certificate, verify } from "node:crypto";
import { APP_STORE_BUNDLE_ID } from "@safehubby/core";

/**
 * Verifies what StoreKit 2 and App Store Server Notifications V2 send.
 *
 * Both arrive as JWS signed by Apple: an ES256 signature whose x5c header
 * carries the signing certificate and the intermediate that issued it. A
 * payload is trusted only when that chain leads to Apple's root, each
 * certificate carries Apple's marker for its role, and the signature checks
 * out. Nothing here calls Apple, so verification works offline and cannot be
 * slowed or broken by an outage on their side.
 *
 * This is the only thing standing between "the client says it paid" and a
 * paid plan, so every check fails closed.
 */

/**
 * Apple Root CA - G3, from https://www.apple.com/certificateauthority/.
 * SHA-256 fingerprint 63:34:3A:BF:…:3E:91:79, pinned in test/app-store.test.ts.
 */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

// DER encodings of Apple's role markers, found in a certificate's extensions.
// 1.2.840.113635.100.6.11.1 marks a StoreKit signing (leaf) certificate,
// 1.2.840.113635.100.6.2.1 the Apple Worldwide Developer Relations intermediate.
const STOREKIT_LEAF_OID = Buffer.from("060a2a864886f76364060b01", "hex");
const WWDR_INTERMEDIATE_OID = Buffer.from("060a2a864886f76364060201", "hex");

export class AppStoreVerificationError extends Error {}

export interface AppStoreVerifyOptions {
  /** PEM roots to trust. Defaults to Apple Root CA - G3; tests pass their own. */
  trustedRoots?: string[];
  now: Date;
}

/** The fields of Apple's JWSTransactionDecodedPayload this app relies on. */
export interface AppStoreTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  expiresDate: number;
  environment: "Production" | "Sandbox";
  /** Set when Apple refunded or revoked the purchase. */
  revocationDate?: number;
  /** "FREE_TRIAL" when this period is an introductory free trial. */
  offerDiscountType?: string;
}

export interface AppStoreNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  environment: string;
  /** Null for notifications about no particular purchase, such as TEST. */
  transaction: AppStoreTransaction | null;
}

const fail = (message: string): never => {
  throw new AppStoreVerificationError(message);
};

function decodeSegment(segment: string | undefined, what: string): Record<string, unknown> {
  if (!segment) fail(`Malformed signed payload: missing ${what}.`);
  try {
    const value = JSON.parse(Buffer.from(segment!, "base64url").toString("utf8")) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Reported below.
  }
  return fail(`Malformed signed payload: unreadable ${what}.`);
}

function certificateFrom(base64Der: unknown, role: string): X509Certificate {
  if (typeof base64Der !== "string") fail(`Signed payload is missing its ${role} certificate.`);
  try {
    return new X509Certificate(Buffer.from(base64Der as string, "base64"));
  } catch {
    return fail(`The ${role} certificate cannot be read.`);
  }
}

function assertValidAt(cert: X509Certificate, role: string, at: Date): void {
  const from = new Date(cert.validFrom).getTime();
  const to = new Date(cert.validTo).getTime();
  if (!(at.getTime() >= from && at.getTime() <= to)) {
    fail(`The ${role} certificate was not valid when this was signed.`);
  }
}

/**
 * Verifies a JWS from Apple and returns its payload.
 *
 * The root in the x5c header is ignored: trusting whatever root a payload
 * names would let anyone sign with their own. The intermediate must instead be
 * issued by one of `trustedRoots`.
 */
export function verifyAppleJws(jws: string, options: AppStoreVerifyOptions): Record<string, unknown> {
  if (typeof jws !== "string") fail("Signed payload must be a string.");
  const parts = jws.split(".");
  if (parts.length !== 3) fail("Malformed signed payload: expected three dot-separated parts.");
  const [headSegment, bodySegment, signatureSegment] = parts as [string, string, string];
  const header = decodeSegment(headSegment, "header");
  if (header.alg !== "ES256") fail("Signed payload must use ES256, as Apple signs with.");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) fail("Signed payload is missing its certificate chain.");

  const leaf = certificateFrom((x5c as unknown[])[0], "signing");
  const intermediate = certificateFrom((x5c as unknown[])[1], "intermediate");
  const roots = (options.trustedRoots ?? [APPLE_ROOT_CA_G3_PEM]).map((pem) => new X509Certificate(pem));

  if (!intermediate.ca) fail("The intermediate certificate is not a certificate authority.");
  if (!intermediate.raw.includes(WWDR_INTERMEDIATE_OID)) fail("The intermediate is not Apple's StoreKit issuer.");
  if (!roots.some((root) => intermediate.checkIssued(root) && intermediate.verify(root.publicKey))) {
    fail("The certificate chain does not lead to a trusted root.");
  }
  if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) {
    fail("The signing certificate was not issued by the intermediate.");
  }
  if (!leaf.raw.includes(STOREKIT_LEAF_OID)) fail("The signing certificate is not an Apple StoreKit certificate.");

  const signature = Buffer.from(signatureSegment, "base64url");
  const signed = verify(
    "sha256",
    Buffer.from(`${headSegment}.${bodySegment}`),
    { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!signed) fail("The signature does not match the payload.");

  const payload = decodeSegment(bodySegment, "payload");
  // Checked at signing time, as Apple's own library does when it verifies
  // offline, so a purchase signed by a since-rotated certificate still
  // verifies. signedDate is covered by the signature, and a date in the
  // future falls back to now rather than stretching the window.
  const signedDate = typeof payload.signedDate === "number" ? new Date(payload.signedDate) : options.now;
  const effective = signedDate.getTime() > options.now.getTime() ? options.now : signedDate;
  assertValidAt(leaf, "signing", effective);
  assertValidAt(intermediate, "intermediate", effective);
  return payload;
}

const ACCEPTED_ENVIRONMENTS = new Set(["Production", "Sandbox"]);

function requireString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== "string" || value.length === 0) fail(`Transaction is missing ${field}.`);
  return value as string;
}

function requireNumber(payload: Record<string, unknown>, field: string): number {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`Transaction is missing ${field}.`);
  return value as number;
}

function checkApp(bundleId: unknown, environment: unknown): void {
  if (bundleId !== APP_STORE_BUNDLE_ID) fail(`Purchase is for bundle "${String(bundleId)}", not this app.`);
  // Sandbox is accepted because TestFlight and App Review both buy in it.
  // Xcode's local StoreKit testing is not: those are signed on the developer's
  // machine and no store stands behind them.
  if (!ACCEPTED_ENVIRONMENTS.has(String(environment))) fail(`Purchases from the "${String(environment)}" environment are not accepted.`);
}

/** Verifies a StoreKit 2 `jwsRepresentation` of a subscription purchase. */
export function verifyAppStoreTransaction(jws: string, options: AppStoreVerifyOptions): AppStoreTransaction {
  const payload = verifyAppleJws(jws, options);
  checkApp(payload.bundleId, payload.environment);
  return {
    transactionId: requireString(payload, "transactionId"),
    originalTransactionId: requireString(payload, "originalTransactionId"),
    bundleId: requireString(payload, "bundleId"),
    productId: requireString(payload, "productId"),
    purchaseDate: requireNumber(payload, "purchaseDate"),
    expiresDate: requireNumber(payload, "expiresDate"),
    environment: payload.environment as AppStoreTransaction["environment"],
    ...(typeof payload.revocationDate === "number" ? { revocationDate: payload.revocationDate } : {}),
    ...(typeof payload.offerDiscountType === "string" ? { offerDiscountType: payload.offerDiscountType } : {}),
  };
}

/** Verifies an App Store Server Notification V2 `signedPayload` and the transaction inside it. */
export function verifyAppStoreNotification(signedPayload: string, options: AppStoreVerifyOptions): AppStoreNotification {
  const payload = verifyAppleJws(signedPayload, options);
  const data = payload.data;
  if (!data || typeof data !== "object") fail("Notification is missing its data.");
  const record = data as Record<string, unknown>;
  checkApp(record.bundleId, record.environment);
  const notificationType = payload.notificationType;
  const notificationUUID = payload.notificationUUID;
  if (typeof notificationType !== "string" || typeof notificationUUID !== "string") {
    fail("Notification is missing its type or id.");
  }
  const signedTransaction = record.signedTransactionInfo;
  return {
    notificationType: notificationType as string,
    ...(typeof payload.subtype === "string" ? { subtype: payload.subtype } : {}),
    notificationUUID: notificationUUID as string,
    environment: String(record.environment),
    transaction: typeof signedTransaction === "string" ? verifyAppStoreTransaction(signedTransaction, options) : null,
  };
}
