/**
 * The script an agent can save and run with node to check a Safehubby answer by itself. It uses only node's own crypto, and
 * the public key is either a file the agent already has or fetched from this site by its id (current or retired), so the
 * check needs nothing from us but the public half of the key. The same inputs always give the same result.
 *
 * Kept as text in the code rather than a file on disk so it ships with the server wherever it runs.
 */
const SCRIPT = String.raw`// Checks a signed Safehubby answer with node's own crypto. Node 18 or later, nothing to install.
// Usage: node verify.mjs <saved answer file> '<X-Safehubby-Signature header>' '<path and query you asked>' [public key file]
// Save the answer exactly as it arrived (the bytes, not JSON you parsed and saved again).
// Prints VALID and exits 0, or INVALID and exits 1. Without a key file the key is fetched from the key address below,
// or from SAFEHUBBY_KEY_URL if you set it (a mirror, or a test server).
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const KEYS = process.env.SAFEHUBBY_KEY_URL || "__ORIGIN__/api/agent/key";
const [file, header, path, keyFile] = process.argv.slice(2);
if (!file || !header || !path) {
  console.log("usage: node verify.mjs <answer file> '<X-Safehubby-Signature header>' '<path and query asked>' [public key file]");
  process.exit(2);
}

// Each field by its exact name, so a field called "xsig" is never read as "sig".
const field = (name) => (new RegExp("(?:^|;)\\s*" + name + '="([^"]*)"').exec(header) || [])[1];
const version = field("v") || "1", keyId = field("keyId"), created = field("created"), sig = field("sig"), payment = field("payment");
const hash = createHash("sha256").update(readFileSync(file)).digest("hex");

// Version 1: an answer that was not paid for. Version 2: a paid answer, which also names its payment.
let message = null;
if (version === "1") message = ["safehubby-v1", path, created, hash].join("\n");
else if (version === "2" && payment) message = ["safehubby-v2", path, created, hash, payment].join("\n");

let pem = keyFile ? readFileSync(keyFile, "utf8") : null;
let why = "";
if (!pem && message) {
  const keys = await (await fetch(KEYS)).json();
  const all = [{ keyId: keys.keyId, publicKeyPem: keys.publicKeyPem, validFrom: keys.validFrom }, ...(keys.retired || [])];
  const key = all.find((k) => k.keyId === keyId);
  if (!key) why = "no key with id " + keyId;
  // A key's window, where it is recorded: a signature dated outside it was not made while that key was in use.
  else if (key.validFrom && created < key.validFrom) why = "dated before key " + keyId + " was in use";
  else if (key.retiredAt && created > key.retiredAt) why = "dated after key " + keyId + " was retired";
  else pem = key.publicKeyPem;
}

let ok = false;
try { ok = Boolean(message && created && sig && pem) && verify(null, Buffer.from(message), createPublicKey(pem), Buffer.from(sig, "base64")); } catch { ok = false; }
console.log(ok ? "VALID: key " + keyId + ", made " + created + (payment ? ", payment " + payment : "") : "INVALID" + (why ? ": " + why : ""));
process.exit(ok ? 0 : 1);
`;

/** The script, pointing at the key address of the site that served it. */
export const verifyScript = (origin: string): string => SCRIPT.replace("__ORIGIN__", origin);
