# API reference

Base URL `http://localhost:8787`. JSON in, JSON out. Errors are `{ "error": string }` with a meaningful status: 400 validation or
domain refusal, 401 not signed in, 402 plan does not include the feature, 403
signed in but not permitted, 404 unknown resource **or one you may not see**,
409 conflicting state, 429 rate limited.

**Authentication.** All routes except `/api/health`, `/api/catalog`,
`/api/venues`, `/api/supplies` and the `/api/auth/*` endpoints require a
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
| `POST` | `/api/supplies/order` | `supply-delivery` |
| `POST` | `/api/routes` | `safe-routes` |
| `POST` | `/api/points/redeem` | — |
| `POST` | `/api/games/worried-text` | `group-games` |
| `POST` | `/api/games/worried-text/:roundId/report` | — |
| `GET` | `/api/games/leaderboard` | — |

## Swapping in real providers

`packages/core/src/ports.ts` defines `RidePort`, `DeliveryPort`, `VenuePort`,
`RoutePort`, `NotificationPort`. `apps/api/src/adapters/mock-providers.ts`
implements them for development. Real Uber/Lyft, DoorDash/Instacart, and
Places/Yelp clients implement the same interfaces; nothing in the domain or the
UI changes.

Fares are always echoed from the ride provider. Safehubby does not compute
fares or driver payouts — those are set by the ride company's own pricing.
