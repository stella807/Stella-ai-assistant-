# Push to the guardian

Local notifications already cover the traveler's own check-in reminders — they
fire with no signal, which is where a missed check-in matters most. This is the
other half: **the guardian's phone, with the app closed.**

Until this existed, a missed check-in was a row in a database that nobody read
until morning. The person waiting up is the whole second half of this product,
and the app could not reach them.

## What decides who gets told

`packages/core/src/push.ts`, and it is pure, so all of it is tested without a
network.

**A grant is a consent boundary, not a subscription list.** Entitlement is read
from the live grants at send time — nothing is cached — so a revoked grant, an
expired one, or an unclaimed invite stops the buzzing on the next alert rather
than whenever some list is next reconciled. A notification channel that
outlives the consent that created it is the covert-tracking failure this app
refuses everywhere else, wearing a different hat.

| Alert | Needs scope |
|---|---|
| Missed check-in | `check-ins` |
| Drink limit reached, fast pace | `drinks` |
| SOS, danger-band estimate | none — any live grant |
| Heading home, home safe | none |

Urgent alerts ignore the table on purpose. Someone holding a live grant of any
kind, whose person has just triggered an SOS, gets told; rationing the one
message the app exists to deliver because they were granted the wrong category
would be indefensible.

**Severity sets how hard it pushes through** — `passive`, `active`,
`time-sensitive`. Never `critical`: that level breaks Do Not Disturb and the
volume switch, needs an entitlement Apple grants case by case, and claiming it
without one does not fail loudly. The notification just quietly degrades, which
is the worst possible outcome for the one message that mattered.

**Nothing on a lock screen carries a position.** A push body is readable by
whoever is holding the phone, without unlocking it, and on this app that is a
specific hazard rather than a general one. `redactLocation` strips coordinate
pairs out of anything bound for a notification. No alert message interpolates a
position today; this is there so that the day one does, it does not become a
lock-screen broadcast of where someone is. The buzz says go look; the map is
behind the lock.

## Configuring a sender

```bash
railway variables \
  --set "PUSH_API_URL=https://..." \
  --set "PUSH_API_KEY=..."
```

`GET /api/fulfillment/status` reports `push` alongside the other providers, and
`GET /api/push/status` tells a signed-in guardian whether *they* would actually
be reached. With nothing configured the adapter sends nothing and logs
`push not configured — N notification(s) not sent`, and the guardian's own
screen says plainly that nothing will reach them. It never reports a delivery
it did not make.

**Why provider-agnostic.** The obvious target is Firebase Cloud Messaging,
which reaches both Android and iOS through its APNs bridge and so keeps this to
one integration — but FCM's HTTP v1 API authenticates with a short-lived OAuth2
access token minted from a service-account key, and its legacy static server key
was switched off in 2024. Rather than ship an unverifiable JWT-signing flow
against an endpoint this has never run against, the adapter posts a documented
body to whatever `PUSH_API_URL` names, with `PUSH_API_KEY` as a bearer token.
Point it at a relay that holds the service-account key and mints the token, or
at any provider that takes a bearer credential.

The body, from `pushPayload` in `apps/api/src/adapters/push.ts`:

```json
{
  "messages": [{
    "token": "...",
    "platform": "ios",
    "title": "Sam",
    "body": "A check-in was missed.",
    "interruption_level": "time-sensitive",
    "data": { "alertId": "...", "nightId": "..." }
  }]
}
```

Mapping that onto a specific provider is one function. Verify it against their
docs before launch — the same caveat as every other adapter here.

## Registering a device

`POST /api/push/devices` with `{ token, platform }`, from
`apps/web/src/native/push.ts`. Re-registering replaces rather than
accumulating, because clients register on every launch and providers rotate
tokens — otherwise a guardian who has opened the app fifty times gets fifty
copies of every alert.

## What is still missing

- **The native side needs the accounts.** Real tokens need APNs (Apple
  Developer Program, $99/year) and/or FCM. The plumbing is built and the
  registration call works; it has not been run against a real APNs token.
- **Web push is not built.** It needs a service worker and VAPID keys, a
  separate integration. The browser build reports `unsupported` and tells the
  guardian to keep the tab open rather than implying it will wake them.
- **No retry.** A send that fails is logged and dropped. The alert is still
  stored and still shows on the guardian's screen, so nothing is lost — but a
  phone that was off during an SOS does not get told when it comes back.
