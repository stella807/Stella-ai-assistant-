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

To deploy, see `docs/deploy.md` — one Railway service serves both the API and
the web app, backed by Railway Postgres.

Open http://localhost:5173. Create an account, then two tabs: **I'm out**
(the traveler) and **I'm watching** (the guardian). Start a night, log a few
drinks, tap "Share with someone", and read the six-character invite code to
whoever is watching — they claim it from their own account on their own device.

```bash
pnpm test         # 287 tests
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

**Crew.** Start a crew, read the join code out at the table, and everyone sees
who is getting ahead and who has gone quiet. Counts and check-in state only —
never anyone's location, which stays behind an individual share grant to a named
person. "Ahead" is measured against the rest of the table, and any member can
hide their own count without leaving.

**Pharmacy run.** Water, electrolytes and food sent to the house automatically
when the night gets away from someone. The purchase is authorized *while sober*,
with a hard spending cap, and fires once. The API refuses an authorization from
someone already impaired — see "Where we said no". A partner can also send one
by hand, since they are sober and paying.

**Plans.** A plan picker with monthly and annual pricing. Billing is not
connected in this build: no card form, no charge, and the screen says so.

**Medical escalation.** A red-flag checklist for alcohol poisoning and head
injury, the correct emergency number for wherever you are, and a script for what
to say when the dispatcher picks up — with the location and drink log already
filled in. Any single red flag routes to emergency services; it is not a score.
The panel opens itself once the estimate is in the danger range. Never
plan-gated.

**Games.** Five of them — First Worried Text, Check-In Roulette, Guess the Tab,
Last One Standing, Ride Home Race. Every one scores on checking in, pacing,
water or getting home; none score on how much anyone drank, and a test asserts
no forfeit involves drinking more. Rounds are played with your crew.

**Party supply.** Chairs, tables, catering, drinks, decorations, entertainment
and the essentials everyone forgets. Give it a headcount and it builds a cart
you can edit; rentals are quoted separately from purchases, and coverage is
reported by the thinnest category, so twelve chairs and food for forty still
says it seats twelve.

**Food, confirmed sober.** Delivery ordered at 1am is queued, not charged.
Safehubby puts the question when the estimate says you can actually answer it —
usually the next morning. Unanswered orders expire rather than lingering.

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

**No "Uber ambulance".** There is no such product. Uber Health is non-emergency
medical transport booked by healthcare organisations for appointments and
discharges, and Uber's own terms tell users to call emergency services. Shipping
a rideshare under an ambulance label would be worse than shipping nothing: a
driver has no oxygen, no airway training and no authority to treat, and the
minutes spent waiting for one are the harm. What we built instead is the
escalation above — recognise it, call the right number, know what to say. A
separate urgent-care ride exists for the not-an-emergency case, on its own route
so it can never be rendered as an emergency response, and a test asserts no ride
option is ever labelled an ambulance.

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

**No charging a drunk person's card.** "Buys you things when you're too drunk"
is a good feature with one dangerous reading. Someone past the impairment line
cannot meaningfully consent to a purchase, so the authorization has to happen
before the drinking does: you arm the pharmacy run while sober, set a cap, and
the API refuses to accept an authorization once the estimate says you are
impaired. One automatic order per night, and every order records why it was
sent.

**No confirming a purchase while impaired.** Food ordered at 1am is queued and
asked about later; a confirmation taken while the estimate says someone is
impaired is refused outright, and nothing is charged. An "are you sure?" tapped
by someone too drunk to read it is not consent, it is a formality with a charge
attached.

**No fake checkout.** The plan picker never asks for card details, because
billing is not wired up. A realistic-looking payment step for a charge that
does not exist is a lie told to the user's face.

**No selling drinking data.** "Anonymized trend data" was on the monetization
list. Location traces are notoriously re-identifiable and a bar-by-bar drinking
history is not data anyone can honestly promise to anonymize. It is not sold, and
ad targeting is not built on it.

One thing we do say, everywhere: **Safehubby never tells anyone they are fit to
drive**, at any reading, including 0.00. The estimate comes from what someone
typed into a phone while drinking. A test asserts no guidance string can ever
resolve to a clear-to-drive message.

## Before this ships

Authentication, ownership checks, claimed invites, auth rate limiting, and
AES-256-GCM encryption of location history at rest are built. `docs/deploy.md`
covers deploying to Railway. `SECURITY.md` covers what is still outstanding: a
retention window, key rotation, a shared rate-limit store for multi-instance
runs, a password reset flow, and the abuse review that any partner-location
product owes its users.
