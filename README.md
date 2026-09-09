# Safehubby

A safety app for the person heading out and the person waiting up. It checks in,
keeps an honest log of the night, and makes getting home the easiest thing to do.

This is a working prototype: a typed domain core, an HTTP API, and a mobile-first
web client. Third-party integrations (Uber/Lyft, DoorDash/Instacart, Places/Yelp)
sit behind ports with mock adapters, so the whole thing runs with no API keys.

## Quick start

```bash
pnpm install
pnpm dev          # API on :8787, web on :5173
```

Open http://localhost:5173. Create an account, then two tabs: **I'm out**
(the traveler) and **I'm watching** (the guardian). Start a night, log a few
drinks, tap "Share with someone", and read the six-character invite code to
whoever is watching — they claim it from their own account on their own device.

```bash
pnpm test         # 118 tests
pnpm typecheck
pnpm build
```

## What it does

**Check-ins.** Prompts on an adaptive interval — 60 minutes early on, tightening
toward 15 as drink count and estimated impairment rise, and tightening again
after a miss. Logging a drink re-times the pending check-in rather than letting
an hour run out. A missed check-in alerts whoever is watching.

**Drink logging.** Tap a drink from the current venue's menu, or the full
catalog. Everything resolves to grams of ethanol and US standard drinks, so an
IPA counts as 1.8 drinks and a shot as 1.0. Water is one tap and earns points.

**Intoxication estimate.** Widmark, decayed per drink from its own timestamp,
presented as a wide range rather than a single number. See "Where we said no".

**SOS.** Hold-to-send (a pocket tap must not fire it), with a silent mode that
withholds the call action so a phone call can't give someone away.

**Getting home.** Ride quotes and booking, safe-route suggestions that flag the
poorly lit shortcut, and hydration/food delivery to the house. Booking a ride is
the single largest point award in the app.

**Points and games.** Points for checking in, logging water, and getting home
without driving — never for drinking. Redeemable at partner venues. The
"whose partner texts first" round is included; the default forfeit is a round
of water.

**Sharing.** Consent-gated, scoped, time-boxed, revocable, and always visible.
An invite is claimed once by one signed-in account, so a leaked code grants
nobody access and cannot be passed around to add watchers.

**Accounts.** Email and password (scrypt), `HttpOnly` session cookies, rate
limited sign-in. Identity always comes from the session — a `travelerId` in a
request body is ignored.

## Layout

```
packages/core     Domain logic and ports. No React, no HTTP, no filesystem.
apps/api          Node HTTP server, JSON persistence, mock provider adapters.
apps/web          Vite + React client, mobile-first.
```

`packages/core` holds everything that decides anything: the alcohol math, the
check-in cadence, the alert ladder, consent rules, points, and plans. It is pure
and fully tested, which is why the safety-critical behavior is verifiable
without spinning up a server.

## Plans

| Plan | Monthly | Annual | What it adds |
|---|---|---|---|
| Free | — | — | Location sharing, check-ins, drink count, SOS |
| Premium Basic | $5.99 | $61.08 (15% off) | Venue menus, detailed logging, estimates, recovery plan |
| Premium Plus | $10.99 | $112.08 (15% off) | Rides, supply delivery, safe routes, history, games |
| Family | $17.99 | $183.48 (15% off) | Six seats, extended emergency contacts, group alerts |

Safety basics are never paywalled — SOS, location sharing, and check-ins are
free forever, and a test enforces it. Revenue is subscriptions, ride and
delivery referrals, and venue partnerships.

## Where we said no

Three things in the original brief are deliberately not built. Each is
documented at its call site in the code.

**No coaching on how to hide being drunk.** The brief asked for AI advice to
"minimize visible signs of drunkenness". Nothing speeds up alcohol elimination —
coffee, cold showers, and food afterward change how drunk someone *looks*, not
how drunk they *are*, and closing that gap is exactly what talks an impaired
person into the driver's seat. `recovery.ts` ships the honest version instead:
hydration, food, pacing, next-day care, a real clock, and a list of the myths.
An app built on a partner trusting the log cannot also ship a mode for defeating
that trust.

**No covert tracking.** A grant can only be created by the person being located,
always carries an expiry, is always visible to them, ends when they get home, and
can be revoked unilaterally. There is no hidden mode to add later — `consent.ts`
makes it unrepresentable, and the API enforces scope on every read. Tracking a
partner without their knowledge is stalking, and in many places a crime.

**No selling drinking data.** "Anonymized trend data" was on the monetization
list. Location traces are notoriously re-identifiable and a bar-by-bar drinking
history is not data anyone can honestly promise to anonymize. It is not sold, and
ad targeting is not built on it.

One thing we do say, everywhere: **Safehubby never tells anyone they are fit to
drive**, at any reading, including 0.00. The estimate comes from what someone
typed into a phone while drinking. A test asserts no guidance string can ever
resolve to a clear-to-drive message.

## Before this ships

Authentication, ownership checks, claimed invites, and auth rate limiting are
built. `SECURITY.md` covers what a deployment still needs: encryption of
location history at rest, a retention window, a shared rate-limit store for
multi-instance runs, a password reset flow, and the abuse review that any
partner-location product owes its users.
