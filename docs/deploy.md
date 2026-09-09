# Deploying to Railway

One service serves both the API and the web app, so the session cookie is
same-origin and there is no CORS to configure. It talks to a Railway Postgres.

## 1. Create the project

```bash
npm i -g @railway/cli
railway login
railway init            # or: railway link, for an existing project
railway add --database postgres
```

Adding the database sets `DATABASE_URL` on the service automatically. Use the
private URL (`postgres.railway.internal`) — traffic stays inside the project and
does not count against egress.

## 2. Set the variables

```bash
# 32 random bytes, hex. Generate it once and keep it safe.
railway variables --set "SAFEHUBBY_ENCRYPTION_KEY=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
railway variables --set "NODE_ENV=production"
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Set by the Postgres plugin. |
| `SAFEHUBBY_ENCRYPTION_KEY` | yes | 64 hex chars. Encrypts location history. |
| `NODE_ENV` | yes | `production` — turns on `Secure` cookies and the boot checks. |
| `PORT` | no | Railway injects it. |
| `WEB_ROOT` | no | Set by the Dockerfile. |
| `ALLOWED_ORIGINS` | no | Only needed if you serve the web app from a second origin. |
| `YELP_API_KEY` | no | Real venue lookup. Falls back to Google Places, then mock. |
| `GOOGLE_PLACES_API_KEY` | no | See `docs/api.md` for what these can and cannot return. |

**Losing `SAFEHUBBY_ENCRYPTION_KEY` means losing every stored location trace.**
That is the intended failure — the alternative is a key the platform can read.
Store it in a password manager, not only in Railway.

## 3. Deploy

```bash
railway up
```

The Dockerfile builds the web app, prunes dev dependencies, and runs the API
directly under Node 22's type stripping — there is no server build step.

Railway health-checks `/api/health`, which also reports which venue source is
live (`mock`, `yelp`, or `google-places`).

## Run exactly one replica

`railway.json` pins `numReplicas: 1`, and this is not a formality.

The database document is stored as a single JSONB row and rewritten on each
update. Within one Node process that is safe: `store.update()` mutates
synchronously and the event loop cannot interleave two of them. Across two
replicas it is not — the second writer would clobber the first.

The row carries a `version` column, so a concurrent write is detected and
logged (`Concurrent write detected... requires exactly one replica`) rather
than silently winning. If you see that line, you are running more than one
replica and losing data.

**To scale horizontally**, split `safehubby_state` into real tables per
aggregate (travelers, sessions, nights, grants, crews) first. The store
interface in `apps/api/src/store.ts` is the seam: implement `StoreLike` against
those tables and nothing in the domain or the routes changes.

## Verifying a deployment

```bash
curl https://<your-app>.up.railway.app/api/health
# {"ok":true,"venueSource":"mock"}
```

Then confirm location encryption is actually on — this is the check worth
doing, because a missing key is the one misconfiguration that fails silently:

```bash
railway logs | grep "Location encryption"
# [safehubby] Location encryption: on
```

The server refuses to start in production without `DATABASE_URL` or
`SAFEHUBBY_ENCRYPTION_KEY`, so a deploy that boots has both.

To confirm traces are illegible at rest:

```bash
railway connect postgres
safehubby=# SELECT document->'nights'->0->'pings' FROM safehubby_state;
--  "v1.xxxx.yyyy.zzzz"   ← ciphertext, not coordinates
```

## Local development against Postgres

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/safehubby"
export SAFEHUBBY_ENCRYPTION_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
pnpm --filter @safehubby/api start
```

Without `DATABASE_URL` the API uses the flat-file store in `.safehubby/`, which
is fine for development and is thrown away by any platform on redeploy.

The Postgres store tests skip when no database is reachable. CI should set
`TEST_DATABASE_URL` and run them — they are what prove location data is
encrypted at rest.
