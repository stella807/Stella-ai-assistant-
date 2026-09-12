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

### The quick-task discount

Not every task is a $9-18 job. Grabbing one named thing or running one
specific errand can be a two-minute favor, and the standard rate card
overcharges for that. `QUICK_TASK_CATEGORIES` opts `grab-something` and
`run-errand` — the genuinely short, single-purpose categories — into a lower
published fee:

| Category | Standard fee | Quick-task fee |
|---|---|---|
| Grab something | $9.00 | $5.00 |
| Run an errand | $9.00 | $5.00 |

`wait-with-someone` and `check-in-person` are deliberately excluded: both
involve open-ended real time with a person, and discounting them would mean
underpaying an assistant for the same time commitment, not rewarding a
genuinely shorter job. A quick task is also capped at a lower spend —
`QUICK_TASK_MAX_CAP_CENTS` ($50), well under the standard $300 — so "quick and
simple" stays true rather than becoming a way to book a large purchase at a
discounted fee. `validateConciergeRequest` rejects `quickTask: true` outright
for an ineligible category or a cap above that lower ceiling.

### The customer sees the fee, itemized, before they book

`POST /api/concierge/quote` returns `serviceFeeCents` alongside `totalCents`,
and every task the customer's own routes return (`GET`/`POST /api/concierge/tasks`,
`.../complete`, `.../cancel`) carries the real `serviceFeeCents` — the same
number the assistant's own portal sees. `AssistantModal.tsx` shows the full
breakdown before sending a request: spend cap, service fee, and the total
that will actually be held. Nothing here is fabricated or padded to make the
number look better than it is — it is exactly `serviceFeeFor(category, quickTask)`,
the same published rate the assistant is paid from, margin included (see
`CONCIERGE_FEE_MARGIN` above): customers see where the money goes, and the
margin the business keeps on the way is baked into that one published number
rather than added as a separate, hidden line.

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

## The employee portal

A distinct area of the app from the customer-facing side — its own path
(`/employee`), its own sign-in, and its own session cookie
(`sh_assistant_session`, separate from a traveler's `sh_session`). Nothing
here shares identity with a Safehubby customer account: an assistant is not
a traveler, and the two identity spaces share nothing — not a session table,
not a cookie, not a route.

**Provisioning.** The first time an assistant is booked, `POST /api/concierge/tasks`
calls `provisionAssistantCredentials` (`routes.ts`), which creates an account
(`username` = the partner network's own `assistantId`, a system-generated
temporary password, hashed with the same scrypt scheme travelers' passwords
use — see `auth.ts`) and forwards the plaintext temp password to the partner
network's own `book()` call as `assistantPortalCredentials`, exactly once,
the same way the portal used to forward a magic-link token: Safehubby has no
channel of its own to reach an assistant directly, so it relies on the
partner's dispatch to relay it however they already reach their people. The
temp password is never stored — only its hash is — and can never be
recovered, only reset by signing in and changing it.

**Signing in.** `POST /api/assistant/auth/login` (username + password) sets
the `sh_assistant_session` cookie; `POST /api/assistant/auth/logout` clears
it. `mustChangePassword` comes back `true` until the assistant changes their
password via `POST /api/assistant/auth/change-password` — a
system-generated password is never allowed to quietly become someone's
permanent one, so `EmployeePortal.tsx` shows nothing else until it's changed.
Sessions last 12 hours (`ASSISTANT_SESSION_TTL_MS`), shorter than a
traveler's 30 days — a work portal on a shared or borrowed device is a
different risk profile than a personal safety app.

`main.tsx` decides which area to render — `EmployeePortal` for `/employee`,
the customer-facing `App` for everything else — by path, before either
component's own hooks exist, the same reasoning as the old token-based
version: neither area's rendering can end up depending on the other's state.

What the portal does, on purpose kept to a short, fixed list:

- **See what's assigned.** `GET /api/assistant/portal` returns every task for
  the signed-in assistant — the requester's name, the note, the location, the
  spend cap, and the service fee (what they're actually being paid) — plus a
  **pay-rate calculator**: the published per-task fee for every category,
  expressed as an hourly-equivalent rate (`hourlyRateCentsFor` in
  `concierge.ts`, using `CONCIERGE_TASK_MINUTES`'s stated typical duration),
  and what steady work at a chosen weekly cadence could add up to over a year
  (`annualEstimateCentsFor`). This is reference information computed from the
  real published fee, not a wage, a contract, or a promise of hours — see
  "What actually pays the assistant" above for why Safehubby publishes a
  fixed rate card rather than negotiating one per task.
- **Get paid.** `POST /api/assistant/payout-destination` for the bank account
  a biweekly payout lands in, `GET /api/assistant/payouts` for the record of
  every payout actually sent plus what's earned and not yet paid — see
  "Paying assistants biweekly" below.
- **Talk to the customer.** The same async voice-message thread the customer
  sees, from the other side — `POST`/`GET /api/assistant/tasks/:id/voice-messages`.
- **Close the loop.** Mark a task done (optionally reporting what was
  actually spent, which settles for real rather than defaulting to the full
  cap — the honest way to close the gap `docs/billing.md` already flags for
  store receipts) or decline it — the disclosure that an assistant can say no
  to anything unsafe, illegal, or outside what they agreed to, made real.

Every one of those routes is session-authenticated against
`db.assistantSessions`, never a token in the URL — `assistantActor(ctx)` in
`routes.ts` is the whole authorization model (the direct analogue of
`actor(ctx)` for travelers), and `assistantTaskOf` makes sure a session only
ever reaches the tasks assigned to that specific `assistantId`, never another
assistant's.

**Why cookie-only, no `Authorization: Bearer` fallback the way traveler
sessions have.** Bearer support exists for travelers because a native app
build can't always rely on cookies; the employee portal is browser-only for
now, and giving it the same header would make a single `Authorization` value
ambiguous between two identity spaces this is deliberately keeping apart. See
`SECURITY.md`.

## Naming a real place

The note field is free text — "grab a burger from The Anchor Tavern" — which
means a task's actual location is only as good as however the subscriber
happened to spell a place from memory. `GET /api/concierge/places?query=&lat=&lng=`
(`PlaceSearchPort`, `apps/api/src/adapters/places-search.ts`) backs an
optional place picker in the concierge task form so a request can name a
confirmed real place instead: a specific pharmacy, a wine store, a restaurant
by name. It's a Google Places (New) Text Search call, reusing the same
`GOOGLE_PLACES_API_KEY` as the venue and grocery pickers (`docs/fulfillment.md`),
gated the same way and rate-limited the same as those.

Deliberately no mock fallback here, unlike the venue and store pickers: an
arbitrary free-text query has no honest fake answer to return, so an
unconfigured or failed search returns an empty list rather than inventing a
plausible-looking match. The web UI checks `placeSearch.mode` on
`GET /api/fulfillment/status` first and says plainly that search isn't set up
yet rather than showing a box that quietly returns nothing forever.

Picking a result sets the task's actual `location` to that place's real
coordinates. When `VITE_GOOGLE_MAPS_BROWSER_KEY` is configured in the web
build, the picked place also renders in an embedded Google Map (the Maps
Embed API, which takes a browser-scoped, HTTP-referrer-restricted key — safe
to ship in the client bundle, unlike the server-side Places key). With no key
configured, the map is simply not rendered — no placeholder, no fake map, the
same discipline as every other unconfigured provider in this app.

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

A third, separate photo confirms *what happened* rather than *who met
whom*: `completionPhoto` on `ConciergeTask`, captured by the assistant via
`POST /api/assistant/tasks/:id/completion-photo` right before marking a task
done. It reuses the exact same validation and storage machinery as the
selfies above, but with `capture="environment"` (the rear camera) instead of
`capture="user"`, since it's a photo of the delivered item or the completed
service, not of a person. Optional, same as the selfies — a task can be
marked complete without one, but a customer weighing whether to dispute a
task has more to go on when one was attached.

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
"What this is not" above, and "Paying assistants biweekly" below for how a
per-task fee actually reaches them without that changing. There is no fixed
wage or benefits obligation here, which is exactly why these increases are
smaller than putting concierge staff on payroll would have cost.

**Every paid tier gets the same thing — no cheaper version for Premium.**
Same categories, same `CONCIERGE_MIN_CAP_CENTS`/`CONCIERGE_MAX_CAP_CENTS`
bounds, same disclosures. The spend cap exists to protect the subscriber and
the card issuer, not to mark out a pricing tier, so there's no safety reason
to make the cheapest paid plan's version of "send a stranger to help" worse.

## Where personal concierge operates

Launched in three markets, on purpose, not as a technical limitation:
Puerto Rico, Texas, and Los Angeles (`LAUNCH_MARKETS` in
`packages/core/src/service-area.ts`). Every quote, booking, and roster-browse
route checks `isInLaunchMarket` before it ever checks whether a partner
network is configured — this is Safehubby's own phased-rollout decision, so
it's enforced regardless of what a partner network might otherwise claim to
cover. Outside those three, every one of those routes returns a `503` naming
where the service actually is, rather than a generic "not configured" error.

The bounds are rectangular bounding boxes, not the real, irregular legal
boundaries of a state, territory, or city — stated plainly in the module's
own doc comment, since a box around Texas catches a sliver of its neighbors
and a box around Los Angeles is looser than the city's real limits. Accepted
for a v1 launch gate; replace with real geofencing before the edges start to
matter at scale.

## Paying assistants biweekly

The service fee is what an assistant earns per task; being paid is a
separate, scheduled event, not the instant a task completes. Every
assistant is paid on the same fixed 14-day cycle (`packages/core/src/payroll.ts`),
anchored to a stable epoch so periods never drift. An hourly sweep in
`main.ts` (the same cadence retention already runs on) calls `runPayroll`,
which, for the most recently *closed* period:

1. Finds every completed task, for every assistant, that hasn't already been
   paid (`earningsFor` — a task tagged with a `payoutId` never counts twice).
2. Sums what's owed per assistant (`totalEarningsCents`).
3. Sends one transfer per assistant through `PayoutPort`
   (`apps/api/src/adapters/payouts.ts`, reusing the same Revolut Business
   account and credentials already used for card issuing in `cards.ts`), to
   the bank account the assistant entered for themselves in the employee
   portal (`POST /api/assistant/payout-destination` — never collected by
   Safehubby staff on their behalf).
4. Records an `AssistantPayout` either way — `paid` with the provider's own
   reference, or `failed` with a stated reason (no destination on file, no
   encryption key configured, or the payout provider itself not configured)
   — and only tags the underlying tasks with a `payoutId` on success, so a
   failed attempt is retried automatically on the very next hourly sweep
   rather than silently dropping what someone is owed.

**This does not make Safehubby anyone's employer.** Paying a contractor on a
schedule is a different thing from employing them — Uber, DoorDash, and
Instacart all pay independent contractors this way. Nothing here creates
withholding, benefits, or an employment relationship; it only moves *when*
money already owed for a completed task actually arrives.

**Bank details are encrypted before they're ever stored**
(`sealPayoutDestination`/`openPayoutDestination` in `crypto.ts`, the same
AES-256-GCM cipher location history uses) — and if `SAFEHUBBY_ENCRYPTION_KEY`
isn't configured, `POST /api/assistant/payout-destination` refuses the
write outright rather than falling back to storing it in the clear. An
assistant can see their own payout history and what they've earned but not
yet been paid at `GET /api/assistant/payouts`; `POST /api/admin/payroll/run`
(gated by `requireAdmin`) triggers a run immediately rather than waiting for
the next hourly sweep, mainly for verifying the pipeline end to end.

## Disputes: a refund for the customer, a clawback from the assistant

Policy, not just a feature: if an assistant never delivered, or kept the
money for something they didn't do, the loss is recovered from *them*, not
absorbed by Safehubby. `POST /api/concierge/tasks/:id/dispute` (the
customer's own action — no admin review step exists yet, a known future
hardening point if this is ever abused) does two things atomically:

1. Refunds the task's charge in full (`refundCharge` in `wallet.ts`) —
   immediate, not conditional on what happens to the assistant next.
2. If the task had an assigned assistant, opens an `AssistantAdjustment`
   against them for the same amount (`packages/core/src/payroll.ts`) — a debt
   that reduces their *future* payouts, oldest debt first, rather than a
   line Safehubby writes off.

A task can only be disputed once, and only after it's `completed` — a task
still in progress gets cancelled instead, not disputed. The dispute reason
(`validateDisputeReason`, capped at 280 characters) is stored on the task
alongside `refundedCents`, so both sides can see what was claimed.

`applyAdjustments` (`payroll.ts`) is the pure function `runPayroll` calls
each period: it consumes open debts oldest-first against what an assistant
earned that period, and returns what's actually payable. A period fully or
partially absorbed by debt still settles — as `paid`, at whatever's left
over, even `$0` — and its tasks still get tagged with a `payoutId`, since
that pay was legitimately spent, just against a debt instead of a wire
transfer. A `$0` payout skips the bank-destination and Revolut-provider
checks entirely, since there's nothing to actually transfer; only a payout
with something left to pay after debt still needs a destination on file and
a configured payout provider, with the same retry-next-run behavior as
before on a real transfer failure. `GET /api/assistant/portal` and
`GET /api/assistant/payouts` both report `outstandingClawbackCents` so an
assistant can see what they still owe.

## Configuring a real provider

```bash
railway variables \
  --set "CONCIERGE_PROVIDER=Nearby Aide" \
  --set "CONCIERGE_API_BASE=https://..." \
  --set "CONCIERGE_API_KEY=..." \
  --set "REVOLUT_API_BASE=https://..." \
  --set "REVOLUT_API_KEY=..." \
  --set "SAFEHUBBY_ENCRYPTION_KEY=..."
```

The first three turn on dispatch; `REVOLUT_API_BASE`/`REVOLUT_API_KEY` turn on
both card issuing (`cards.ts`) and biweekly payouts (`payouts.ts`) — the same
Revolut Business account does both. `SAFEHUBBY_ENCRYPTION_KEY` is required
before any assistant can be paid at all, since it's what lets a payout
destination be stored. Set `GOOGLE_PLACES_API_KEY` (shared with
`venues.ts`/`grocery.ts`) to turn on the place picker, and
`VITE_GOOGLE_MAPS_BROWSER_KEY` at web-build time to also render the embedded
map for a picked place — see "Naming a real place" above.

Until these are set, `GET /api/fulfillment/status` reports `concierge.mode:
"handoff"` and every quote/booking route returns a `503` naming what's
missing — the same "never claim a provider we cannot verify" rule as every
other adapter in `docs/fulfillment.md`.
