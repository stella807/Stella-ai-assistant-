# The pre-launch budget

What it costs to stand up the roster before a single subscription is charged.

The model is `packages/core/src/staffing.ts`, and every figure below is
computed from it rather than typed here — `GET /api/admin/budget` returns the
same numbers against the people actually hired so far, so the plan can be
checked against reality instead of against itself.

## The shape of the window

The launch window (`LAUNCH_WINDOW_START` .. `SERVICE_LIVE_AT`, currently
1 Oct – 1 Dec 2026) is a **two-month run-up with staffing cost and no
subscription revenue**:

- Customers can sign up, and they get the launch-party discount.
- **They receive no service, and they are not charged.** Enforced in
  `startSubscription`: a subscription started before go-live runs its free
  trial from go-live, so the first invoice lands after there is something to
  invoice for. Verified end to end — a signup during the window gets a trial
  ending two weeks *after* launch day.
- The two months are spent hiring, insuring, and training.

That makes this the one number in the business most worth computing rather
than estimating.

## What it costs

At the planned headcount (`PRELAUNCH_HEADCOUNT`): 8 drivers, 5 personal
assistants, 4 errand runners, 1 secretary — 18 people.

| Role | Head | Insurance (2 mo) | Gas | Wages | Total |
|---|---:|---:|---:|---:|---:|
| Driver | 8 | $3,200.00 | $720.00 | $0.00 | $3,920.00 |
| Personal assistant | 5 | $750.00 | $0.00 | $0.00 | $750.00 |
| Errand runner | 4 | $600.00 | $0.00 | $0.00 | $600.00 |
| Secretary | 1 | $150.00 | $0.00 | $3,960.00 | $4,110.00 |
| **Total** | **18** | **$4,700.00** | **$720.00** | **$3,960.00** | **$9,380.00** |

Recurring after launch: **$4,256.67/month** — $2,350.00 insurance plus
$1,906.67 payroll. That is roughly **237 Premium subscribers** just to carry
the roster.

## The three lines, and why they are the three

### Liability insurance — everyone, from day one

`LIABILITY_INSURANCE_CENTS_PER_MONTH` ($75/person/month), plus
`DRIVER_INSURANCE_SURCHARGE_CENTS_PER_MONTH` ($125) for a role that drives.

Not a perk. People are being sent to strangers' addresses, into other
people's cars, and in the secure-transport case armed. That exposure is the
company's to carry, and an uninsured incident is the one line item where
being wrong is not recoverable. The figures sit mid-range of what
occupational-accident and general-liability cover quotes for gig-style staff
in the US ($45–125/worker/month, commercial auto materially higher) and are
**placeholders until a broker quotes the real thing** — deliberately not the
cheap end of the range.

### The drivers' gas stipend — $10 a week, through the window

`GAS_STIPEND_CENTS_PER_WEEK`, running `PRELAUNCH_WEEKS` (9). $90 per driver,
$720 in total.

Read as weekly, not monthly or one-off: $10 once is not a stipend anybody
notices. If the intent was a different cadence, that constant is the only
thing to change — the duration is derived from the launch dates so it cannot
fall out of step with them.

It exists because there are no fares during the window. A driver who accepted
an offer, got insured, and stayed on the roster should not be out of pocket
for waiting on us to open.

### Wages — the secretary, and nobody else

The field roles are paid per job, and during a window with no customers there
are no jobs — which is exactly why the stipend exists. A secretary is the
opposite: the pre-launch work *is* the job (applications, insurance
paperwork, answering the people who signed up), so those hours are real
payroll.

20 hours a week at $22/hour, against a BLS 2024 median of roughly $45–48k a
year for secretaries and administrative assistants. Omitting this line was
the easy way to make the total look small, and it is the single largest
non-insurance cost in the window.

## What this does not model

It is not a full operating budget and should not be read as "what launching
costs". It excludes software, insurance brokerage fees, background-check
vendor fees, phones, legal, marketing, and the founder's own time. What it is
authoritative about is the staffing commitments already made, which is the
part that gets left out of the optimistic version.

## Endpoints

| Route | Does |
|---|---|
| `GET /api/staff/roles` | Public: the open non-driving roles and what everyone hired gets |
| `POST /api/staff/apply` | Apply for a non-driving role; no account needed |
| `POST /api/staff/applications/:id/withdraw` | Applicant withdraws, with the id and the email they applied with |
| `GET /api/staff/applications` | Admin: the review queue |
| `POST /api/staff/applications/:id/review` | Admin: move an application through review |
| `GET /api/admin/budget` | Admin: the plan, and the same model against who has actually been hired |

Drivers apply through `POST /api/drivers/apply`, which asks about a vehicle
and a licence — see `docs/driving.md`. Both pipelines share one set of review
rules (`application-review.ts`), so "nothing is approved sight-unseen" holds
for every role from one implementation.

## The mailing list

During the window the honest offer to a visitor is not a signup button but a
way to be told when the service starts. `POST /api/newsletter` is public and
account-free for that reason.

**Nothing sends mail yet.** `adapters/email.ts` reports `handoff` until
`EMAIL_API_URL`, `EMAIL_API_KEY` and `EMAIL_FROM` are set, and the API's
response says so rather than claiming a confirmation is on its way — a
mailing list's entire promise is a message that arrives later, so "check your
inbox" with no mail server behind it is the worst place in the app to bluff.
The list is stored and exportable via `GET /api/admin/newsletter`, so it can
be sent from anywhere on launch day.

Unsubscribing is authorized by a per-subscriber token, not by the address, so
nobody can opt someone else out; and both a wrong token and an unknown
address get the same answer, because confirming membership is itself a
disclosure.
