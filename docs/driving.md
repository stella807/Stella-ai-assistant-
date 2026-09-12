# Driving for Safehubby

A public application form for people who want to drive for Safehubby directly,
as distinct from the third-party providers covered in `docs/fulfillment.md`
(Uber Guest Trips, Instacart). Nobody is dispatched from this list yet — there
is no live driver pool — but the intake and review workflow exists so that
whenever Safehubby does staff its own drivers, most of `secure-transport`
above it, the vetting pipeline is already built and tested rather than bolted
on under pressure.

## Pay: its own scale, separate from concierge

`packages/core/src/driver-pay.ts` defines `DRIVER_RATE_CARD` — a base fare
plus a per-mile and per-minute rate, set independently for each `DriverTier`.
This is not the same rate card personal-concierge assistants are paid from
(`CONCIERGE_SERVICE_FEE_CENTS` in `concierge.ts`), and deliberately shaped
differently: a concierge task is a bounded, discrete job priced flat per
category and explicitly never metered by the minute, while driving is
inherently variable-length work, so it is priced the way real per-trip
driving already is — a base, plus what the trip actually cost in distance
and time. `secure-transport` is not a multiplier on `standard`; it has its
own, higher numbers across the board, for the same reason that tier's
customer-facing fare is "substantially higher" — a licensed
protective-services driver's insurance and training are real, ongoing
overhead standard driving doesn't carry.

The rate is disclosed on the application screen itself
(`DriveSignupScreen.tsx`), with a worked example for a 5-mile, 15-minute
trip, the same "show the real number before anyone commits" ethic the
concierge assistant portal's pay-rate table already follows. There is no
payroll wiring behind it yet, on purpose: nobody is dispatched from this
list today (see below), so there is nothing for a payout run to pay against.
Add one — likely mirroring `payroll.ts`'s biweekly sweep — once trips are
actually being assigned.

## Two tiers

`packages/core/src/driver-applications.ts` defines `DriverTier` as `"standard"`
or `"secure-transport"`. Standard is an ordinary driver application: name,
contact details, a driver's licence that hasn't expired, years driving, and a
vehicle. Secure-transport is the same form plus a protective-services licence
number, the state that issued it, and years of protective experience —
required at submission, not collected later, because an unlicensed applicant
should never make it into the review queue for an armed-driver tier.

Both require background-check consent to submit. `submitApplication` validates
everything server-side (email format, phone digit count, a vehicle year within
a sane range, a licence expiry that is actually in the future) so a bad
application never reaches a reviewer's queue in the first place.

## Submitting

The form is reachable from the "Drive for Safehubby →" link on the sign-in
screen, before anyone logs in — driving for the app and riding in it are
different relationships, and requiring a rider account to apply would be a
pointless wall.

```bash
curl -X POST https://<your-app>/api/drivers/apply \
  -H 'content-type: application/json' \
  -d '{
    "tier": "standard",
    "fullName": "...", "email": "...", "phone": "...",
    "city": "...", "state": "...",
    "licenseNumber": "...", "licenseExpiry": "2027-01-01",
    "yearsDriving": 3,
    "vehicle": { "make": "Toyota", "model": "Camry", "year": 2019, "licensePlate": "..." },
    "backgroundCheckConsent": true
  }'
```

Submissions are rate limited to 10 per hour per connection
(`ctx.limiters.applications`), since this endpoint takes no session and is the
only unauthenticated `POST` that writes to the store. An applicant can withdraw
their own application with `POST /api/drivers/applications/:id/withdraw`,
identified by id plus the email they applied with — there is no login to prove
ownership otherwise.

## Reviewing

There is no per-account role system in this build, so review is gated by a
shared secret instead of a real admin login: set `SAFEHUBBY_ADMIN_KEY` and send
it as `x-admin-key` on `GET /api/drivers/applications` and
`POST /api/drivers/applications/:id/review`. If the env var isn't set, both
routes refuse with a `503` rather than silently allowing anyone through, and a
wrong or missing key is a `401`.

```bash
railway variables --set "SAFEHUBBY_ADMIN_KEY=..."

curl https://<your-app>/api/drivers/applications -H 'x-admin-key: ...'

curl -X POST https://<your-app>/api/drivers/applications/<id>/review \
  -H 'x-admin-key: ...' -H 'content-type: application/json' \
  -d '{ "status": "under-review" }'
```

`reviewApplication` enforces one workflow rule: an application cannot jump
straight from `submitted` to `approved`. It has to pass through
`under-review` first, so an approval always reflects a human having actually
looked at it rather than a reviewer double-clicking through a list. A
`withdrawn` application can't be reviewed at all.

**Before this stores real applicant PII in production**, replace the shared
secret with a real authenticated admin role — a header that never expires and
is shared over Slack is fine for a build with no live drivers and not fine for
one collecting licence numbers and background-check consent from the public.
