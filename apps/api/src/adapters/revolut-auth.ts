import { createSign } from "node:crypto";

/**
 * Signing in to Revolut Business.
 *
 * Revolut does not hand out a long-lived API key. The owner makes an RSA key
 * pair, uploads the public half in Revolut Business (Settings → APIs →
 * Business API), and gets a client ID. Every token request is then signed
 * with the private half as a short JWT (a "client assertion"). Once, the
 * owner approves the app on Revolut's consent page; Revolut sends a one-time
 * code back to our callback, which is traded for an access token (about 40
 * minutes) and a refresh token (kept, and used to get new access tokens).
 *
 * Kept free of the database: whoever owns the refresh token (routes.ts, the
 * store) is told through `onRefreshToken` and hands it back in at startup.
 */
export interface RevolutAuthConfig {
  clientId: string;
  privateKeyPem: string;
  /** The domain the public key was registered against — also the redirect host. */
  issuer: string;
  environment: "sandbox" | "production";
  refreshToken?: string;
  now?: () => Date;
  fetch?: typeof fetch;
  onRefreshToken?: (token: string) => void;
}

const HOSTS = {
  sandbox: { api: "https://sandbox-b2b.revolut.com/api", consent: "https://sandbox-business.revolut.com/app-confirm" },
  production: { api: "https://b2b.revolut.com/api", consent: "https://business.revolut.com/app-confirm" },
};
/** Renew this long before Revolut's own expiry, so a request never races it. */
const EARLY_MS = 5 * 60_000;

const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function createRevolutAuth(config: RevolutAuthConfig) {
  const now = config.now ?? (() => new Date());
  const doFetch = config.fetch ?? fetch;
  const hosts = HOSTS[config.environment];
  let refreshToken = config.refreshToken;
  let access: { token: string; expiresAt: number } | null = null;

  // Back to the owner portal, which hands the code to the API while the owner
  // is signed in — so only the owner can ever finish connecting an account.
  const redirectUri = () => `https://${config.issuer}/master`;
  let onRefresh = config.onRefreshToken;

  const clientAssertion = (): string => {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify({
      iss: config.issuer, sub: config.clientId, aud: "https://revolut.com",
      exp: Math.floor(now().getTime() / 1000) + 5 * 60,
    }));
    const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(config.privateKeyPem);
    return `${header}.${payload}.${b64url(signature)}`;
  };

  const requestToken = async (params: Record<string, string>) => {
    const res = await doFetch(`${hosts.api}/1.0/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: config.clientId,
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: clientAssertion(),
      }).toString(),
    });
    if (!res.ok) throw new Error(`Revolut sign-in failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
    const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("Revolut sign-in returned no access token.");
    access = { token: data.access_token, expiresAt: now().getTime() + (data.expires_in ?? 2399) * 1000 };
    if (data.refresh_token) {
      refreshToken = data.refresh_token;
      onRefresh?.(data.refresh_token);
    }
    return data.access_token;
  };

  return {
    clientAssertion,
    apiBase: () => hosts.api,
    connected: () => Boolean(refreshToken),
    onRefreshToken: (fn: (token: string) => void) => { onRefresh = fn; },
    consentUrl: (state?: string) => {
      const url = new URL(hosts.consent);
      if (state) url.searchParams.set("state", state);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", redirectUri());
      url.searchParams.set("response_type", "code");
      return url.toString();
    },
    exchangeCode: (code: string) => requestToken({ grant_type: "authorization_code", code }),
    setRefreshToken: (token: string) => { refreshToken = token; access = null; },
    async accessToken(): Promise<string> {
      if (access && access.expiresAt - EARLY_MS > now().getTime()) return access.token;
      if (!refreshToken) throw new Error("Revolut Business is not connected yet — approve it from the owner portal.");
      return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    },
  };
}

export type RevolutAuth = ReturnType<typeof createRevolutAuth>;

/** The server's one Revolut sign-in, from its environment — null when the
 *  owner has not set up the Business API yet. */
export const revolutAuth: RevolutAuth | null = (() => {
  const clientId = process.env.REVOLUT_CLIENT_ID;
  const privateKeyPem = process.env.REVOLUT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const issuer = process.env.REVOLUT_ISSUER;
  if (!clientId || !privateKeyPem || !issuer) return null;
  return createRevolutAuth({
    clientId, privateKeyPem, issuer,
    environment: process.env.REVOLUT_ENV === "production" ? "production" : "sandbox",
    refreshToken: process.env.REVOLUT_REFRESH_TOKEN || undefined,
  });
})();

/** The base URL and Authorization header for a Revolut call: a fresh OAuth
 *  token when the Business API is set up, otherwise the older manual
 *  REVOLUT_API_BASE / REVOLUT_API_KEY pair. Null when neither is. */
export async function revolutRequest(): Promise<{ base: string; authorization: string } | null> {
  if (revolutAuth?.connected()) {
    return { base: revolutAuth.apiBase(), authorization: `Bearer ${await revolutAuth.accessToken()}` };
  }
  const base = process.env.REVOLUT_API_BASE;
  const key = process.env.REVOLUT_API_KEY;
  return base && key ? { base: base.replace(/\/$/, ""), authorization: `Bearer ${key}` } : null;
}

export const revolutReady = () => Boolean(revolutAuth?.connected() || (process.env.REVOLUT_API_BASE && process.env.REVOLUT_API_KEY));
