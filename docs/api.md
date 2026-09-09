# API reference

Base URL `http://localhost:8787`. JSON in, JSON out. Errors are
`{ "error": string }` with a meaningful status: 400 validation or domain
refusal, 402 plan does not include the feature, 404 unknown resource,
409 conflicting state.

**No authentication yet** — see `SECURITY.md`.

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
| `POST` | `/api/nights` | `{ travelerId, weightKg, widmarkRatio?, drinkLimit?, homeAddressLabel? }`. Schedules the first check-in. |
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
| `POST` | `/api/grants` | `{ travelerId, guardianId, createdBy, scopes?, hours? }`. `createdBy` must equal `travelerId`. |
| `POST` | `/api/grants/:grantId/revoke` | `{ revokedBy }` — traveler or guardian. |
| `GET` | `/api/watch/:grantId` | Guardian view, filtered by grant scope and liveness. |

Scopes: `location`, `drinks`, `check-ins`, `route`. A location-only grant
returns `drinks: []` and `bac: null`.

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
