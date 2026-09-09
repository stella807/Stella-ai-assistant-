# Security and safety notes

Safehubby handles the two most sensitive categories a consumer app can hold:
real-time location of a named person, and a timestamped record of their alcohol
consumption. This file is the honest state of the prototype and what production
requires.

## Not yet built — blocking for production

**Authentication.** There is none. `travelerId` is taken from the request body
and trusted. Anyone who can reach the API can read any night or act as any user.
Real auth (per-device tokens, session expiry, re-auth for changing sharing) is
the first thing to add.

**Encryption at rest.** Location pings and drink logs are written to
`.safehubby/db.json` in plaintext. Production needs encrypted storage, and
location history in particular should be encrypted per-user.

**Retention.** Nothing is deleted. Location traces should have a short, stated
retention window (days, not forever), with drink history retained only if the
user opts into the history feature and deletable on demand.

**Transport.** The dev server is HTTP and permissive CORS. Production is TLS
only, with an origin allowlist.

**Rate limiting.** No limits on any endpoint, including SOS.

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
