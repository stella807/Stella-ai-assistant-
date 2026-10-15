# Deploying

Two paths: **Railway** (paid, always on) and a **free tier** (Render + Neon).

Read the free-tier caveat before choosing it: a free web service sleeps when
idle, and a sleeping safety app is not a safety app. It is right for testing and
showing people; it is wrong for anyone actually going out on a Friday night.

---

# Railway

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
| `SAFEHUBBY_ENCRYPTION_KEY` | yes | 64 hex chars. Encrypts location history, and required before any assistant payout destination (bank account) can be stored at all — see `docs/concierge.md`. |
| `NODE_ENV` | yes | `production` — turns on `Secure` cookies and the boot checks. |
| `PORT` | no | Railway injects it. |
| `WEB_ROOT` | no | Set by the Dockerfile. |
| `ALLOWED_ORIGINS` | no | Only needed if you serve the web app from a second origin. |
| `YELP_API_KEY` | no | Real venue lookup. Falls back to Google Places, then mock. |
| `GOOGLE_PLACES_API_KEY` | no | Venue lookup, the nearby-store picker for the pharmacy run, and the concierge task flow's free-text place search. See `docs/api.md` and `docs/fulfillment.md` for what these can and cannot return. |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | no | Web-build-time only, not a server variable — set before `pnpm build` in `apps/web`. Renders an embedded map for a place picked in the concierge flow. A browser-scoped, HTTP-referrer-restricted key, safe to ship in the client bundle — see `docs/concierge.md`. |

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


---

---

# The marketing site, and a real domain

`apps/site` is static — plain HTML, no JavaScript, built to `apps/site/dist`.
It is the one piece that does **not** belong on the app server, and the one
piece Cloudflare Pages can host for nothing.

## The pages it builds

| URL | Page |
|---|---|
| `/` | Home, English |
| `/es/` | Home, Spanish |
| `/work/` | Hiring, English |
| `/es/trabajo/` | Hiring, Spanish |

Hiring is its own page because it is its own audience — somebody deciding
whether to trust us with their father has no use for our payroll. It also
gives a job ad a URL to point at: put `safehubby.com/work/` in a
ClasificadosOnline listing or an Instagram bio and the pay rate is the first
thing on screen, with no sales pitch to scroll past.

The home page sells three tiers (`FEATURED_PLAN_IDS` in `content.ts`), not the
whole seven-rung ladder. Elite is still sold — in the app, to somebody who has
already said yes to the idea. Changing which three appear is a one-line edit
there; the prices themselves still come from `packages/core`.

Everything else stays where it is. The master dashboard lives at `/master`
inside `apps/web`, which Railway serves from the same service as the API so
the session cookie is same-origin (see "Railway" above). Moving it to Pages
would mean configuring CORS and cross-site cookies to gain nothing.

## How the names divide

| Name | Goes to | Serves |
|---|---|---|
| `safehubby.com` | Cloudflare Pages | The marketing site |
| `www.safehubby.com` | redirect to apex | — |
| `app.safehubby.com` | Railway | The app, `/master`, and `/api/*` |
| `ceo@safehubby.com` | Cloudflare Email Routing | Forwards to a real inbox |

## 1. The domain

Register it at Cloudflare Registrar, which sells at wholesale cost with no
renewal markup — about $10.44/year for a `.com`. A **free** Cloudflare account
is all this needs; the $20-25/month Pro plan is a website security and image
optimization product and buys nothing here.

Buying elsewhere works too: point that registrar's nameservers at Cloudflare.
Registering at Cloudflare means the nameservers are already right.

## 2. Pages, building from this repo

Workers & Pages -> Create -> Pages -> Connect to Git, then:

```
Build command:      pnpm install && pnpm --filter @safehubby/site build
Output directory:   apps/site/dist
```

Building from the repo rather than uploading `dist/` by hand is the whole
point of generating the site from `packages/core`: a price changes there, the
push rebuilds the site, and the two cannot drift. An uploaded folder drifts
the first time somebody forgets.

Add `safehubby.com` as a custom domain on the project. Cloudflare adds the DNS
record itself.

## 3. The app's subdomain

In Railway, add `app.safehubby.com` as a custom domain on the service. Railway
gives a CNAME target; add it in Cloudflare DNS, **proxy off (grey cloud)** —
Railway terminates its own TLS, and proxying it through Cloudflare's orange
cloud on the free plan puts a second certificate in front of a service that
already has one.

## 4. Point the code at the new names

Two values, both in `apps/site/src/content.ts`:

- `ORIGIN` — the canonical URL in `<link rel="canonical">` and the sitemap.
  Reads `SITE_ORIGIN` from the environment, so set it in the Pages project
  rather than editing the file.
- `APP_URL` — where "Start free" and "See open roles" send people.

## 5. Email

Email -> Email Routing -> add `ceo@safehubby.com`, forward it to a real inbox.
Cloudflare adds the MX records. It receives only; to *send* from the address,
add it in Gmail under Settings -> Accounts -> "Send mail as".

Nothing sends to the newsletter list from here — that is bulk mail and needs
its own provider with its own DKIM records. See `newsletter.ts`.

# The free path: Render + Neon

Zero cost, no card for the database, good enough to test on a real phone.

## 1. Free Postgres from Neon

[neon.tech](https://neon.tech) → new project → copy the connection string. The
free tier does not expire, unlike Render's own free database, which dies after
30 days and takes your data with it.

## 2. Free web service on Render

[render.com](https://render.com) → New → Web Service → connect the repo. It
picks up `render.yaml`, which sets the health check, pins one instance, and
generates the encryption key for you.

Paste the Neon connection string into `DATABASE_URL`.

## 3. Point the mobile app at it

```bash
cd apps/web
export VITE_API_URL="https://safehubby.onrender.com"
pnpm build && npx cap sync android
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

That is a real app on a real phone, talking to a real server, for **$0**.

## What free actually costs you

| | Render free | Render paid ($7/mo) | Railway (~$5/mo) |
|---|---|---|---|
| Sleeps when idle | **Yes — ~50s to wake** | No | No |
| Good enough to test | Yes | Yes | Yes |
| Good enough to rely on | **No** | Yes | Yes |

The sleep is the whole story. Someone presses SOS, the container is cold, and
nothing happens for the better part of a minute. Use free to build and
demonstrate; move to paid before you tell anyone this app will look after them.

## Free on the app stores

- **Android sideload: free.** `adb install` the APK. No store, no fee, no review.
- **Google Play: $25 once.** Cheapest real distribution there is.
- **iOS on your own device: free.** Xcode with a free Apple ID signs a build
  that runs for 7 days before it must be re-signed.
- **iOS for anyone else: $99/year.** TestFlight and the App Store both require
  the paid Developer Program. There is no free path to another person's iPhone.
