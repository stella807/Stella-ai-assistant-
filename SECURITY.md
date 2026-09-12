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

**Payment settlement.** The billing ledger, holds, proration and rail rules are
implemented and tested, but nothing settles money yet: a card-rail charge is
marked settled inline, and a store purchase is recorded from the receipt the
client hands back without verifying it with Apple or Google. Until both are
wired, a client could claim a store purchase it never made. The blast radius is
a subscription tier, not another person's data — every billing route is scoped
to the session and returns 404 on someone else's charge — but it is a real hole
and `docs/billing.md` says where the two fixes go.

**Concierge location sharing with a third party.** Booking a concierge task
sends a live location fix to an external partner network, not just to a
guardian inside Safehubby's own trust boundary — a new category of data flow
this app hadn't made before. It is scoped as tightly as the domain allows (one
fix, for one task, disclosed every time per `CONCIERGE_DISCLOSURES`), but there
is no data-processing agreement template or retention commitment from a real
partner yet; get one in place, and reviewed, before a real `CONCIERGE_API_KEY`
is ever set. See `docs/concierge.md`.

**Revolut Business as a real vendor relationship, not just an API key.**
Card-issuing in `apps/api/src/adapters/cards.ts` assumes the partner network's
assistants are onboarded as authorized cardholders on Safehubby's own Revolut
Business account — Revolut's card-issuing API has no concept of handing a card
to a third party who isn't a team member. That means real names and payment
details for partner-network assistants would live inside Safehubby's own
Revolut account before this can go live, which is its own data-handling
surface to review, on top of the API integration itself. The same account and
credentials now also send biweekly payouts (`apps/api/src/adapters/payouts.ts`)
— its counterparty-payment endpoint shape is a best-effort mapping of
Revolut's documented Business API, not verified against a live sandbox, the
same caveat as the card-issuing adapter. See `docs/concierge.md`.

**A bank account number is real financial PII, and this app now stores
one.** An assistant's payout destination is encrypted at rest
(`sealPayoutDestination`/`openPayoutDestination` in `crypto.ts`, the same
cipher location history uses) and `POST /api/assistant/payout-destination`
refuses to accept one at all without `SAFEHUBBY_ENCRYPTION_KEY` configured —
stricter than location history, which degrades gracefully to an empty trace
without a key rather than refusing outright. What is not yet built: key
rotation (there is exactly one key, forever, the same as for location
history), and any server-side validation that a routing number is a real,
assigned ABA number rather than merely nine digits — `validatePayoutDestination`
in `payroll.ts` checks shape, not registry membership. See `docs/concierge.md`.

**A customer's dispute is self-actioned, with no review step.**
`POST /api/concierge/tasks/:id/dispute` refunds a completed task and opens a
clawback against the assigned assistant (`AssistantAdjustment` in
`payroll.ts`) the moment a customer files it — there is no admin review, no
appeal path for the assistant, and no rate limit on how many disputes one
account can file. A real deployment should add a review step before the
debt is final, since as built a customer (or a compromised account) can
single-handedly put an assistant into debt with an unverifiable claim. See
"Disputes" in `docs/concierge.md`.

**Payment-method tokens are verified against the real processor, but nothing
downstream charges through one yet.** `apps/api/src/adapters/stripe.ts` and
`paypal.ts` correctly refuse to trust a client-claimed brand/last4/expiry
once real credentials are configured — they resolve the browser SDK's own
token against Stripe/PayPal's API instead. But no client-side Stripe.js or
PayPal SDK integration exists yet to produce that token in the first place
(`attachViaSdk` in `PaymentMethodCard.tsx` is a labeled gap, not a working
call), and the existing hold/capture flow (`payment.ts`) still settles
without a real processor call regardless of which one verified the method —
see "Payment settlement" above and `docs/billing.md`.

**Voice messages and identity photos stored inline in the document store,
uncapped in aggregate.** `voice-messages.ts` and `concierge.ts` cap a single
item (a 60s/~1.5MB clip, a ~1.5MB photo) but nothing caps how many accumulate
across a task or an account over time, and they are stored base64-encoded
inline in the same JSON document as everything else — the scaling problem
already flagged for the store in general, made concrete by media instead of
text. A real deployment should push both to object storage and store a URL
here, and should add a retention sweep the way `retention.ts` already does
for location history. See `docs/concierge.md`.

**The inbound concierge webhook reuses the outbound API key as its secret.**
`POST /api/concierge/webhooks/voice-message` is the only route in this API a
partner calls into rather than the reverse, and it authenticates the caller
against `CONCIERGE_API_KEY` — the same key the outbound adapter sends to
them. Reusing one secret in both directions means a leak of either exposes
both; a real deployment should mint the partner a separate, independently
rotatable webhook secret. See `docs/concierge.md`.

**A freshly provisioned employee account's temp password travels through the
partner network, in plaintext, exactly once.** `provisionAssistantCredentials`
(`routes.ts`) generates a temp password and forwards it to the partner
network's own `book()` call so their dispatch can relay it to the actual
assistant — the same tradeoff the old magic-link token made, moved onto a
password instead. It is never logged or stored in plaintext on Safehubby's
side (only its hash is kept), but it does cross that one external API call
unencrypted-at-the-application-layer (TLS covers transport), and whoever
receives that relay has, briefly, the same access the assistant does until
they sign in and change it (`mustChangePassword` forces this on first login,
but does not force it *immediately* — a relay that is read by the wrong
person before the real assistant signs in is a real, if narrow, window). A
production deployment should track and expire an unclaimed temp password
after a short window; nothing does that today. The employee session itself
is shorter-lived than a traveler's (12h vs. 30 days, `ASSISTANT_SESSION_TTL_MS`),
and login has its own rate-limit budget, separate from traveler login, so
the two can never throttle each other from the same address. See
`docs/concierge.md`.

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
