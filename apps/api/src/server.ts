import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { HttpError, routes, type Ctx } from "./routes.ts";
import { Store } from "./store.ts";

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

export function createApp(ctx: Ctx) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin ?? "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const url = new URL(req.url ?? "/", "http://localhost");
    const found = match(req.method ?? "GET", url.pathname);
    if (!found) return send(res, 404, { error: "Not found" });

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
  return { store, now: () => new Date() };
}
