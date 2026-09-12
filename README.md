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
the web app, backed by Railway Postgres. To ship to the App Store and Play
Store, see `docs/mobile.md`.

Open http://localhost:5173. Create an account, then two tabs: **I'm out**
(the traveler) and **I'm watching** (the guardian). Start a night, log a few
drinks, tap "Share with someone", and read the six-character invite code to
whoever is watching — they claim it from their own account on their own device.

```bash
pnpm test         # 490 tests (7 Postgres tests skip without a database)
pnpm typecheck
pnpm lint
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
The menu is shaped by where you actually are: Google Places (or Yelp) gives the
venue's name, type and price level, and `venue-menu.ts` turns those into the
pours that place is likely to serve — a brewery leads with the 6.8% craft pour
rather than a generic 5% beer, which changes the estimate on every round. No
location API returns a real drink list, so the app names the guess on screen
instead of passing it off as the venue's menu.

**Dark, always.** Not a preference the app follows — it is used in a dim bar at
1am by someone several drinks in, so the ground is black regardless of the
phone's setting, the type is pure white at full contrast, and the tap targets
and type scale run a notch larger than a sober-user app would need.

**Intoxication estimate.** Widmark, decayed per drink from its own timestamp,
presented as a wide range rather than a single number. See "Where we said no".

**SOS.** Hold-to-send (a pocket tap must not fire it), with a silent mode that
withholds the call action so a phone call can't give someone away.

**Getting home.** With Uber Guest Trips configured, Safehubby quotes real fares
from Uber, books the ride itself, and the car comes to you — cancellable if
plans change. Without it, one tap opens Uber or Lyft with the destination
filled in. The app shows which of the two it is doing and never claims a
booking it did not make — see `docs/fulfillment.md`.

**Secure transport.** Where a licensed operator covers your location, a ride
with a protection professional at the wheel. Disclosed and acknowledged before
booking, billed per trip, never bundled.

**Crew.** Start a crew, read the join code out at the table, and everyone sees
who is getting ahead and who has gone quiet. Counts and check-in state only —
never anyone's location, which stays behind an individual share grant to a named
person. "Ahead" is measured against the rest of the table, and any member can
hide their own count without leaving.

**Pharmacy run.** Water, electrolytes and food, lined up automatically when the
night gets away from someone. With Instacart configured the basket is built for
real and waiting at checkout — one tap, no typing at 1am. The authorization
happens *while sober*, with a hard cap, and the API refuses one from someone
already impaired; payment happens in the customer's own account, so Safehubby
never charges a card on a drunk person's say-so. Walmart is the tracked
fallback. Every basket is a fixed, curated list — real meals, never a
free-form cart, and never alcohol; Family unlocks a wider menu (pizza, burgers,
a takeout bowl, brunch) on top of the base set everyone gets. With
`GOOGLE_PLACES_API_KEY` configured, a real nearby store can be named as a
preference on the order — Google Maps can show you a real Walgreens three
blocks away, but it has no idea what Instacart's internal id for that
Walgreens is, so the choice is passed along as a note the shopper sees, not a
guaranteed reroute. See `docs/fulfillment.md`.

**Alerts on the watcher's phone.** A guardian sitting up with the app closed
is the normal case, so alerts push to their phone: a missed check-in, a fast
pace, an SOS. Entitlement is re-read from the live grant every time, so
revoking sharing stops the buzzing immediately rather than whenever some
subscription list catches up, and nothing on a lock screen ever carries a
position — the buzz says go look, the map stays behind the lock. Needs a push
sender configured; without one the app says plainly that nothing will reach
you instead of implying it will. See `docs/push.md`.

**Your data.** Account → Download my data exports everything held about you,
location history included. Account → Delete my account is real erasure, not
deactivation: it takes the traveler's nights, traces, sessions and sharing with
it, while leaving crews and shared game rounds standing for everyone else.

**Payments.** One screen for everything Safehubby charges: the plan, the card
on file, and every ride, secure-transport trip and pharmacy run, adding up to
one total for the last 30 days. Plans start on a 14-day trial with nothing
taken, changes mid-period are prorated rather than charged twice, and
cancelling keeps the plan on until the period already paid for runs out.

The one thing that cannot be single is the *settlement*: Apple and Google
require a subscription bought inside their app to go through their billing, and
forbid a delivery or a ride from going through it. So a line's rail is picked
per charge, the screen says so when an account has actually used both, and
everything else — the statement, the history, the total — is one account. No
card processor or receipt verification is wired in yet; `docs/billing.md` says
exactly what is and is not connected.

**Drive for Safehubby.** A public application form, reachable before signing
in, for people who want to drive directly for Safehubby rather than through
Uber or Instacart. Standard and secure-transport tiers, admin-reviewed. See
`docs/driving.md`.

**Personal concierge.** Send a vetted, insured partner-network professional
for one bounded, in-person task — grab something, sit with a friend, check on
someone — at a spend cap you set that is never exceeded. Deliberately a
booking layer on an already-vetted partner, the same shape as secure
transport, rather than an in-house hiring marketplace: Safehubby vets and
employs nobody here, and there's no payroll baked into the price. The
assistant pays with a single-use, spend-capped virtual card issued through
Revolut Business — never the subscriber's own card, and never a same-night
bank debit, which is too slow to fund one. On every paid tier, not just
Family — Premium included — and every paid tier's price reflects that: not for
a salary, but for the same category of standing cost that funds secure
transport — the partner-network retainer and keeping the card-issuing balance
funded. Browse the partner network's roster and pick a specific assistant
rather than leave it to their dispatch — each profile shows how many
customers they're comfortable handling at once (1-3, their own stated
comfort level, not a number Safehubby sets). Once booked, an in-app voice
message thread with that assistant opens in a popup — async clips, not a
live call, so an assistant mid-task is never expected to have a hand free
for a ringing phone. A separate, published service fee (published rate card,
$9-$18 by task type, discounted to $5 for a quick, single-purpose task —
grabbing one named thing or running one errand, capped at a lower $50 spend
to keep it honest) is what actually pays the assistant for their time — the
spend cap only ever reimburses what they buy, the same way a ride fare passes
through to a driver rather than being their wage. The customer sees that fee
itemized before they book — spend cap, service fee, and the total that will
actually be held — the same real number the assistant's own portal shows.
Each of you takes a selfie, shared with the
other, so you can each confirm who you're meeting. Optionally name a specific
real place — a Google Places search, with an embedded map when a browser Maps
key is configured — rather than leave it to however the note happens to spell
it. The assistant's own side is a distinct employee portal at `/employee`
— its own username/password sign-in and its own session cookie, entirely
separate from a Safehubby customer account — where they see everything
assigned to them, a transparent pay-rate table (per task, per hour, and what
steady work could add up to per year, at a cadence they choose), reply by
voice, take their own selfie, and mark a task done or decline it. See
`docs/concierge.md`.

**Medical escalation.** A red-flag checklist for alcohol poisoning and head
injury, the correct emergency number for wherever you are, and a script for what
to say when the dispatcher picks up — with the location and drink log already
filled in. Any single red flag routes to emergency services; it is not a score.
The panel opens itself once the estimate is in the danger range. Never
plan-gated.

**Games.** Seven of them — First Worried Text, Check-In Roulette, Guess the Tab,
Last One Standing, Ride Home Race, Open Mic, Roll for It. Every one scores on
checking in, pacing, water or getting home; none score on how much anyone
drank, and a test asserts no forfeit involves drinking more. Rounds are played
with your crew.

**Party supply** *(built, held for a later release).* Chairs, tables, catering,
drinks, decorations, entertainment and essentials. Behind the `party-supply`
flag in `packages/core/src/features.ts` — turn it on to ship it.

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
| Premium | $17.99 | $183.88 (15% off) | Venue menus, detailed logging, estimates, recovery plan, personal concierge |
| Premium Plus | $33.99 | $346.88 (15% off) | **Automatic** rides and delivery, safe routes, history, games, personal concierge |
| Family | $69.99 | $713.88 (15% off) | Six seats, extended contacts, secure transport, and the full pharmacy-run menu |

Automatic fulfilment means Safehubby books the provider on the rider's behalf,
backed by a pre-authorization hold on the rider's own card so nothing is ever
fronted. The prices are not set by that risk anymore, though — they fund a
standing contract with a licensed, insured security firm for secure transport
(armed-driver liability coverage isn't bought per trip; see `docs/driving.md`)
plus a real profit margin. Rides and deliveries are still passed through at
cost on top of the subscription; bundling them would mean capping how often
someone can get home safely. See `docs/fulfillment.md`.

Every plan starts on a 14-day trial with nothing charged, switching mid-period
bills only the difference, and cancelling keeps the plan running until the
period already paid for ends. Safety basics are never paywalled — SOS, location
sharing, and check-ins are free forever, and a test enforces it. A declined card
does not take them away either. Revenue is subscriptions, ride and
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

**No invented fares, and no charge we cannot make.** Uber and Lyft retired
their public ride APIs for third-party developers; DoorDash and Walgreens have
no consumer ordering API at all. So the app cannot quote a fare, book a ride, or
place an order without a commercial partnership. It hands off to the provider's
own app instead. A made-up price on the screen where someone is deciding whether
they can afford *not* to drive is the worst possible place to be wrong, and a
pharmacy run that promises to charge a card it cannot charge is the second
worst. The relevant flags are off in `features.ts` until a partnership exists.

**No fake checkout.** The billing ledger is real — proration, trials,
renewals, holds and the rail rules are all implemented and tested — but no card
processor and no store receipt verification sit behind it yet. Rather than
mime a convincing checkout, the code is explicit at every seam: adding a card
charges nothing, a store purchase comes back `verified: false`, and the hourly
sweep refuses to invent an App Store renewal it cannot observe, counting those
as pending instead. `docs/billing.md` lists every gap. A realistic-looking
payment step for a charge that does not exist is a lie told to the user's face.

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
