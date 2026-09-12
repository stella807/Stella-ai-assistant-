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

## What actually pays the assistant: the service fee

Easy to miss, so it's worth saying plainly: the spend cap is not the
assistant's pay. It's what they're reimbursed for buying on the subscriber's
behalf — the burger, the supplies — the same way a ride fare passes through
to a driver rather than being the driver's wage. Before `serviceFeeFor`
existed, nothing in this feature compensated the assistant for their time at
all.

`CONCIERGE_SERVICE_FEE_CENTS` in `concierge.ts` is a published rate per
category, held and charged on top of the spend cap:

| Category | Fee | Why |
|---|---|---|
| Grab something | $9.00 | A quick round trip, minutes of work |
| Run an errand | $9.00 | Same shape as grabbing something |
| Check on someone | $12.00 | Getting there and actually assessing someone takes longer |
| Wait with someone | $18.00 | Open-ended by nature — priced for a first ~30-45 min block |

This is a fixed rate card, not a provider quote, and that's a deliberate
choice: there's no real-time "labor pricing" API the way a ride fare defers
to Uber's own pricing engine, so a fixed, disclosed schedule beats pretending
to compute one from nothing. Of each fee, most is the payout the partner
network passes to the assistant who did the work; the rest is Safehubby's
margin (`CONCIERGE_FEE_MARGIN`, 20%), stated so the number is traceable
rather than arbitrary.

The two amounts are held together, not as separate transactions —
`totalChargeCents` is `spendCapCents + serviceFeeFor(category)`, and that sum
is what `authorizeExactHold` reserves. At settlement, the service fee is
captured in full regardless of what the purchase itself came to; only the
purchase side is capped by what was actually spent. Someone who sends an
assistant to grab a $12 burger under a $25 cap is charged $12 + the $9 fee —
never $25 + $9, and never $9 alone just because the purchase came in low.

For where this money actually goes and roughly how it compares to real gig
work: BLS's 2024 median for a traditionally employed personal/executive
assistant runs around $45-50k/year; gig-platform task rates (TaskRabbit,
Wonolo, and similar) for short, bounded, in-person work commonly land around
$20-35/hour. These fees were set to land an assistant's per-task payout in
that same range for a task of the category's typical length — not to
approximate a salary, since a task is minutes, not a shift.

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

## Browsing the roster, and picking someone

`GET /api/concierge/assistants?category=&lat=&lng=` returns the partner
network's roster for a category near a location (`ConciergePort.listAssistants`
in `fulfillment.ts`) — a subscriber can pick a specific person instead of
leaving assignment to the network's own dispatch. Each profile carries
`maxConcurrentCustomers` (bounded 1-3 — `ASSISTANT_MIN_CAPACITY`/
`ASSISTANT_MAX_CAPACITY` in `concierge.ts`) and `currentCustomers`, so the UI
can show who's actually available rather than a name with no context.

That capacity number answers the "how many customers is an assistant
comfortable handling" question directly, without Safehubby running its own
hiring intake to collect it: it's the assistant's own stated comfort level,
reported to and enforced by the partner network when they joined it, the same
way their identity and background check are the partner's, not ours. Every
tier gets the same roster and the same bounds — no cheaper, more restricted
version of "pick your person" for a lower plan.

An empty roster (`assistants: []`) is a normal, expected answer, not an
error — nothing here ever invents a candidate because the network had none to
show or wasn't reachable.

## Voice messages: async, not a live call

Once a task is booked, `AssistantModal` on the web opens into a voice-message
thread for it (`packages/core/src/voice-messages.ts`,
`POST`/`GET /api/concierge/tasks/:id/voice-messages`). Deliberately not a live
call:

- A live call needs a telephony provider (Twilio Voice or similar) in the
  loop, real-time, with its own infrastructure and its own outage modes.
- An assistant mid-task may not have hands free to answer a ringing call; a
  clip waits.
- The same store-and-forward shape everything else in this codebase already
  uses (a message row in the same document store) fits a voice clip better
  than it fits a call.

Clips are capped at `MAX_VOICE_MESSAGE_SECONDS` (60s) and roughly
`MAX_VOICE_MESSAGE_BYTES` (1.5MB decoded), enforced both client-side (the
recorder auto-stops) and server-side (`recordVoiceMessage` throws past
either). **This prototype stores the clip itself, base64-encoded, inline in
the same JSON document as everything else** — deliberately, to keep the
feature this small, but it is a real scaling limit stated plainly rather than
glossed over (see `SECURITY.md`). A real deployment should push clips to
object storage (S3, R2, …) and store a URL here instead; nothing about the
validation or the domain rules changes when it does.

**The traveler's side of the thread is fully wired; the assistant's side is
not, yet.** `POST /api/concierge/tasks/:taskId/voice-messages` is a normal,
session-authenticated route a traveler calls to send a clip. An assistant's
reply has nowhere else to originate from but the partner network's own
system, so it arrives instead through
`POST /api/concierge/webhooks/voice-message` — the one inbound route in this
whole codebase, everything else here only calls out to a provider, never the
reverse. It's gated by `requirePartnerNetwork`, which checks an
`x-concierge-key` header against `CONCIERGE_API_KEY` — the same secret the
outbound adapter already authenticates with, reused in both directions for
now. A real deployment should give the partner network its own, separately
rotatable secret rather than share the one the outbound calls use.

## The assistant portal

Reached at `<web app>/?assistant_token=...` — a link, not a login. There is
no Safehubby account behind it: the token maps straight to an
`assistantId` from the partner network's own roster (`assistantTokenFor` in
`routes.ts`, minted the first time that assistant is booked and reused after,
so it's one link an assistant can keep rather than a fresh one every task).
Safehubby has no channel of its own to hand that link to an assistant — it's
forwarded to the partner network's own `book()` call as `portal_token` so
their dispatch can relay it however they already reach their people.

`main.tsx`, not `App.tsx`, decides whether to render the portal instead of
the rider-facing app — before any of `App`'s own hooks or its sign-in gate
exist, so an assistant's link can never end up depending on whether some
rider happens to be signed in on the same device.

What it does, on purpose kept to exactly three things:

- **See what's assigned.** `GET /api/assistant/portal` returns every task for
  that `assistantId` — the requester's name, the note, the location, the
  spend cap, and the service fee (what they're actually being paid).
- **Talk to the customer.** The same async voice-message thread the rider
  sees, from the other side — `POST`/`GET /api/assistant/tasks/:id/voice-messages`.
- **Close the loop.** Mark a task done (optionally reporting what was
  actually spent, which settles for real rather than defaulting to the full
  cap — the honest way to close the gap `docs/billing.md` already flags for
  store receipts) or decline it — the disclosure that an assistant can say no
  to anything unsafe, illegal, or outside what they agreed to, made real.

Every one of those routes takes the token as a query param and checks it
against `assistantAccess`, never a session — `requireAssistantToken` in
`routes.ts` is the whole authorization model, and `assistantTaskOf` makes
sure a token only ever reaches the tasks assigned to that specific
`assistantId`, never another assistant's.

**The token in a URL is a real, stated tradeoff, not an oversight.** A URL
can leak through referrer headers, browser history, or a screenshot in a way
a bearer token in an `Authorization` header does not. It was chosen anyway
because there is no assistant identity system to authenticate against
otherwise, and because it matches how the partner network already reaches an
assistant — a link, not a username and password Safehubby would have to
issue and manage. See `SECURITY.md`.

## Identity photos: a selfie from each side

`IdentityPhoto` in `concierge.ts` — one selfie from the subscriber, one from
the assistant, attached to the task, not to either account. Neither is
required to book or to work a task; a missing one just means that side
skipped it.

- `POST /api/concierge/tasks/:id/selfie` — the subscriber's own, shown to the
  assistant in the portal so they can confirm who they're meeting before they
  arrive.
- `POST /api/assistant/tasks/:id/selfie` (token-authenticated) — the
  assistant's own, shown to the subscriber in the same voice-message view so
  they can confirm who's coming.

Captured with the browser's native camera-capture file input
(`apps/web/src/native/camera.ts`) rather than a live `getUserMedia` preview —
it needs one photo, not a viewfinder, and the OS's own camera app already
does framing and a shutter better than a custom one would. Validated and
bounded the same way voice clips are (`MAX_PHOTO_BYTES`, `validateIdentityPhoto`
in `concierge.ts`) and stored the same way — inline, base64, in the same JSON
document, with the same scaling caveat stated in `SECURITY.md`.

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
