import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { HttpError, makeLimiters, routes, type Ctx } from "./routes.ts";
import { Store, type StoreLike } from "./store.ts";
import {
  ASSISTANT_SESSION_COOKIE, ASSISTANT_SESSION_TTL_MS, SESSION_COOKIE, clearedCookie, parseCookies, sessionCookie,
} from "./auth.ts";

/**
 * Browsers send cookies cross-origin only for an explicitly allowlisted
 * origin — a wildcard is rejected with credentials. In production set
 * ALLOWED_ORIGINS; in development the Vite dev server is allowed.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((o) => o.trim()).filter(Boolean);
const SECURE_COOKIES = process.env.NODE_ENV === "production";

/**
 * In production the API also serves the built web app, so the two are one
 * origin: the session cookie is same-origin (no CORS credentials dance), and
 * Railway bills one service instead of two.
 */
const WEB_ROOT = process.env.WEB_ROOT ? resolve(process.env.WEB_ROOT) : null;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * Serves a built file, falling back to index.html so client-side routes work.
 * Paths are normalised and confined to WEB_ROOT — a static handler that joins
 * user input onto a directory is the classic way to serve /etc/passwd.
 */
function serveStatic(res: ServerResponse, pathname: string, headOnly = false): boolean {
  if (!WEB_ROOT) return false;

  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(join(WEB_ROOT, relative));
  const isAsset = candidate.startsWith(WEB_ROOT + "/") && existsSync(candidate) && statSync(candidate).isFile();
  const file = isAsset ? candidate : join(WEB_ROOT, "index.html");
  if (!existsSync(file)) return false;

  const ext = extname(file);
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    // Content-hashed filenames are immutable (Vite emits base64url hashes, not
    // hex); index.html must never be cached or a deploy strands people on the
    // old bundle.
    "cache-control": isAsset && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(file)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  // HEAD gets the same headers and no body: CDNs, uptime checks and browser
  // preflights use it, and a 404 there reads as the asset being missing.
  if (headOnly) res.end();
  else createReadStream(file).pipe(res);
  return true;
}

const ROUTE_TABLE = Object.entries(routes).map(([key, handler]) => {
  const [method, pattern] = key.split(" ") as [string, string];
  return { method, segments: pattern.split("/").filter(Boolean), handler };
});

/** Matches a request path against the route table, extracting :params. */
function match(method: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  for (const route of ROUTE_TABLE) {
    if (route.method !== method || route.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (const [i, seg] of route.segments.entries()) {
      const part = parts[i]!;
      if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(part);
      else if (seg !== part) { ok = false; break; }
    }
    if (ok) return { handler: route.handler, params };
  }
  return undefined;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Nothing this API accepts is large; cap it rather than buffer unbounded.
    if (size > 1_000_000) throw new HttpError(413, "Request body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function createApp(base: Ctx) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    // HEAD is routed as GET; the response body is dropped below.
    const found = match(method === "HEAD" ? "GET" : method, url.pathname);
    if (!found) {
      // Unmatched GET/HEAD falls through to the built web app; unmatched API
      // paths stay a JSON 404 rather than handing an HTML page to a fetch().
      const isRead = method === "GET" || method === "HEAD";
      if (isRead && !url.pathname.startsWith("/api/") && serveStatic(res, url.pathname, method === "HEAD")) return;
      return send(res, 404, { error: "Not found" });
    }

    // Resolve identity before the handler runs; a route never sees a raw token.
    // Travelers and assistants are two entirely separate identity spaces —
    // different cookies, different session tables, resolved independently —
    // so a browser can hold both at once with no interaction between them.
    const token = readToken(req);
    const assistantToken = readAssistantToken(req);
    const ctx: Ctx = {
      ...base,
      actorId: resolveActor(base, token),
      sessionToken: token,
      assistantActorId: resolveAssistantActor(base, assistantToken),
      assistantSessionToken: assistantToken,
      clientKey: clientKey(req),
      adminKey: firstHeader(req.headers["x-admin-key"]),
      partnerKey: firstHeader(req.headers["x-concierge-key"]),
      setSession: (next) => {
        appendSetCookie(res, next === null ? clearedCookie(SECURE_COOKIES) : sessionCookie(next, SECURE_COOKIES));
      },
      setAssistantSession: (next) => {
        appendSetCookie(res, next === null
          ? clearedCookie(SECURE_COOKIES, ASSISTANT_SESSION_COOKIE)
          : sessionCookie(next, SECURE_COOKIES, ASSISTANT_SESSION_COOKIE, ASSISTANT_SESSION_TTL_MS));
      },
    };

    try {
      const body = method === "POST" ? await readBody(req) : undefined;
      const params = { ...Object.fromEntries(url.searchParams), ...found.params };
      send(res, 200, await found.handler(ctx, params, body), method === "HEAD");
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });

      /**
       * Domain guards (consent, redemption, unknown drink) throw plain Errors
       * and their messages are written to be read by a user, so surfacing them
       * is what makes the API self-explanatory.
       *
       * A TypeError or a RangeError is not that. It is a bug in this server,
       * and its message names internal properties and call sites. Returning it
       * as a 400 both leaks those internals and tells the caller they sent
       * something wrong when they did not — which sends people debugging their
       * own perfectly good request. Those get a 500 and a generic message, and
       * the real one goes to the log where it belongs.
       */
      const isBug = err instanceof TypeError || err instanceof RangeError
        || err instanceof ReferenceError || err instanceof SyntaxError;
      if (isBug || !(err instanceof Error)) {
        console.error("[safehubby] unhandled error", err);
        return send(res, 500, { error: "Something went wrong on our end." });
      }
      send(res, 400, { error: err.message });
    }
  });
}

/**
 * Appends rather than overwrites: a bare `res.setHeader("Set-Cookie", ...)`
 * called twice on the same response replaces the first cookie instead of
 * sending both, which would silently drop one identity's cookie the moment a
 * single request ever needed to set both (it does not today, but nothing
 * should depend on that never happening).
 */
function appendSetCookie(res: ServerResponse, value: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) return void res.setHeader("Set-Cookie", value);
  res.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : [String(existing)]), value]);
}

function send(res: ServerResponse, status: number, payload: unknown, headOnly = false): void {
  const json = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
  });
  res.end(headOnly ? undefined : json);
}

export function makeCtx(store: StoreLike = new Store()): Ctx {
  return {
    store, now: () => new Date(), actorId: null, assistantActorId: null, clientKey: "local", limiters: makeLimiters(),
    adminKey: null, partnerKey: null,
  };
}

function readToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
}

/** An expired session is treated as absent; it is swept on next write. */
function resolveActor(ctx: Ctx, token: string | null): string | null {
  if (!token) return null;
  const session = ctx.store.data.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= ctx.now().getTime()) return null;
  return session.userId;
}

/**
 * The assistant portal's own identity, read from its own cookie only — no
 * `Authorization: Bearer` fallback, unlike `readToken` above. Bearer support
 * exists there for a native app that cannot rely on cookies; the assistant
 * portal is browser-only for now, and giving it the same header would make a
 * single `Authorization` value ambiguous between the two, separate identity
 * spaces this is deliberately keeping apart.
 */
function readAssistantToken(req: IncomingMessage): string | null {
  return parseCookies(req.headers.cookie)[ASSISTANT_SESSION_COOKIE] ?? null;
}

function resolveAssistantActor(ctx: Ctx, token: string | null): string | null {
  if (!token) return null;
  const session = ctx.store.data.assistantSessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= ctx.now().getTime()) return null;
  return session.assistantId;
}

/** Rate-limit key. Behind a proxy this needs the real client ip — see SECURITY.md. */
function clientKey(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0];
  return (first ?? req.socket.remoteAddress ?? "unknown").trim();
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
