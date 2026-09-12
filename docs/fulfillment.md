# Making it automatic

"Automatic" means Safehubby books the ride and dispatches the delivery itself,
with no hand-off and no app-switching. That is possible — through the
**business** APIs, not the consumer ones.

Every adapter has three states, and the state is visible in the app rather than
hidden: `automatic` when credentials are present, `handoff` when they are not,
`unavailable` where the provider does not operate. Nothing ever claims a
booking it did not make. A user who believes a car is coming and is wrong is
worse off than one who knows they have to tap twice.

Check what is live at any time:

```bash
curl -b cookies https://<your-app>/api/fulfillment/status
```

## 1. Rides — Uber Guest Trips

The consumer Ride Request API is closed. **Guest Trips** is not, and it is
exactly the shape this app needs: it requests rides *for people who do not have
an Uber account*, which is the whole situation — the person getting the ride is
the one who cannot be trusted to arrange it right now.

### Connecting it

1. **Create a developer app** at
   [developer.uber.com](https://developer.uber.com/dashboard). You need an Uber
   account; the dashboard is where apps, credentials and scopes live.
2. **Request the `guests.trips` scope.** This is the gate. It is not granted by
   ticking a box — expect to describe the use case, your volume, and how riders
   are identified. Say plainly that riders are impaired adults being sent home
   by someone who is not; it is a sympathetic case and a real one.
3. **Get an OAuth token** for the app, and note your organisation id.
4. **Start in the sandbox.** `UBER_ENV=sandbox` points at
   `sandbox-api.uber.com`, so you can exercise the whole flow without summoning
   real cars to real addresses. Do not skip this — the first live call of a ride
   API should never be a real person at 1am.

```bash
railway variables \
  --set "UBER_BUSINESS_TOKEN=..." \
  --set "UBER_BUSINESS_ORG_ID=..." \
  --set "UBER_ENV=sandbox"          # drop this to go live
```

### What it gives you

| Call | Endpoint | Used for |
|---|---|---|
| Estimate | `POST /v1/guests/trips/estimates` | Real fares in the ride picker |
| Request | `POST /v1/guests/trips` | Booking the trip |
| Retrieve | `GET /v1/guests/trips/{id}` | Status and driver details |
| Cancel | `DELETE /v1/guests/trips/{id}` | Plans change; don't leave a car waiting |

Base URLs are `https://api.uber.com/v1/guests/` and
`https://sandbox-api.uber.com/v1/guests/`. Default rate limit is **200
requests per hour per endpoint**, raisable on request — worth asking for early
if you expect Friday-night spikes, since that is exactly when it matters.

**Fares come from Uber's estimates endpoint.** This is why the ride picker
shows prices again: they are Uber's numbers, not ours. Safehubby never computes
a fare or a driver payout.

**You are billed for the ride, so you have to bill the user.** That float —
plus chargeback exposure and a support cost on every trip that goes wrong — is
the reason Premium Plus costs what it does.

### If the request body differs from what we mapped

The docs site renders its schema in JavaScript and the exact field names for
`POST /trips` could not be read from the page, so the body in
`apps/api/src/adapters/fulfillment.ts` is built from the documented shape.
Verify it against Uber's Postman collection before going live. The mapping is
in one function; correcting it is a few lines.

## 2. Supplies — Instacart, with Walmart as the fallback

**Instacart is the one to set up.** It is the only provider here with a
self-serve key and a real cart-building API, and it already has the stores, the
shoppers and the checkout — so Safehubby does not have to become a merchant or
hold stock.

The **Shopping Lists API** takes our basket as line items and returns a link
that opens Instacart with everything already in the cart. The customer taps once
to check out. That is the automatic part that matters: the basket is assembled
by the app rather than typed by someone at 1am. Payment still happens in their
own Instacart account, which keeps the consent rule from `care-package.ts`
intact — Safehubby prepares, the customer confirms, and no card of theirs is
ever charged by us.

```bash
# Self-serve at docs.instacart.com — no partnership call required.
railway variables --set "INSTACART_API_KEY=..."
railway variables --set "PUBLIC_APP_URL=https://<your-app>.up.railway.app"
```

`PUBLIC_APP_URL` is the link-back Instacart shows to bring people home again.

### Picking a real, nearby store

`GET /api/supplies/stores` returns real, named stores near a location —
Google Places, the same key and request shape `apps/api/src/adapters/venues.ts`
already uses for bars, aimed at `grocery_store`, `supermarket`, `pharmacy` and
`convenience_store` instead (`apps/api/src/adapters/grocery.ts`). No key means
a small fixed mock list instead, same as venues without one.

```bash
railway variables --set "GOOGLE_PLACES_API_KEY=..."
```

**This names a store; it does not route the order to it.** Google Places has
no idea what Instacart's internal id for a given store is — that mapping only
exists in Instacart's own Retailers endpoint, keyed by postal code, which is a
separate integration this app does not have. So a chosen store is passed to
`POST /api/supplies/order` as `store: { name, address }` and becomes a
free-text note on the Instacart Shopping List (`buildStoreNote`, folded into
the existing `instructions` field) — a real preference the shopper sees and
can act on, not a guarantee this app can back. Claiming otherwise would be the
same mistake as inventing a fare: a promise made on a screen that the backend
cannot actually keep.

### Walmart

Walmart publishes **no consumer ordering API**, and its terms forbid scraping
the catalogue. Two things are available:

- **Content Provider (affiliate) API** — product data and tracked links that
  earn commission. Self-serve-ish, needs approval as a content provider. This
  is a real revenue line, and it replaces the ride commission that turned out
  not to exist.
- **AddToCart proxy** — can add items to a Walmart cart, but needs approval and
  "a sound business case".

```bash
railway variables --set "WALMART_PUBLISHER_ID=..."   # from the affiliate programme
```

Without it the app still links to Walmart, just untracked — and says so in the
response (`tracked: false`) rather than implying a commission that is not being
earned.

### Couriers (only if you hold stock)

`uberDirect` and `doordashDrive` remain implemented for the day Safehubby
stocks its own baskets. Both move **a merchant's own goods**, so they need a
supplier agreement plus `FULFILLMENT_PICKUP_ADDRESS`. Instacart is tried first;
these are for later.

### If Instacart's schema differs from the docs

The request and response are mapped in one place in
`apps/api/src/adapters/grocery.ts`, built from the documented Shopping Lists
shape. It has not been run against a live key here, so verify these before
launch — the fix is a few lines, not a rewrite:

| | Expected |
|---|---|
| Endpoint | `POST /idp/v1/products/products_link` |
| Auth | `Authorization: Bearer <INSTACART_API_KEY>` |
| Request | `{ title, link_type: "shopping_list", expires_in, line_items: [{ name, quantity, unit, display_text }], landing_page_configuration }` |
| Response | `{ products_link_url }` |

## 3. Secure transport

A ride whose driver is a licensed protection professional. Kept as its own port
rather than another row in the ride list, because it is a different product with
different law behind it.

```bash
railway variables \\
  --set "SECURE_TRANSPORT_PROVIDER=Blackwolf" \\
  --set "SECURE_TRANSPORT_API_BASE=https://..." \\
  --set "SECURE_TRANSPORT_API_KEY=..."
```

**The adapter is provider-agnostic on purpose.** Blackwolf is the intended
provider, but I could not verify that they publish a partner API, so nothing is
written against a guessed endpoint shape. Point `SECURE_TRANSPORT_API_BASE` at
whatever they — or another licensed operator — actually give you.

The adapter expects three endpoints. If theirs differ, the mapping in
`apps/api/src/adapters/fulfillment.ts` is a small edit rather than a rewrite:

| Call | Expected | Returns |
|---|---|---|
| Coverage | `GET /coverage?lat=&lng=` | `{ "covered": true }` |
| Quote | `POST /quotes` | `{ "fare_cents", "currency", "eta_minutes" }` |
| Book | `POST /rides` | `{ "id", "fare_cents", "eta_minutes", "tracking_url", "driver" }` |

### Things to settle before switching this on

**Coverage is checked before the option is ever shown.** Armed protective
service is licensed state by state in the US. Licence classes differ,
reciprocity is patchy, and an operator legal in one state may be committing a
felony in the next. The adapter fails closed: an unreachable provider means not
covered, because offering a ride that cannot legally arrive is worse than
offering nothing — someone stops looking for another way home.

**The passenger is told before they book.** The disclosures are shown and must
be acknowledged; the API rejects a booking without it. Someone who did not
realise their driver is armed is in a situation they did not consent to, and
that is not a footnote.

**Insurance and liability are yours, not the app's.** Dispatching armed
personnel to a member of the public carries exposure that ordinary rideshare
does not. Get this in front of a lawyer and an insurer before it goes live, not
after.

**It is not bundled into a subscription.** A protective-service trip costs
multiples of a normal ride. Folding it into a monthly price would mean either
rationing it — rationing the safest way home is indefensible on this product —
or charging everyone for what few will use. It is billed per trip at the
provider's rate, and reachable on Premium Plus and Family.

**App Store framing.** Do not describe this as security, protection, or an
emergency service in the store listing; describe it as transport with a licensed
professional driver. Apple's 1.4.1 scrutiny applies to anything that reads as a
safety guarantee, and the app already states plainly that it cannot dispatch an
ambulance.

## 4. Personal concierge

A vetted, insured partner-network professional sent to do one bounded,
in-person task — grab something from a named place, sit with a friend who
should not be left alone, or check on someone in person. See
`packages/core/src/concierge.ts` for the full reasoning; the short version is
in `docs/concierge.md`.

```bash
railway variables \\
  --set "CONCIERGE_PROVIDER=Nearby Aide" \\
  --set "CONCIERGE_API_BASE=https://..." \\
  --set "CONCIERGE_API_KEY=..."
```

Same shape as secure transport, deliberately: coverage checked before the
option is offered, a quote before booking, and the adapter is provider-agnostic
because no partner API was verified to write this against.

| Call | Expected | Returns |
|---|---|---|
| Coverage | `GET /coverage?lat=&lng=` | `{ "covered": true }` |
| Quote | `POST /quotes` | `{ "eta_minutes" }` |
| Book | `POST /tasks` | `{ "id", "eta_minutes", "tracking_url", "assistant" }` |

**This is a booking layer on a partner, not a hiring marketplace.** Safehubby
employs nobody here and runs no background checks of its own. An open "hire a
stranger" tab would put Safehubby in the business of vetting people who show
up to someone's door at 1am, with none of the employment-law, insurance, or
criminal-background infrastructure that requires — see `docs/concierge.md` for
why that was ruled out rather than built partway.

**The spend cap is exact, not padded.** `authorizeExactHold` in `payment.ts`
holds precisely what the subscriber set, unlike the 25% buffer on a ride fare
estimate. The person spending it is a stranger; the cap is a promise made to
the subscriber, and padding it would break that promise by design.

**Every paid tier can reach it — Premium included, not just Family — and
every paid tier's price absorbs a share of what that costs.** It started as a
Family-only perk, priced in only there; it's now on `BASIC_FEATURES`, so
Premium and Premium Plus both went up too. A task's own cost is still capped
per task, not open-ended like a ride fare — that part hasn't changed. What
moved is the partner-network retainer and keeping the Revolut balance funded
that issues each task's card (below), both standing costs in the same
category as secure transport's insurance contract, now spread across every
paying subscriber rather than just Family. See `billing.ts` and
`docs/concierge.md`.

**Paying the assistant is a card issued per task, through Revolut Business —
not the subscriber's own card, and not their bank account directly.** A
direct bank debit was the original idea; it was replaced with a
pre-authorization hold on the card already on file (settles same-night, ACH
does not) plus a single-use, spend-capped virtual card handed to the assistant
(`apps/api/src/adapters/cards.ts`). Full details, including the real
constraint that Revolut's card-issuing API is scoped to your own team members
rather than arbitrary third parties, are in `docs/concierge.md`.

## The pre-authorization hold, and why it didn't keep prices down

`packages/core/src/payment.ts` adds a **pre-authorization hold** in front of
every automatic booking. Before `POST /api/rides/book` or
`POST /api/rides/secure` calls the provider, the API places a hold on the
rider's card for the fare estimate plus a 25% buffer (`HOLD_BUFFER`), and only
then makes the booking call. If the booking fails, the hold is released and
nothing is ever charged. If it succeeds, the hold is captured for the actual
fare, which can be less than the estimate but never more — `captureHold` throws
if a caller tries to take more than was held. A hold that outlives
`HOLD_TTL_HOURS` (24) without being captured or released is swept back to
`released` rather than left open against the card indefinitely.

This is why `GET /api/account/payment-method` and the card form in the Account
screen exist: a rider adds a card once, and every automatic booking after that
reserves money on *their* card before Safehubby spends anything, rather than
Safehubby fronting it. `POST /api/rides/book` and `POST /api/rides/secure`
both call `requirePaymentMethod` first and return a `402` with a plain-language
explanation if there's no live card on file; the ride quote also reports
`needsPaymentMethod` so the UI can ask for a card before someone taps "book" and
hits a wall.

The hold removes the float/bad-debt risk from automatic booking, full stop —
that part is real and stays. But the subscription prices went back up anyway,
for a reason the hold does not touch: **secure transport needs an insured
driver, and that insurance is not cheap.** An armed driver's liability,
commercial-livery and E&O coverage is not something bought piecemeal per trip
or per freelance contractor — see `docs/driving.md` — it comes from a standing
contract with an already-licensed, already-insured security firm, and that
contract costs money every month whether or not a given subscriber books a
trip that month. The higher prices below fund that fixed cost across the
subscriber base, plus an actual profit margin, rather than pricing at cost.

## The extended pharmacy-run menu is a paid perk, not a free-for-all cart

`packages/core/src/care-package.ts` gates part of its basket catalog behind
the `extended-menu` feature, which Premium Plus and Family have. Free and
Premium still get the original four baskets (hydration, morning-after,
a quick bite, a hot meal); the top two tiers additionally get four more
real-meal options — pizza, a burger, a takeout bowl, brunch — priced and sourced like
actual takeout rather than a snack basket. `GET /api/care-package/baskets`
returns every basket with a `locked` flag computed from the signed-in
account's plan, and `POST /.../authorize` and `POST /.../send` both re-check
`extended-menu` server-side (`requireBasketAccess` in `apps/api/src/routes.ts`)
so the UI's lock icon is a courtesy, not the only guard.

Two things this deliberately does **not** do, no matter how the tier is
priced: it never becomes a free-text or open cart — every basket is still a
fixed, curated item list decided ahead of time — and it never includes
alcohol. Both baskets and the automatic trigger that fires them exist because
someone is already impaired; delivering more alcohol to that person at that
moment is the one thing this feature can never be extended to do, regardless
of what plan someone is willing to pay for.

## What the pricing assumes

| Plan | Monthly | Annual | Automatic? |
|---|---|---|---|
| Free | — | — | No |
| Premium | $17.99 | $183.88 | No |
| Premium Plus | $33.99 | $346.88 | Everything — rides, delivery, secure transport, the full pharmacy-run menu |
| Family | $69.99 | $713.88 | The same everything, for six people instead of two |

Rides and deliveries are **passed through at the provider's price** on top of
the subscription. Bundling them would mean capping how often someone can get
home safely, which is not a cap this product should have.
