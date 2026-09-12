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

## How you actually hire someone

Five steps, and step 4 is the one that was missing until now.

```
1. They apply            POST /api/staff/apply          (public, no account)
2. You read it           GET  /api/staff/applications   (admin)
3. You decide            POST .../review                submitted → under-review → approved
4. You hire them         POST .../hire                  → on the roster, portal login issued
5. They work             they sign into /employee, take tasks, get paid biweekly
```

**Nothing jumps from submitted straight to approved** — `application-review.ts`
enforces that for every role in the company, drivers included. Step 4 refuses
anything not already approved, so "hired" can never run ahead of "reviewed".

### Step 4 is what makes a hire real

Before it, the two halves of this app were each built properly and never
joined up: applications could be approved, and tasks could be dispatched — but
dispatch only ever read the **partner network's** roster. Somebody hired
through this app existed in the database and **could never be sent to a job**.
The budget below planned for nine field workers who had no way to appear in
front of a customer.

`POST /api/staff/applications/:id/hire` takes the market they work (which is
also the pay band their tasks price against — see `docs/concierge.md`) and
their capacity, puts them on the roster, and provisions their employee-portal
login. **The temporary password is returned once and cannot be shown again** —
relay it to them; the portal forces a change on first sign-in.

### Who can be sent to what

| Role | Grab something | Run an errand | Check on someone | Wait with someone |
|---|:--:|:--:|:--:|:--:|
| Personal assistant | ✓ | ✓ | ✓ | ✓ |
| Errand runner | ✓ | ✓ | — | — |
| Secretary | — | — | — | — |
| Driver | — | — | — | — |

The line between the two errand columns and the two right-hand ones is the
important one, and it is not about how long the job takes. **An errand runner
is hired to fetch a thing.** The moment the job is sitting with a stranger who
has had too much and judging whether they need an ambulance, it is a different
job with a different duty of care. Sending the cheapest available person to it
would be the most consequential shortcut in this codebase, so `roster.ts`
makes it impossible rather than discouraged — the booking route refuses it too,
not just the listing.

Secretaries and drivers take no concierge tasks at all. They are different
jobs with their own pay (`staffing.ts`, `driver-pay.ts`).

### Leaving

`POST /api/staff/roster/:id/stand-down` takes someone off the roster without
deleting them. The record stays, because they are still attached to every task
they worked and the pay owed for it.

### What this does not decide for you

**Worker classification.** Everything here models people paid per task with
their own stated capacity and hours, which is contractor-shaped — but the gas
stipend, the insurance, and set shifts all push the other way, and the test
differs by state (California's ABC test is the strictest of the three markets
here). Get this wrong and the back-taxes and penalties dwarf the launch
budget. It is a question for an employment lawyer in each market before the
first offer goes out, not a setting in this app.

**Background checks.** Every application requires consent (`staff-applications.ts`)
because that is the field that makes the check possible. Running it is a
vendor's job — Checkr, Sterling or similar — and the result belongs in the
reviewer's decision at step 3.

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
