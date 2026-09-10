# Security and safety notes

Safehubby handles the two most sensitive categories a consumer app can hold:
real-time location of a named person, and a timestamped record of their alcohol
consumption. This file is the honest state of the prototype and what production
requires.

## Not yet built — blocking for production

**Key rotation.** `SAFEHUBBY_ENCRYPTION_KEY` cannot be rotated without
re-encrypting every stored trace. The ciphertext envelope is versioned (`v1.`)
so a rotation path can be added, but it does not exist yet.

**Horizontal scale.** The store keeps the database document in one JSONB row,
which is safe only at a single replica — see `docs/deploy.md`. Concurrent
writes are detected and logged, not merged.

**Rate limiting beyond auth.** Sign-up, sign-in, driver applications, code
redemption and location lookups are limited per client ip; nothing else is. The limiter is in-process, so a multi-instance deployment needs
a shared store (Redis or the platform's own limiter) or an attacker just spreads
attempts across instances. Behind a proxy, `X-Forwarded-For` is trusted as the
client ip — that is only safe when the proxy is the sole ingress and strips
client-supplied values.

**Password reset.** There is no reset flow, so a forgotten password means a lost
account. Adding one introduces the usual email-ownership attack surface and
should be designed, not improvised.

## Retention — built

Location pings expire after **7 days** (`LOCATION_RETENTION_DAYS`). The sweep
runs on boot and hourly, so a redeploy catches up whatever accrued while the
process was down; a trace is stale by the morning after, so the exact hour it
goes never matters.

The trace expires and the night does not. The drink log, the check-ins and
whether someone got home are the record a user might want to look back on; the
breadcrumb trail is operational data with a short useful life. Encryption at
rest answers "someone stole the disk" — it does not answer "why is a year of
your movements still here at all", and the only real answer to that is to not
have them.

Still outstanding: drink history has no expiry and is kept until the account is
deleted. It is far less identifying than a trace, but it should become an
opt-in with its own window.

## Encryption at rest — built

Location pings are encrypted with AES-256-GCM before they leave the process,
keyed from `SAFEHUBBY_ENCRYPTION_KEY`. A night of pings identifies a person,
their local, and who they were with, and traces are notoriously re-identifiable
even stripped of names — so they are not left to the platform's disk-level
encryption, which protects against a stolen drive and nothing else: not a leaked
backup, not a misconfigured read replica, not an operator with a psql prompt.

GCM is authenticated, so a tampered ciphertext fails to decrypt rather than
silently yielding wrong coordinates. A process without the key gets an empty
ping list, never plaintext — losing location history is the correct failure.
Everything else in the document stays readable, so the store remains
inspectable for support without exposing where anyone was.

The server **refuses to start in production** without the key or without
`DATABASE_URL`, because both misconfigurations otherwise surface as silent data
loss weeks later.

## Transport — built

Production sets `Secure` on the session cookie, and CORS is an exact-origin
allowlist. In the default Railway topology the API also serves the web app, so
the cookie is same-origin and no cross-origin credentials are involved at all.

## Authentication and authorization — built

**Accounts and sessions.** Email plus a password of at least 10 characters,
hashed with scrypt (Node's own, so there is no dependency to keep patched) and a
per-password salt, verified in constant time. Sessions are opaque 32-byte random
tokens with a 30-day expiry, sent as an `HttpOnly; SameSite=Lax` cookie and also
accepted as a bearer token. Password hashes never leave the server, even to
their owner — a test asserts no response body can contain one.

**Identity comes from the session, never the body.** Every authenticated route
resolves the actor from the cookie or bearer token before the handler runs. A
`travelerId` in a request body is ignored; a test signs in as one user, posts
another user's id, and asserts the night is created against the caller.

**Ownership is checked, and misses read as 404.** `packages/core/src/authz.ts`
holds the predicates as pure functions so they are tested directly rather than
inferred from route wiring. Another user's night, account, or grant returns 404
rather than 403, so ids cannot be probed for existence.

**Invites are claimed, not shared.** A grant is created unclaimed with a
six-character code from an unambiguous alphabet. A guardian redeems it once
while signed in, which binds the grant to exactly one account; a second person
presenting the same code is refused. So a leaked code grants no access on its
own, and a code cannot be passed around to add watchers the traveler never
approved. Reading a grant requires being the bound guardian — holding the grant
id is not access.

**Sign-up and sign-in are rate limited** per client ip, and login failures
return an identical message whether or not the account exists, with a dummy hash
verified on the unknown-account path so response time does not leak which emails
are registered.

**CORS is an allowlist.** Credentialed requests require an exact origin match
from `ALLOWED_ORIGINS`; the previous reflect-any-origin behavior would have
handed a session to any site once cookies were involved.

## Built in, and load-bearing

**Consent is structural, not a setting.** `packages/core/src/consent.ts` enforces
that only the traveler can create a grant, that every grant expires (24h ceiling),
that grants are always visible to the traveler, and that either party can revoke.
`POST /api/nights/:id/status` revokes live grants when the night ends, so sharing
stops at the door rather than running until expiry. Scope is enforced server-side
on every read in `GET /api/watch/:grantId` — a location-only grant returns no
drinks and no estimate.

**No clear-to-drive path.** `estimateBac` returns `neverAdviseDriving: true`
unconditionally and its guidance strings never resolve to a fit-to-drive message
at any band, including zero. Tests assert this. If you add a code path that
tells someone they can drive, those tests should fail; do not change them to
make it pass.

**The estimate is presented as a range.** Widmark applied to a phone-typed log
is wrong often and by a lot. The UI renders low–high with the point estimate as
a tick inside it, never a bare number, and the elimination rate is modeled at
the slow end so error falls toward "still impaired".

**Feature gating is server-side.** `requireFeature` runs at the API boundary, so
the client is not the only guard. SOS, check-ins, location sharing and drink
count are exempt by design — safety basics are never gated on payment.

**SOS requires a deliberate gesture.** Hold-to-send, not tap-to-send. Silent
mode omits the call action so a ringing phone can't expose someone.

## Abuse review

The obvious misuse of this product is coercive control: a partner compelled to
install it and share location, or tracked without knowing. The design choices
above (traveler-initiated grants only, always-visible watcher list, unilateral
revoke, automatic expiry, sharing ending at home) are the mitigations that fit
in software.

They are not sufficient on their own. A production launch should also carry:

- Onboarding that states plainly the traveler controls sharing and can stop it.
- A discoverable, one-tap "stop all sharing" that never requires the other party.
- No feature that notifies a guardian when sharing is revoked in a way that
  punishes revoking. (Today the guardian view says sharing is off and does not
  distinguish revoked from expired — keep it that way.)
- Support paths and resources for users who report being coerced into the app.

If a future feature request is "let me see him without him knowing", the answer
is no, and this file is why.
