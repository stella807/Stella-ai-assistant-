# Personal concierge

Send a vetted, insured partner-network professional to do one bounded,
in-person task, at a spend cap the subscriber sets and that is never
exceeded.

## What this is not

The original ask behind this feature was a "hiring tab": subscribers hire
personal assistants directly, funded by single-use cards drawn straight off
their bank accounts. That was scoped down deliberately, and it's worth being
explicit about why, because the two things that got cut are the two things
that make an open marketplace dangerous rather than merely difficult:

- **No in-house hiring.** Safehubby vets nobody and employs nobody here. An
  open "hire a stranger" tab means Safehubby becomes the thing standing
  between a vetted-or-not worker and someone's door at 1am — background
  checks, worker classification (employee vs. contractor), and insurance all
  become Safehubby's problem to own, not a partner's. That is a different
  company, not a feature. Instead, `ConciergePort` (`packages/core/src/fulfillment.ts`)
  is a booking layer on an already-licensed, already-insured partner network —
  the same shape as `SecureTransportPort`, for the same reason.
- **No direct bank-account funding.** ACH transfers typically take one to two
  business days to settle, which is not fast enough to fund a same-night
  task — the money would have to be fronted by Safehubby in the meantime, or
  the task would have to wait days. Instead, spending is authorized as a
  **pre-authorization hold on the card already on file** — the same mechanism
  rides and secure transport use — placed and released same-night.

## The one thing this module is strict about: the cap is exact

A ride fare estimate gets a 25% buffer (`HOLD_BUFFER` in `payment.ts`) because
the real cost is genuinely uncertain — surge, a longer route. A concierge
spend cap is different in kind: it's a ceiling the subscriber chose on
purpose, for money a stranger is about to spend. Padding it would authorize
more than what was promised. So concierge tasks use a separate function,
`authorizeExactHold`, which holds precisely the cap given — no multiplier,
ever. `CONCIERGE_MIN_CAP_CENTS` ($10) and `CONCIERGE_MAX_CAP_CENTS` ($300)
bound what a subscriber can set in the first place.

## The four task types

Deliberately closed, not free text for the category (the note field is free
text for *what*, within one of these four *kinds* of task):

| Category | What it's for |
|---|---|
| `grab-something` | Pick up food, drinks, or supplies from a named place |
| `wait-with-someone` | Stay with a friend who should not be left alone |
| `check-in-person` | Go see that someone is actually okay, in person |
| `run-errand` | A specific, bounded task nearby |

## Disclosures, shown every time

`CONCIERGE_DISCLOSURES` in `packages/core/src/concierge.ts` — acknowledged
before every booking, not just the first, the same reasoning as
`SECURE_TRANSPORT_DISCLOSURES`:

- The assistant is an independent partner-network professional, not a
  Safehubby employee.
- The spend cap is exact — never more, whatever the task ends up costing.
- The assistant can decline anything unsafe, illegal, or out of scope.
- **The assistant will not enter your home.** Meet outside or in a shared,
  public space.
- Location is shared with the assistant only for the task's duration.
- Not an emergency service — call your local emergency number for those.

## Lifecycle

`POST /api/concierge/quote` → `POST /api/concierge/tasks` (books it, places
the exact hold, writes a `concierge` line to the ledger as `pending`) →
`POST /api/concierge/tasks/:id/complete` (settles the charge) or
`POST /api/concierge/tasks/:id/cancel` (releases the hold, no charge).

**What "complete" settles at is honest about a real gap.** The partner
network is the only source of truth for what a task actually cost — that
would come from a receipts-reporting step in a real integration, not modeled
here yet. Until that's wired, `complete` accepts an optional `billedCents`
from the caller (capped at the spend cap either way) and defaults to the full
cap when none is given, rather than inventing a lower number. See
`docs/billing.md`'s "not wired yet" section for the same honesty pattern
applied to store receipts.

## Where it's gated

`personal-concierge` is a Family-only feature (`billing.ts`). Family's price
did not move for it — unlike secure transport, which needed a standing
insurance contract that costs money every month regardless of use, a
concierge task's cost is capped by the subscriber per task, with nothing
fixed for the subscription to absorb.

## Configuring a real provider

```bash
railway variables \
  --set "CONCIERGE_PROVIDER=Nearby Aide" \
  --set "CONCIERGE_API_BASE=https://..." \
  --set "CONCIERGE_API_KEY=..."
```

Until these are set, `GET /api/fulfillment/status` reports `concierge.mode:
"handoff"` and every quote/booking route returns a `503` naming what's
missing — the same "never claim a provider we cannot verify" rule as every
other adapter in `docs/fulfillment.md`.
