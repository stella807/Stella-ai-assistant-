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
railway variables --set "SAFEHUBBY_ADMIN_KEY=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
railway variables --set "SAFEHUBBY_PUBLIC_URL=https://app.yourdomain.com"
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Set by the Postgres plugin. |
| `SAFEHUBBY_ENCRYPTION_KEY` | yes | 64 hex chars. Encrypts location history, and required before any assistant payout destination (bank account) can be stored at all — see `docs/concierge.md`. |
| `NODE_ENV` | yes | `production` — turns on `Secure` cookies and the boot checks. |
| `SAFEHUBBY_ADMIN_KEY` | yes, to use the owner screen | A long random secret. It is how you sign in as owner to review applications and download résumés. Generate it like the encryption key and keep it in a password manager. |
| `SAFEHUBBY_PUBLIC_URL` | recommended | Your app's address, e.g. `https://app.yourdomain.com`. Used to build invite links; without it they point at a placeholder. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | for text alerts | See `docs/text-alerts.md`. Without them nothing is texted. |
| `OWNER_ALERT_PHONE` | optional | Your number, texted when a job application comes in. |
| `BREVO_API_KEY` | to send email (free) | Sends through Brevo: cost emails, email alerts and applicant updates, from `contact@safehubby.com`. Free for 300 emails a day. Optional: `EMAIL_FROM` to send from another address on your authenticated domain, and `EMAIL_FROM_NAME` for the name people see (default "Safehubby"). Used first if set. See "Email through Brevo" below. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN`, `EMAIL_FROM` | to send email | Sends through Cloudflare Email Service: cost emails, email alerts, and applicant updates (received, reviewed, hired). See "Email through Cloudflare" below. `EMAIL_API_URL` + `EMAIL_API_KEY` is the alternative for any other sender. |
| `OWNER_ALERT_EMAIL` | optional | Your address, emailed when a job application comes in (needs the email provider settings above). |
| `STRIPE_ISSUING_CARDHOLDER` | for task cards | The company cardholder id (`ich_…`) from Stripe Issuing; task cards are issued under it. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | to take payments through PayPal | A PayPal REST app. Customers can then save a PayPal or Venmo account and are charged through it, with Stripe left off. Set `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com` while testing; it defaults to the live API. See `docs/billing.md`. |
| `CARD_ISSUER` | optional | `lithic` issues task cards through Lithic instead of Stripe Issuing. Anything else, or unset, is Stripe. |
| `LITHIC_API_KEY` | with `CARD_ISSUER=lithic` | Your Lithic API key. Uses Lithic's **sandbox** (no real money) unless `LITHIC_ENV=production`. |
| `LITHIC_ENV` | with Lithic | `production` once your Lithic card program is live. |
| `NWC_URI` | for crypto | A **receive-only** NWC code from your Bitcoin wallet. Turns on crypto balance loads through OpenReceive — see `docs/billing.md`. The server refuses a code that can also send money. |
| `LSC_URI_PRIMARY`, `LSC_URI_BACKUP` | optional, for crypto | A swap provider, so customers can pay in USDT, USDC, SOL or ETH and you still receive Bitcoin. |
| `PORT` | no | Railway injects it. |
| `WEB_ROOT` | no | Set by the Dockerfile. |
| `ALLOWED_ORIGINS` | no | Only needed if you serve the web app from a second origin. |
| `YELP_API_KEY` | no | Real venue lookup. Falls back to Google Places, then mock. |
| `GOOGLE_PLACES_API_KEY` | no | Venue lookup, the nearby-store picker for the pharmacy run, and the concierge task flow's free-text place search. See `docs/api.md` and `docs/fulfillment.md` for what these can and cannot return. |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | no | Web-build-time only, not a server variable — set before `pnpm build` in `apps/web`. Renders an embedded map for a place picked in the concierge flow. A browser-scoped, HTTP-referrer-restricted key, safe to ship in the client bundle — see `docs/concierge.md`. |

**Losing `SAFEHUBBY_ENCRYPTION_KEY` means losing every stored location trace.**
That is the intended failure — the alternative is a key the platform can read.
Store it in a password manager, not only in Railway.

## Apple Pay (subscriptions and balance)

Apple Pay goes through Stripe, so there is nothing else to run. In the Stripe
dashboard: **Settings → Payment methods → Apple Pay**, then **Add new
domain** and enter `safehubby.com` (and `www.safehubby.com` if it is used).
Stripe checks for the verification file, which the app already serves at
`/.well-known/apple-developer-merchantid-domain-association`
(`apps/web/public/.well-known/`, Stripe's standard file for every account).
Apple Pay then shows on iPhone and Safari wherever the card form appears. A
subscription saved with Apple Pay is charged each period like any card.

Apple's App Store rules generally require in-app purchase for subscriptions
bought inside an iOS app; the website is unaffected.

## Email through Brevo (free)

Brevo's free plan sends 300 emails a day from your own domain, and the server
calls its API directly.

1. Sign up at brevo.com (no card needed).
2. **Settings → Senders, Domains & Dedicated IPs → Domains → Add a domain**,
   and enter `safehubby.com`. Brevo shows the records to add: a Brevo
   verification code (TXT), DKIM, and DMARC.
3. Add them in **Cloudflare → DNS**. If the DKIM record is a CNAME, set its
   proxy to **DNS only** (grey cloud) and keep CNAME flattening off, or the
   check fails. Verification can take up to 48 hours; the domain shows green
   ticks when it is done.
4. **Settings → SMTP & API → API Keys → Generate a new API key.**
5. On Railway set `BREVO_API_KEY` to the key and deploy. Mail goes out from
   `contact@safehubby.com`; set `EMAIL_FROM` only to use a different address.
6. If Brevo asks you to confirm `contact@safehubby.com` as a sender, it
   emails a link to that address. Cloudflare's free **Email Routing**
   (Cloudflare → safehubby.com → Email) can forward `contact@` to your own
   inbox so you receive it.

If more than 300 go out in a day, Brevo refuses the rest; the reason is
written to the server log and the rest go the next day.

Which sender is used: Brevo if `BREVO_API_KEY` is set, otherwise Cloudflare,
otherwise a generic relay (`EMAIL_API_URL`). Without any, nothing is emailed.

## Email through Cloudflare

The domain is on Cloudflare, so email goes out through Cloudflare Email
Service's REST API; the server calls it directly, no Worker needed. It needs
the **Workers Paid** plan (3,000 emails a month included, then $0.35 per
1,000 at the time of writing; Email Sending is in beta).

1. In the Cloudflare dashboard, open **Email Service → Email Sending** and
   onboard `safehubby.com` as a sending domain. Add the DNS records it asks
   for (it can add them itself, since the domain is on Cloudflare). Until a
   sending domain is onboarded, Cloudflare only delivers to verified
   addresses on your account.
2. Create an API token that can send email (**My Profile → API Tokens**),
   and copy your **Account ID** from the dashboard.
3. On Railway set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN`, and
   `EMAIL_FROM` (an address on the onboarded domain, e.g.
   `hello@safehubby.com`), then deploy.

Applicant emails are written in English then Spanish, and never include a
password; new hires get their sign-in in person. Cloudflare's daily limit
starts low for new accounts and rises with good sending.

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

# The domain, and the optional marketing site

> **The plan is the full app on `safehubby.com`** — see "How the names divide"
> below. The static site described first is optional: skip it at launch, or put
> it on `info.safehubby.com` later.

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

## Put the site up today, without the domain

The site does not need `safehubby.com` to be live. A free Cloudflare account
gives every project its own address (`something.workers.dev`), and the domain
attaches to the same project later in a couple of clicks. Nothing has to be
rebuilt.

1. Create a free account at cloudflare.com. No card.
2. **Workers & Pages -> Create -> Import a repository**, pick
   `Stella-ai-assistant-`, branch `main`.
3. Build settings:
   - Build command: `pnpm install && pnpm --filter @safehubby/site build`
   - Deploy command: `npx wrangler deploy --config apps/site/wrangler.jsonc`
   - Root directory: the repository root (the site is built from
     `packages/core`, so it cannot be built from inside `apps/site`)
4. Environment variables (build time), so the page's links are right until the
   domain exists:
   - `SITE_ORIGIN` = the `workers.dev` address Cloudflare shows you, no
     trailing slash
   - `APP_URL` = where the app is running today
5. Deploy. The address works immediately, in both languages, plus `/work/` and
   `/es/trabajo/`.

When the domain is bought: add it to the project (**Settings -> Domains &
Routes**), then change `SITE_ORIGIN` to `https://safehubby.com` and redeploy so
the canonical links and the sitemap use it.

`apps/site/dist/_headers` is generated by the build and sets a strict
content-security policy, which is only safe because the page loads nothing from
anywhere else; tests hold it to that.

These dashboard steps are from Cloudflare's current layout and may be labelled
slightly differently; the build and deploy commands are the part that matters.

## What is *not* on Cloudflare

The app — API, dashboard, the signed-in screens — is a Node server holding one
Postgres-backed store that must run as exactly one instance. It does not run
on Cloudflare's free tier. Cloudflare Containers can run it, from the $5 a
month Workers Paid plan plus usage, but that is a port with its own work
(a Worker in front, a container definition, the single-instance rule) and has
not been done or tested. Until it is, the app stays where it is running, and
`APP_URL` points at it.

## How the names divide

**The full app is the website.** `safehubby.com` is served by the Railway
service — the signed-out landing page, sign-up, every signed-in screen, the
hiring form, `/master`, and `/api/*` all come from the one place, so the
session cookie stays same-origin. The static site in `apps/site` is optional
and, if you deploy it at all, goes on a different name (`info.safehubby.com`).

| Name | Goes to | Serves |
|---|---|---|
| `safehubby.com` | Railway | The app, `/master`, `/api/*` |
| `www.safehubby.com` | redirect to apex | — |
| `contact@safehubby.com` | Cloudflare Email Routing | Forwards to a real inbox |
| `info.safehubby.com` (optional) | Cloudflare | The static marketing site |

Addresses that open the app straight on a screen, so they work printed on a
flyer or typed into a bio: `safehubby.com/work` (also `/careers`, `/trabajo`,
`/es/trabajo`) opens the job application, `safehubby.com/drive` the driver
application. `?role=personal-assistant` preselects a role. The server answers
any unknown path with the app, and the app reads the path itself — see
`apps/web/src/app/entry-route.ts`.

## 1. The domain

Register it at Cloudflare Registrar, which sells at wholesale cost with no
renewal markup — about $10.44/year for a `.com`. A **free** Cloudflare account
is all this needs; the $20-25/month Pro plan is a website security and image
optimization product and buys nothing here.

## 2. Point the domain at Railway

1. Deploy the app on Railway first (the **Railway** section above) and check
   `/api/health` on its `*.up.railway.app` address.
2. Railway -> the service -> **Settings -> Networking -> Custom Domain**, add
   `safehubby.com`. Railway shows a CNAME target.
3. Cloudflare -> the domain -> **DNS -> Records**, add a `CNAME` named `@`
   (the bare domain) pointing at that target. Cloudflare flattens a CNAME at the
   bare domain automatically. **Proxy off (grey cloud)** — Railway terminates
   its own TLS, and proxying it through Cloudflare's orange cloud puts a second
   certificate in front of a service that already has one.
4. Add `www` as a second custom domain on Railway with its own CNAME, or a
   Cloudflare **Redirect Rule** from `www.safehubby.com` to `https://safehubby.com`.
5. Set `SAFEHUBBY_PUBLIC_URL=https://safehubby.com` on the service (invite and
   referral links are built from it).

Leave the `MX` and `TXT` records Email Routing added alone; they do not touch
the website.

## 3. Email

Email -> Email Routing -> add `contact@safehubby.com`, forward it to a real
inbox. Cloudflare adds the MX records. It receives only; to *send* from the
address, add it in Gmail under Settings -> Accounts -> "Send mail as".

The app's footer (Contact, Investing, Press) and its Terms/Privacy notices all
point at this one address. Add `invest@` or `press@` later and change them in
`apps/web/src/components/Footer.tsx` and `i18n.tsx`.

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
