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
- **The assistant pays with a card issued for this task alone** — see below —
  never the subscriber's own card.
- Location is shared with the assistant only for the task's duration.
- Not an emergency service — call your local emergency number for those.

## Paying the assistant: a single-use card, not a shared account

The original version of this idea gave personal assistants "single-use debit
cards funded by the subscriber's own bank account." Two changes were made to
that before it shipped, and both were load-bearing:

- **The card draws on Safehubby's own balance, not the subscriber's bank
  account directly.** A direct debit means ACH, which typically settles in
  1-2 business days — too slow to fund a card for a same-night task without
  either fronting the money or making someone wait. Instead, the subscriber's
  card on file is held for exactly the spend cap (`authorizeExactHold` in
  `payment.ts`) at the same moment a card is issued to the assistant, and
  Safehubby recoups that hold once the task settles. Safehubby fronts the
  money for a short window; the cap bounds how much and the exact-hold rule
  means the recoup is never short.
- **The card is issued through Revolut Business** (`apps/api/src/adapters/cards.ts`),
  capped at exactly the task's spend cap, single-use, and killed the moment
  the task completes or cancels — never a card that outlives the task it was
  issued for.

One real constraint worth stating plainly rather than glossing over: Revolut
Business's card-issuing surface is scoped to members of *your own* Revolut
Business team, not to arbitrary third parties. There is no endpoint for
handing a card to someone who isn't a team member. Using this for real means
either onboarding the partner network's assistants as authorized cardholders
on Safehubby's own Revolut account (a vendor relationship to set up, not just
an API key), or having the partner hold its own Revolut account that
Safehubby funds by transfer instead. The adapter's doc comment has the full
reasoning; nothing here pretends this is a five-minute integration.

**Card issuing is an add-on, not a precondition.** If `REVOLUT_API_KEY` isn't
set, or Revolut is briefly unreachable, a concierge task still books — the
partner network can bill Safehubby directly with no card in the loop, the same
way it would if this integration didn't exist at all. `cardIssuing.mode` on
`GET /api/fulfillment/status` reports this independently of `concierge.mode`,
the same "each capability reports for itself" rule as every other adapter.

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

## Where it's gated, and what it costs

`personal-concierge` is on `BASIC_FEATURES` (`billing.ts`) — every paid tier,
Premium included, not a Family-only perk. It started Family-only; that gate
was removed, and every paid tier's price now absorbs a share of what it
costs. A task's own cost is still capped by the subscriber per task, same as
before — that part didn't change. What moved is two standing costs that exist
whether or not a given subscriber ever books a task that month, the same
category of reasoning as secure transport's insurance contract:

- The partner-network retainer itself.
- Keeping the Revolut Business balance funded that issues each task's card —
  Safehubby is fronting real money for the window between issuing a card and
  capturing the matching hold, even though each card's cap bounds it tightly.

**This is not a salary line.** The assistants are independent partner-network
professionals dispatched through that retainer, not Safehubby employees — see
"What this is not" above. There is no payroll here to price in, which is
exactly why these increases are smaller than putting concierge staff on
payroll would have cost.

**Every paid tier gets the same thing — no cheaper version for Premium.**
Same categories, same `CONCIERGE_MIN_CAP_CENTS`/`CONCIERGE_MAX_CAP_CENTS`
bounds, same disclosures. The spend cap exists to protect the subscriber and
the card issuer, not to mark out a pricing tier, so there's no safety reason
to make the cheapest paid plan's version of "send a stranger to help" worse.

## Configuring a real provider

```bash
railway variables \
  --set "CONCIERGE_PROVIDER=Nearby Aide" \
  --set "CONCIERGE_API_BASE=https://..." \
  --set "CONCIERGE_API_KEY=..." \
  --set "REVOLUT_API_BASE=https://..." \
  --set "REVOLUT_API_KEY=..."
```

The first three turn on dispatch; the last two turn on card issuing. They are
independent — see "Paying the assistant" above.

Until these are set, `GET /api/fulfillment/status` reports `concierge.mode:
"handoff"` and every quote/booking route returns a `503` naming what's
missing — the same "never claim a provider we cannot verify" rule as every
other adapter in `docs/fulfillment.md`.
