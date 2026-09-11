# API reference

Base URL `http://localhost:8787`. JSON in, JSON out. Errors are `{ "error": string }` with a meaningful status: 400 validation or
domain refusal, 401 not signed in, 402 plan does not include the feature, 403
signed in but not permitted, 404 unknown resource **or one you may not see**,
409 conflicting state, 429 rate limited.

**Authentication.** All routes except `/api/health`, `/api/catalog`,
`/api/venues`, `/api/supplies`, `/api/supplies/stores`,
`/api/care-package/baskets` and the `/api/auth/*` endpoints require a
session. Send it as the `sh_session` cookie (set automatically by signup and
login) or as `Authorization: Bearer <token>`. Identity always comes from the
session; a `travelerId` in a request body is ignored.

## Accounts

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/signup` | `{ email, password, displayName, homeLabel? }`. Password min 10 chars. 409 if the email exists. Rate limited. |
| `POST` | `/api/auth/login` | `{ email, password }`. 401 with an identical message whether or not the account exists. Rate limited. |
| `POST` | `/api/auth/logout` | Deletes the presented session. |
| `GET` | `/api/auth/me` | `{ traveler }` or `{ traveler: null }`. Never includes a password hash. |

## Catalog and accounts

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Liveness. |
| `GET` | `/api/catalog` | Drink catalog, plans, reward catalog. |
| `GET` | `/api/travelers` | Seeded demo travelers. |
| `GET` | `/api/travelers/:travelerId` | Profile, point balance, active grants. |

## Billing

One account, one ledger — the subscription and the per-trip charges are the
same list. `docs/billing.md` explains the two settlement rails and what is not
wired yet.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/billing` | The card, the subscription, the 30-day statement and the charge history, in one response. |
| `POST` | `/api/subscription` | `{ planId, cadence?, platform? }`. Starts a trial or changes plan, prorated. Returns the same shape as `GET /api/billing` plus `charged` and `awaitingStoreReceipt`. |
| `POST` | `/api/subscription/cancel` | Keeps the plan until the period already paid for ends. 404 if there is no subscription. |
| `POST` | `/api/billing/charges/:chargeId/confirm` | `{ receipt }`. Settles a store-rail line. 400 on a card line; returns `verified: false` — the receipt is not checked with the store in this build. |
| `GET` | `/api/account/payment-method` | `{ method, live }`. Never more than brand, last four and expiry. |
| `POST` | `/api/account/payment-method` | Attach a card. Charges nothing. |
| `POST` | `/api/account/payment-method/remove` | Detach it. |

All of these require a session, and none of them return another traveler's
charges.

## A night out

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/nights` | `{ weightKg, widmarkRatio?, drinkLimit?, homeAddressLabel? }`. Owner is the signed-in user. Schedules the first check-in. |
| `GET` | `/api/nights/:nightId` | Summary: night, BAC estimate, stats, pending check-in, last ping, alerts. Sweeps missed check-ins and derives new alerts. |
| `POST` | `/api/nights/:nightId/drinks` | `{ drinkId, servings?, venueName? }`. Re-times the pending check-in. |
| `POST` | `/api/nights/:nightId/check-ins/:checkInId/answer` | `{ feelingRating?, reportedDrinkIds? }`. Schedules the next one. 409 if already answered. |
| `POST` | `/api/nights/:nightId/location` | `{ lat, lng, accuracyMeters?, venueName? }`. |
| `POST` | `/api/nights/:nightId/status` | `{ status }` — `active`, `heading-home`, `home-safe`, `ended`. Ending revokes live grants. |
| `POST` | `/api/nights/:nightId/sos` | `{ silent? }`. Never plan-gated. |
| `GET` | `/api/nights/:nightId/recovery` | Recovery plan. Requires `recovery-plan`. |

## Sharing

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/grants` | `{ scopes?, hours? }`. Returns an **unclaimed** grant carrying a six-character `inviteCode`. |
| `POST` | `/api/grants/claim` | `{ inviteCode }`. Binds the grant to the signed-in guardian. 400 if already claimed by someone else, 404 if the code is not valid. |
| `POST` | `/api/grants/:grantId/revoke` | Traveler or bound guardian. 404 for anyone else. |
| `GET` | `/api/watch/:grantId` | Guardian view, filtered by grant scope and liveness. 404 unless the caller is the bound guardian. |

Scopes: `location`, `drinks`, `check-ins`, `route`. A location-only grant
returns `drinks: []` and `bac: null`.

An unclaimed grant is readable by nobody, so a leaked invite code grants no
access on its own, and a claimed grant is bound to exactly one account.

## Services

| Method | Path | Feature required |
|---|---|---|
| `GET` | `/api/venues?lat=&lng=` | — |
| `POST` | `/api/rides/quote` | `ride-booking` |
| `POST` | `/api/rides/book` | `ride-booking` (awards 100 points) |
| `GET` | `/api/supplies` | — |
| `GET` | `/api/supplies/stores?lat=&lng=` | — |
| `POST` | `/api/supplies/order` | `supply-delivery` |
| `POST` | `/api/routes` | `safe-routes` |
| `POST` | `/api/points/redeem` | — |
| `POST` | `/api/push/devices` | — (session) |
| `POST` | `/api/push/devices/remove` | — (session) |
| `GET` | `/api/push/status` | — (session) |
| `POST` | `/api/games/worried-text` | `group-games` |
| `POST` | `/api/games/worried-text/:roundId/report` | — |
| `GET` | `/api/games/leaderboard` | — |

## Medical escalation

Never plan-gated. Safehubby cannot dispatch an ambulance and says so in the
payload; a rideshare is not emergency medical transport.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/emergency?region=US` | Red flags, the local emergency number, and the not-an-ambulance statement. Returns `emergency: null` for an unknown region rather than guessing. |
| `POST` | `/api/nights/:nightId/emergency/assess` | `{ flags?, region?, concerns? }`. Any single red flag returns `escalation: "call-emergency"` plus a dispatcher script with location and drink totals filled in. Traveler or bound guardian only. |
| `POST` | `/api/rides/urgent-care` | A normal ride to urgent care, with an explicit not-for-emergencies warning. Requires `ride-booking`. |

`GET /api/nights/:nightId` also returns `promptEmergencyCheck`, true at the
severe band or when a high estimate meets a missed check-in, so the client can
raise the checklist without waiting to be asked.

## Venue data

`GET /api/venues` resolves through Yelp Fusion, then Google Places, then the
mock, so the app runs with no keys. Set `YELP_API_KEY` or
`GOOGLE_PLACES_API_KEY` to use the real sources; `GET /api/health` reports which
one is live as `venueSource`.

Neither API returns a bar's structured drink menu — Places returns place details
and Yelp returns business details plus, on some plans, a menu URL. So the drink
list is inferred, in `packages/core/src/venue-menu.ts`, from the signals the
location APIs do return: the venue's name, its Places `primaryType` and `types`
(or Yelp categories), and its price level. Nine archetypes, most specific
first, so a place tagged `bar` + `restaurant` but named "Bourbon & Rye" reads as
a whiskey bar. Price level reorders the result without ever adding a drink the
archetype did not already offer.

This is accuracy work, not convenience: the estimate in `bac.ts` is Widmark on
grams of ethanol, so leading a brewery with the 6.8% craft pour instead of a
generic 5% beer changes the number on every round. Anything unclassified falls
back to the broad list and **says so in the UI** — an inferred menu that
presents itself as the venue's real one is how someone logs the wrong drink all
night. Yelp's terms restrict caching, so nothing venue-derived is written to
our store.

### Testing it against real bars near you

Without a key the app serves six seeded venues and says so. To search real
places, get a **Google Places API key** (Google Cloud Console → enable
*Places API (New)* → create an API key; it needs billing enabled, and Google's
free monthly credit covers ordinary testing):

```bash
GOOGLE_PLACES_API_KEY=your-key pnpm dev
curl localhost:8787/api/health      # {"ok":true,"venueSource":"google-places"}
```

`venueSource` is the check worth doing first: `mock` means the key never
reached the process, and every other symptom follows from that.

Then open the app, start a night, and **allow location when the browser
asks** — the venue search runs from the device's own fix, so refusing it
falls back to fixed coordinates and the logger says plainly that the list is
a stand-in rather than passing it off as your surroundings.

Two things to know when testing on a laptop. Browsers only hand out
geolocation on `localhost` or HTTPS, so a phone pointed at your machine's LAN
address gets nothing until you serve over TLS or tunnel it. And laptop
location comes from wifi triangulation, which can be off by a block or more —
a phone with GPS is the honest test. The list re-searches when you move
`VENUE_RESEARCH_METERS` (200m) from the last search, so walking to the next
bar refreshes the menu while a phone sitting on a table does not.

## Swapping in real providers

`packages/core/src/ports.ts` defines `RidePort`, `DeliveryPort`, `VenuePort`,
`RoutePort`, `NotificationPort`. `apps/api/src/adapters/mock-providers.ts`
implements them for development. Real Uber/Lyft, DoorDash/Instacart, and
Places/Yelp clients implement the same interfaces; nothing in the domain or the
UI changes.

Fares are always echoed from the ride provider. Safehubby does not compute
fares or driver payouts — those are set by the ride company's own pricing.
