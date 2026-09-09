import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HttpError, makeLimiters, routes, type Ctx } from "./routes.ts";
import { Store } from "./store.ts";
import { SESSION_COOKIE, clearedCookie, parseCookies, sessionCookie } from "./auth.ts";

/**
 * Browsers send cookies cross-origin only for an explicitly allowlisted
 * origin — a wildcard is rejected with credentials. In production set
 * ALLOWED_ORIGINS; in development the Vite dev server is allowed.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((o) => o.trim()).filter(Boolean);
const SECURE_COOKIES = process.env.NODE_ENV === "production";

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
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const url = new URL(req.url ?? "/", "http://localhost");
    const found = match(req.method ?? "GET", url.pathname);
    if (!found) return send(res, 404, { error: "Not found" });

    // Resolve identity before the handler runs; a route never sees a raw token.
    const token = readToken(req);
    const ctx: Ctx = {
      ...base,
      actorId: resolveActor(base, token),
      sessionToken: token,
      clientKey: clientKey(req),
      setSession: (next) => {
        res.setHeader("Set-Cookie", next === null ? clearedCookie(SECURE_COOKIES) : sessionCookie(next, SECURE_COOKIES));
      },
    };

    try {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const params = { ...Object.fromEntries(url.searchParams), ...found.params };
      send(res, 200, await found.handler(ctx, params, body));
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      // Domain guards (consent, redemption, unknown drink) throw plain Errors;
      // surfacing the message is what makes the API self-explanatory.
      const message = err instanceof Error ? err.message : "Unexpected error";
      send(res, 400, { error: message });
    }
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  const json = JSON.stringify(payload ?? null);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(json);
}

export function makeCtx(store = new Store()): Ctx {
  return { store, now: () => new Date(), actorId: null, clientKey: "local", limiters: makeLimiters() };
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

/** Rate-limit key. Behind a proxy this needs the real client ip — see SECURITY.md. */
function clientKey(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0];
  return (first ?? req.socket.remoteAddress ?? "unknown").trim();
}
