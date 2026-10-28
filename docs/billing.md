# Billing

One account, one ledger, one screen. Everything Safehubby charges — the
subscription, the ride home, the secure-transport trip, the pharmacy run — is a
line in the same place, and `GET /api/billing` answers all of it in one call.

## Why there is one ledger and two rails

The goal was a single payment system covering both the subscription and the
per-trip charges. One *ledger* is achievable and is what this implements. One
*processor* is not, and it is worth being exact about why, because the
constraint is somebody else's rule, not a design preference:

- Apple and Google require a digital subscription sold inside their app to be
  bought through **their** billing. A build that takes a card for it is
  rejected.
- The same rules **forbid** in-app purchase for physical goods and real-world
  services. A pharmacy delivery or a ride home must not go through it — and
  could not anyway: in-app purchase cannot place the pre-authorization hold
  that `payment.ts` requires before Safehubby spends a cent with a provider.

So a subscription bought inside the iOS app settles with Apple, and a ride
bought in that same app settles on the card. That is two settlement rails, and
no amount of architecture removes it.

What *is* in our control is that the user never has to think about it. The
split lives in exactly one function:

```ts
railFor(kind, platform)   // packages/core/src/wallet.ts
```

Every other part of the system treats a charge as a charge. The statement adds
across rails. The history lists across rails. `rail` is a footnote under a
line, and the Payments screen only mentions it at all when a given account has
actually used more than one.

## The pieces

| Module | Owns |
|---|---|
| `packages/core/src/wallet.ts` | The ledger: `Charge`, `railFor`, `recordCharge`, `settleCharge`, `buildStatement` |
| `packages/core/src/subscription.ts` | Lifecycle: trials, proration, renewal, cancellation, `effectivePlan` |
| `packages/core/src/payment.ts` | The payment method on file and pre-authorization holds |
| `packages/core/src/billing.ts` | The plan catalogue and what each plan unlocks |
| `apps/api/src/billing.ts` | `renewDueSubscriptions` — the sweep that turns periods over |
| `apps/api/src/adapters/paypal.ts`, `charging.ts` | Verifying a client-tokenized payment method with PayPal, then reserving, capturing and charging it — see "Payment processors" below |

`wallet.ts` and `subscription.ts` are pure and fully tested; nothing in either
talks to a processor.

## The Elite tier — live, and priced around a covered physician's retainer

`isEnabled("elite-tier")` is **on** (features.ts) — Elite is a real,
purchasable ladder, not a dark-shipped one. It went through three pricing
rounds to get here ($119, then $500, then the current one), each one caught
by a test going red rather than by someone remembering to update this page,
which is exactly why the numbers below are read from `billing.ts` rather
than retyped from memory.

**$1,555/$7,775/$62,175 a month, for 1/2/6 people** (raised from $1,500/$7,500/$60,000 to cover PayPal's fee). The ladder sells two
things now, not one: a personal assistant's time (the included concierge
hours — 10/50/200), and a concierge physician's own retainer, paid by
Safehubby and included in the price rather than billed to the member
separately (`CONCIERGE_DOCTOR_RETAINER_ANNUAL_CENTS` in `elite.ts`,
$3,500/year — the middle of the $2,000-5,000/year common range for
concierge medicine, borne by Safehubby's own revenue).

That second piece is why seats scale the *opposite* way from the everyday
ladder. Free through Family scale seats **up** with price because they're
selling household size. Elite scales seats up with price too, but starting
from **one**, not six — because a covered retainer is priced per person it
covers, and "1,500 for one person, 60,000 for six" is a coherent per-person
promise at every rung, where "500 for six people including a retainer for
all of them" was not.

| Model | Rate |
|---|---|
| Pay-per-request | $50–$300+ per task |
| Hourly | $30–$125/hr ($75–$250 at premium firms) |
| Monthly retainer | $1,000–$5,000+/mo, for a dedicated 10–40+ hrs |
| Annual membership | $5,000–$100,000+/yr |
| Quintessentially specifically | **$12,000–$44,000/yr** |
| Concierge medicine retainer | $2,000–$5,000/yr commonly; up to $25,000/yr |
| Amex-style card concierge | **Free** — you pay only the retail cost of what they buy |
| Amalfi Jets "Reserve" | **$99/mo** — jets plus hotels, dining, ground transport |
| **Safehubby Elite (entry)** | **$1,555/mo, one person, retainer included** |

The comparison that actually holds now is against *employing* the
equivalent, not against a card membership: a house manager alone runs
$80,000-$150,000/year before employer costs, and that buys neither a covered
physician's retainer nor the desk's other services. Elite's entry rung is
$18,000/year for one person, with the retainer ($2,000-5,000 of that alone)
included. **The desk still earns supplier-side, not from the retainer or the
membership dues** — an 8% commission on one $50,000 jet charter is $4,000 —
so the membership price is what buys the hours and the covered retainer;
the bookings pay for the desk itself.

**What Elite is not.** A $1,000–$5,000/month retainer buys a dedicated 10–40+
hours. Elite's `lifestyle-manager` is access to a desk, not a reserved block
of somebody's month, and the copy should never imply otherwise.

### What's in it

`ELITE_ONLY` in billing.ts, deliberately withheld from every everyday tier so
a $69.99 Family plan is never silently handed a private jet desk:

| Service | Commission | Market it undercuts |
|---|---|---|
| Jet travel | **8%** | Charter brokers take 10–15%, up to 30% |
| Yacht charter | 10% | Project fees or retainers against scope |
| Villas and property | 10% | Same retainer shape as yachts |
| Event production | 10% | Planners charge 10–20% of budget |
| Hotels and hospitality | 10% | Advisors earn 5–10% (Virtuoso 20–25%) |
| **Concierge doctor** | **0%** | Retainer ($2,000-5,000/yr) now paid by Safehubby, not the member |
| `lifestyle-manager` | n/a — included | Luxury specialists bill $200–$500+/hour |

`ELITE_SERVICES` in `packages/core/src/elite.ts` carries these, and
`commissionCentsFor` rounds **down**, so a rounding cent never lands in
Safehubby's favour against the supplier's quote.

### The money model: Safehubby never touches the supplier's price

This is the part that made Elite a separate module rather than more
`CONCIERGE_CATEGORIES` entries. A concierge task rides a single-use card
capped at exactly `CONCIERGE_MAX_CAP_CENTS` ($300). A charter is
$20,000–$100,000+. Safehubby cannot hold, front, or capture that, and
pretending otherwise would mean a card it cannot fund.

So an Elite booking has **no `chargeId`, no `holdId`, no `card`** — the type
itself is the enforcement, and a test asserts those keys stay absent. The
member pays the operator, the hotel, the practice directly; the supplier pays
Safehubby a disclosed commission. `POST /api/elite/bookings` is tested to
create zero charges and zero holds.

That alignment is deliberate: Safehubby earns the same percentage on a
$40,000 charter as a $60,000 one, so hunting the better deal costs it
nothing.

### Why the concierge doctor still pays Safehubby zero, even though the retainer is now covered

Taking a percentage of a physician's fee for sending them a patient is the
shape of a referral kickback — it runs into the federal Anti-Kickback Statute
plus state fee-splitting and corporate-practice-of-medicine rules, which vary
by state and are not something this codebase should guess at. The rate is
`0` and a test exists specifically to stop someone "fixing" it.

That rule survives the retainer becoming included, because it is about which
direction the money moves, not how much of it there is. Safehubby paying the
practice's retainer *for* the member is Safehubby spending its own revenue on
a benefit it is billing for honestly — the same as covering any other
included service — not a cut of the physician's own fee, because no fee
flows back to Safehubby to take a cut of. `CONCIERGE_DOCTOR_RETAINER_ANNUAL_CENTS`
in `elite.ts` is that real cost, cited and priced against the entry rung's
revenue rather than left as an assumption behind "included." What doesn't
change: Safehubby still arranges access and vets the practice rather than
employing or treating anyone itself — see the physician and nurse roles in
`docs/job-listings.md` for the still-open question of what direct clinical
employment, instead of paying for care and advising the desk, would run into.

### A concierge doctor is never an alternative to an ambulance

`doctorAvailableFor(escalation)` returns false whenever `assess`
(emergency.ts) says `call-emergency`, and `POST /api/elite/bookings` refuses
with a 409 pointing at emergency services. The option **disappears** rather
than appearing with a warning next to it, because a warning next to a button
is still a button.

This is the highest-stakes guardrail in the app. A red-flag night — suspected
alcohol poisoning, a head injury — is exactly when a member with money might
reach for a private doctor instead of an ambulance, and exactly when that
choice could kill them. The check is server-side from the reported red flags,
never trusted from the client, and
`CONCIERGE_DOCTOR_DISCLOSURES[0]` leads with emergency care before it
mentions the service at all.

### Why the feature list is derived, not hand-written

`PLUS_FEATURES` is `ALL_FEATURES.filter((f) => !ELITE_ONLY.includes(f))`. That
keeps the guarantee that matters: `EVERY_FEATURE`'s
`satisfies Record<Feature, true>` still makes adding a `Feature` a compile
error until it's listed, and the author then has to decide whether it's
Elite-only or lands on the everyday tiers. Nothing can be added and quietly
forgotten in either direction.

### Three things to settle before turning the flag on

1. ~~The money flow does not reach this far.~~ **Solved** — commission-only,
   see above. Nothing here goes through `payment.ts`.
2. ~~Private aviation carries a legal duty.~~ **Implemented** —
   `JET_TRAVEL_DISCLOSURES` covers all three [14 CFR Part 295](https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-295)
   pre-contract disclosures (operating carrier, the capacity the broker acts
   in, liability insurance including its absence), and the quote route refuses
   to price a jet without naming the operating carrier. **Still needs a
   lawyer's read before launch** — the disclosures are written from the
   regulation, not reviewed by counsel.
3. **Commission needs relationships — so the desk borrows somebody else's.**
   `EliteDeskPort` (`apps/api/src/adapters/elite-desk.ts`) brokers the whole
   catalogue through a partner that already holds operator agreements,
   consortium hotel rates, and vetted practices. **Amalfi Jets is the intended
   first partner** — a tech-enabled charter broker whose own concierge
   programme already covers aircraft, hotels, dining and ground transport,
   which is most of this catalogue in one place. It is configuration
   (`ELITE_DESK_PROVIDER`), not a dependency, exactly as `CONCIERGE_PROVIDER`
   is.

   This also *reduces* regulatory exposure rather than adding it: a partner
   who brokers charter is the air charter broker of record and carries the
   Part 295 duties. Safehubby refers into it. Worth confirming with counsel
   which duties still attach to a referrer, but referring is a much smaller
   posture than broking.

   Three things about this remain unverified and are marked as such in the
   adapter: whether Amalfi offers a partner or referral API at all (they
   publish a consumer app, not a documented reseller integration), whether any
   single partner covers medical as well as travel (`offers()` exists so the
   app can decline what a partner does not hold), and what Safehubby's share
   of the commission actually is — if the partner earns the supplier
   commission, the split is contractual, not the researched market rate.

   Until `ELITE_DESK_API_BASE`/`_KEY` are set the adapter reports `handoff`,
   every booking stands as `requested` for the desk to take by hand, and the
   response says so. It never invents a price, which at these amounts would be
   the most expensive lie in the app.
4. **Medical and aviation both want counsel, not just code.** Fee-splitting
   rules vary by state, corporate practice of medicine restricts who may
   employ clinicians, and HIPAA attaches the moment Safehubby handles health
   information. The design avoids all three today by taking no medical
   commission and passing on only what a member asks it to — but that is a
   design choice to confirm, not a legal opinion.

## Rules the tests enforce

- **A trial is never charged on the way in.** A paid plan starts in a 14-day
  trial with nothing taken.
- **Mid-period changes are prorated.** The unused remainder of what was already
  paid for is credited against the new plan. A downgrade never produces a bill —
  and never a refund either, since refunding through a store rail is the store's
  decision, not ours.
- **Cancelling does not cut anyone off.** Paid features run to the end of the
  period that was paid for, then drop to free. On a product people use to get
  home, revoking a ride the instant someone taps Cancel is the wrong default.
- **Past-due keeps working.** A declined card does not take someone's ride home
  away at 1am. SOS, check-ins, location sharing and drink count are free
  regardless, always.
- **A hold and its ledger line resolve together.** `bookWithHold` creates both,
  captures both, and fails both. A user never sees a hold on their card with
  nothing on their statement explaining it.
- **A settlement can never exceed its authorization.** Same ceiling as the hold,
  enforced again at the ledger.
- **Real-world spend never reaches in-app purchase.** A table-driven test walks
  every `ChargeKind` × `Platform` pair and asserts it.

## Payment processors

How money comes in, and which part of the app each way feeds:

| Way to pay | Settles through | Used for |
|---|---|---|
| A saved **PayPal account**, or a **card** (Visa, Mastercard…) saved through PayPal | PayPal (`adapters/paypal.ts`) | Holds for tasks and rides, and plan charges |
| **Crypto** | OpenReceive (`adapters/openreceive.ts`) | Loads the prepaid balance |

Task cards for assistants come from **Lithic**; PayPal and crypto do not issue
cards. Customers save a card or their PayPal account, or load the balance
with crypto. ATH Móvil was removed for now (its adapter,
routes and balance button are in git history, before the commit that removed
it); it can be put back as a processor that loads the balance. Cards are saved
and charged through Stripe only (see "Stripe, beside PayPal"); PayPal saves
PayPal accounts.

`packages/core/src/fulfillment.ts` defines `ChargeProcessorPort`, and
`adapters/paypal.ts` implements it — the same
`ProviderStatus` automatic/handoff pattern as every other adapter in this
app (Lithic cards, manual payouts, Uber, DoorDash). Its job is verification:
the browser's own SDK tokenizes a method (PayPal's JS SDK) and hands this
server a token, and the adapter asks the real processor what that token
actually is, rather than trusting whatever the client claims. Without
`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, `POST /api/account/payment-method`
falls back to the typed stand-in used in development, and
`GET /api/payment/processors` reports it as `handoff` so the UI never claims a
PayPal button works when it can't.

`PaymentMethodOnFile.processor` is `paypal`, and nothing else: that list is
what decides what is real, so a way to pay is only added to it with an account
Safehubby actually holds. A PayPal account has no card behind it, which is why
`PaymentMethodOnFile`'s expiry is optional — there is nothing to expire, and
treating a missing expiry as expired would lock the method out immediately.

### Crypto loads a prepaid balance

A crypto payment settles the moment it is made — no hold, no saved method, no
recurring charge — so it cannot back a card-style hold. It funds a **Safehubby
balance** instead (`balance.ts`, the Payments screen's *Safehubby balance*
card, `/api/balance/*`); see "Crypto loads the prepaid balance (OpenReceive)"
below for how a load is paid and credited. Limits: $5–$500 per load, $1,000
total.

- **Spend:** an errand or assistant booking reserves from the balance when it
  covers the whole amount (never split with a PayPal account); otherwise it
  uses the saved PayPal account, or refuses naming the shortfall. The balance
  is derived from loads and from holds marked `fundedBy: "balance"`, so a
  capture or release adjusts it with no second write. Rides and plan payments
  still go on a saved PayPal account.
- **Refund:** by hand. The wallet connection cannot send money out, so there is
  no automatic refund of the balance.
- Not yet covered: plan subscriptions and rides from the balance; recurring
  renewals (each would need the customer to approve again).

### PayPal takes the money

PayPal is the processor for a saved payment method: it reserves for tasks and
charges plans.

- **Set:** `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a PayPal REST
  app. `PAYPAL_API_BASE` defaults to the **live** API; set it to
  `https://api-m.sandbox.paypal.com` while testing so nothing real moves.
  Vaulting ("save payment methods") has to be enabled on the PayPal app.
- **Saving an account:** PayPal's own button (setup token, then payment token,
  `/api/payment/paypal/*`). The server reads the account back from PayPal's
  Vault before storing its masked email.
- **Saving a card:** PayPal's card fields (`PayPalCardForm.tsx`, the SDK's
  `card-fields` component) draw the name, number, expiry and CVV in PayPal's
  own frames, so the number never reaches Safehubby. The setup token is an
  empty `card` source with `verification_method: SCA_WHEN_REQUIRED`, so PayPal
  runs 3-D Secure only when the bank asks. The server reads the card back
  (brand, last four, expiry) before storing it, and later charges it as
  `payment_source.card` with a merchant-initiated `stored_credential`. Your
  PayPal account has to be approved for card processing ("Advanced Credit and
  Debit Card Payments"); until it is, the fields do not load and the screen
  says so, offering the PayPal account instead.
- **Reserving for a task:** an order with `intent: AUTHORIZE` against the
  saved account's vault id, flagged merchant-initiated. The hold records
  `paypal:<authorization id>`. When the task is done, only what was spent is
  captured (`final_capture`), and a cancelled task voids the authorization.
- **Plan charges:** an order with `intent: CAPTURE` the same way, with retries,
  past-due and the end-after-three-declines rules in "When the period turns
  over". Every request carries a `PayPal-Request-Id` (the hold's or charge's
  own id), so a repeated request never charges twice.
- **Not exercised against a live PayPal account.** The code follows PayPal's
  documented Orders and Payments APIs and is tested against a stand-in for
  PayPal's servers. Run a sandbox app through it, with *Save payment methods*
  enabled, before trusting it with real money.

### Task cards through Lithic

Each task gets its own virtual card capped at the task's spend limit and
closed when the task ends.

- **Set:** `LITHIC_API_KEY`, and `LITHIC_ENV=production` once live (the sandbox
  otherwise, so a key pasted in for testing can never move real money). Cards
  are `VIRTUAL` with a `FOREVER` spend limit equal to the task's cap, and
  `CLOSED` when the task ends.
- **Showing the number:** Lithic's embedded card (`lithic-embed`, pinned at
  0.1.0-beta.0), which needs `SAFEHUBBY_PUBLIC_URL` to be the app's https
  address. Masked until the assistant taps Show. The number goes from Lithic to
  the assistant's browser and never through Safehubby.

### Crypto loads the prepaid balance (OpenReceive)

Customers can add to the same balance in crypto. It goes through
[OpenReceive](https://openreceive.org) (`@openreceive/http` and
`@openreceive/node` on the server, `@openreceive/react` in the app, all pinned
at 0.4.31) straight into **your own Bitcoin wallet** over Lightning.

- **Turn it on:** set `NWC_URI` on Railway to a *receive-only* NWC code from a
  wallet that supports it (openreceive.org lists them; Alby Hub is one you can
  run yourself). A code that can also send money is refused at startup, so a
  leaked code can never be used to empty the wallet. Add `LSC_URI_PRIMARY` for
  a swap provider and customers can also pay in USDT, USDC, SOL or ETH; it
  arrives as Bitcoin.
- **How a payment works:** `POST /api/balance/crypto/start` records the load
  and returns a reference. The checkout pays against that reference; the
  server, never the browser, says what it costs (`cryptoLoadPrice` in
  `crypto-loads.ts`). The balance is credited only when the wallet itself
  reports the payment final, once per reference.
- **Where it keeps its records:** two tables of its own,
  `openreceive_payments` and `openreceive_meta`, created on startup in the
  Railway Postgres (a SQLite file in development).
- **Refunds are by hand.** The wallet connection cannot send money, so a crypto
  load is never refunded automatically: the "send it back" button only covers
  money added with ATH Móvil (`athRefundableCents`).
- **If the wallet is unreachable** the crypto pages answer 503 and the rest of
  the app carries on.
- **Bitcoin's price** comes from CoinGecko at the moment of payment; you
  receive however much Bitcoin the dollar amount was worth then.

### Configuring PayPal

Create a REST app in PayPal's developer dashboard, turn on *Save payment
methods*, and set its keys (the sandbox first, with `PAYPAL_API_BASE` pointing
at `https://api-m.sandbox.paypal.com`):

```bash
railway variables --set "PAYPAL_CLIENT_ID=..."
railway variables --set "PAYPAL_CLIENT_SECRET=..."
```

The client id is also what the browser's PayPal button needs; the app fetches
it from the server (`GET /api/payment/paypal/config`), so there is nothing to
set in the web build. The secret never leaves the server.

## What is not wired yet

Stated plainly, because the code says the same thing where it matters:

- **With no processor keys at all** a card-rail charge still settles inline
  the moment it is recorded, which is what development and the tests run on.
  Holds, captures and plan charges go through PayPal once its keys are set
  ("PayPal takes the money" above).
- **PayPal has not been exercised against a live account.** PayPal's button
  saves an account without charging (setup token, then payment token) and the
  server reads the account back before storing its masked email; try it in
  PayPal's sandbox first, with *Save payment methods* enabled. It is verified
  here only against a stand-in for PayPal's servers and script.
- **The card form has not been run against PayPal.** It follows PayPal's
  documented card-fields flow and is tested against a stand-in for PayPal's
  servers; try it in the sandbox (PayPal's test card numbers) before going live.
- **No store receipt verification.** `POST /api/billing/charges/:id/confirm`
  records the receipt the client hands back and settles the line. A real
  deployment verifies it with Apple or Google first; the response says
  `verified: false` so no caller can mistake this for a checked purchase. That
  endpoint refuses to settle a card line at all, so nothing can be marked paid
  by claiming a receipt for it.
- **No store renewal webhook.** Apple and Google renew their own subscriptions
  on their own schedule. `renewDueSubscriptions` deliberately skips store-rail
  subscriptions and counts them in `storeRailPending` rather than inventing a
  renewal — a line on someone's statement for money we never took is worse than
  a stale period. The server logs the count each hour.
- **A pharmacy run only reaches the ledger when Safehubby pays for it.**
  Without a fulfilment partnership the run hands off to the store and the user
  pays there, so no line is written. See `docs/fulfillment.md`.

## When the period turns over

Two things renew, and they agree:

- `apps/api/src/main.ts` sweeps hourly, so accounts nobody touches still turn
  over.
- `catchUpBilling` in `routes.ts` runs the same sweep before answering any
  billing question, so a trial that ended an hour ago is over the moment the
  user opens the screen rather than whenever a timer next fires.

With PayPal set up, a card-rail renewal is left **pending** by the sweep and
then taken from the member's saved PayPal account (`collectSubscriptionCharges`
in `billing.ts`, through `chargeSaved`). The charge's id is the PayPal request
id, so a sweep that runs twice never bills twice.

- **Declined:** the charge fails with PayPal's reason and the plan goes
  `past-due`. Past-due keeps working, the same as before.
- **Retried** once a day (`retryPastDueSubscriptions`), and straight away when
  the member saves a new payment method.
- **After three declined tries** the plan ends that moment and the account
  goes back to Free. SOS and check-ins keep working.
- **Choosing a plan after the trial** (`POST /api/subscription`) charges the
  saved account on the spot and answers 402 with PayPal's reason if it is declined.

## What the plans cost, and why

Premium ($93.99), Premium Plus ($187.98), and Family ($563.94) are all
priced at ownership's explicit direction, a deliberate move away from
anchoring against personal-safety apps (Life360, Noonlight) or the
mid-market concierge-app band this ladder used before. The one rule every
round of this ladder has still held: seats and price climb together, never
seats-up-price-down (see the seat-ordering test in `billing.test.ts`,
scoped to exclude only Elite). Premium is $93.99 for one and Premium Plus
$187.98 for two; Family is $449 for up to six (about $75 a person, a real
household discount).

Included assistant hours each month: Premium 2, Premium Plus 4, Family 8,
Elite 20, Elite Signature 50, Elite Private 200. Hours beyond that bill at
$45. Each cap keeps the hours a plan gives away (paid to the assistant at
$35) well under what the plan brings in. Basic, at $39, is the everyday way in: the safety basics,
free food pickups — a $35 monthly credit that pays the runner's fee on a
snack, a restaurant or takeout order, or a grocery run — and an assistant by
the hour. The food itself is always the customer's.

**Basic is for members 65 and over.** Joining it takes a date of birth and a
photo of a government ID (`POST /api/account/senior-id`). Membership opens on
submission; staff review the ID (`GET /api/admin/senior-ids`, then
`POST /api/admin/senior-ids/:travelerId/review`), and a rejected ID ends the
food credit at once. See `packages/core/src/senior.ts`.

**Pharmacy pickups are billed** at a flat $29.99, not by the hour or mile,
plus the medication. The credit never pays for them. On a very expensive
prescription the fee rises just enough to cover the card's cut of the hold.

**Every other plan's free errands are built but switched off**
(`plan-free-errands`), so only Basic shows free errands for now. Free is offered
again for the safety basics alone. See the full rationale in
`packages/core/src/billing.ts`.

| | Monthly | Annual | Seats |
|---|---:|---:|---:|
| Free | $0 | $0 | 1 |
| Basic | $39.00 | $390.00 | 1 |
| Premium | $93.99 | $939.99 | 1 |
| Premium Plus | $187.98 | $1,879.98 | 2 |
| Family | $449.00 | $4,490.00 | 6 |
| Elite (entry rung, live) | $1,555.00 | $15,549.99 | 1 |

**Every paid price includes PayPal's fee.** PayPal keeps 3.49% + $0.49 of
each payment, and a separate card fee is illegal in Puerto Rico (Law 150), so
the fee is built into the price instead: each price was raised from its
earlier figure ($89.99, $99.99, $539.94, $1,500, $7,500, $60,000, and the
yearly prices the same way) to the amount that leaves at least that figure
after the fee. `PROCESSOR_FEE_RATE` and `PROCESSOR_FEE_FIXED_CENTS` in
`billing.ts` hold the rate, and a test fails if any price stops covering it.

Premium, Premium Plus and Family carry almost the identical feature set
(`PLUS_FEATURES` in `billing.ts`) — automatic ride/delivery booking, secure
transport, the full pharmacy-run menu, safe routes, history, group games,
extended SOS contacts, and personal concierge, all included on every paid
tier. The one exception is `multi-profile` ("multiple people, one
account"): Premium Plus and Family have it, Premium doesn't, because
Premium is a single-seat plan and the feature makes no sense on one. See
the "every paid tier is now the everything tier" rationale and
`PREMIUM_FEATURES`'s own doc comment in `billing.ts`.

Not a number picked in the air: Amalfi Jets' own Amalfi Reserve
membership — the real luxury concierge desk Elite partners with, see
`ELITE_DESK_MEMBERSHIP` in elite.ts — runs $99-$500/month depending on
tier. $99 is Amalfi's own entry rate (concierge booking plus discounted
charter access); $500 is its fuller tier, which is the one
`ELITE_DESK_MEMBERSHIP` prices against for a different reason. Premium
Plus at $99.99 lands right on Amalfi's own entry price, for a broader
bundle than that price buys there: Amalfi's entry tier is concierge
booking only, with no safety layer at all. Personal-safety comparables
(Life360 Platinum $24.99 for the whole circle) sit well below this
ladder now — the positioning is deliberately closer to a luxury
concierge membership's own price than to a safety app's.

**The subscription is still not the whole business.** The other margin is
the 10% on concierge tasks (`CONCIERGE_FEE_MARGIN`), the same way Elite's is
commission rather than dues.

### The trade-off, stated

Raising the price sharply lowers how many subscribers it takes to cover the
recurring roster (`docs/budget.md`: **$4,256.67/month**):

| Plan | Break-even subscribers |
|---|---:|
| Premium | 48 |
| Premium Plus | 43 |
| Family | 8 |

This only pays off if the higher price does not give up proportionally more
subscribers than it gains per subscriber — worth watching once real signup
data exists, since there is no comparable app at this price point to
benchmark conversion against.

This only pays off if the higher price does not give up proportionally more
subscribers than it gains per subscriber — the same trade-off as the
previous round, run in the other direction because the previous card priced
below what the concierge bundle is actually worth.

Annual stays ~17% off.

### Elite moved again, and the seats moved with it

Elite is no longer priced against the partner desk's own ~$99/month
membership at all — that comparison held while Elite sold "a number to
call," and it stopped being the binding constraint once the tier started
selling a covered physician's retainer instead (see above). The dues that
matter now are $18,000-720,000/year, which comfortably clears every
card-membership comparison; the constraint worth stating is that the entry
rung ($18,000/year) still has to clear the retainer it covers ($2,000-5,000)
plus a real share of the desk and the hours, which it does with room left.

Higher dues also mean the desk needs **just one member**, in the founding
year and every year after, to carry the house membership
(`eliteBreakEvenMembers`) — down from two, because the dues did the work a
lower-priced ladder needed member count to do instead.

Seats went from a flat six at every rung to **1/2/6**, and that is not
incidental to the repricing — it is what makes "the retainer is included"
a coherent promise. A retainer is bought per person it covers, not per
household, so the entry rung covering one person at $1,500 and the top rung
covering six at $60,000 is the ladder pricing the same thing consistently at
every step; six people sharing one covered retainer at any price would not
be. `billing.test.ts`'s seat-ordering test is scoped to exclude the Elite
ladder for exactly this reason: Elite is allowed to cost more than Family
while covering fewer people, because it is not selling seats.

## What is not in the concierge

The personal concierge ships on every paid tier. **Private aviation and the
concierge doctor do not** — they stay Elite-only, gated the same way
whether or not `elite-tier` happens to be on.

They are also the two entries in the catalogue that carry legal duties of
their own — 14 CFR Part 295 broker disclosures for charter, and the federal
Anti-Kickback Statute for anything resembling payment for a patient referral
— so turning either on by accident is a regulatory exposure, not a feature
arriving early. `billing.test.ts` asserts it against `releasedPlans()`
(what the API actually serves) rather than against the flag, and separately
checks that no concierge *category* is a jet or a doctor, since categories
are the other door into the same mistake.

## Before the service is live

The launch window is a **pre-launch** period: customers can sign up, and they
receive no service because there is nobody hired yet to provide it.

**Nobody is charged for a period we cannot serve.** `startSubscription` runs
the free trial from `SERVICE_LIVE_AT` rather than from signup whenever
someone joins before go-live (`billingStartsAt` in `promotions.ts`), so the
first invoice lands after there is a working product to invoice for. It is
date arithmetic rather than an operator's memory, because taking two months of
subscription money for nothing is the sort of thing that happens by omission.

`docs/budget.md` covers what that window costs on the hiring side.

## The launch party

An early-sign-up discount, run from `packages/core/src/promotions.ts`.

- **The window** is `LAUNCH_WINDOW_START`..`LAUNCH_WINDOW_END`. Sign up inside
  it and the discount applies.
- **The rate** is `LAUNCH_DISCOUNT_RATE` (3%), one constant, because this is
  the number most likely to change once there is conversion data.
- **It lasts one year**, not forever. `LAUNCH_DISCOUNT_YEARS` bounds it. "Early
  sign-ups get a discount" reads most naturally as a founding-member rate
  locked for life, and that is the expensive version: a permanent liability on
  every renewal of a cohort that will never be re-priced, bought with a
  one-time conversion bump.
- **Eligibility is derived, not stored.** `launchDiscountApplies` reads
  `subscription.joinedAt`, so there is no stored flag that can disagree with
  when someone actually joined.

  It reads `joinedAt` and **not** `startedAt`, which is the subtle part:
  `renew` resets `startedAt` to the renewal date, so a discount anchored on it
  lapsed on the *second invoice* while still being advertised as a year. That
  is why `joinedAt` exists as a separate, immutable field, and why
  `billing.test.ts` renews eleven times in a loop rather than once.
- **The discounted year runs from go-live**, not from signup. The whole cohort
  joins before the service starts, so anchoring to signup would spend two
  months of the discounted year on months nobody was billed for — "3% off your
  first year" would really mean ten. Anchoring to `billingStartsAt` also makes
  the end date uniform across the cohort, so no early joiner is worse off for
  having signed up sooner.
- **It is applied at renewal only**, in `renewDueSubscriptions`. Signup is a
  free trial and charges nothing, so renewal is the only place a subscription
  price exists to discount. `RenewalResult.discountedCents` reports the cost of
  the promotion so it is a number somebody can look at.
- The discount **rounds down** (`Math.floor`), the same direction
  `commissionCentsFor` rounds: a rounding cent should never quietly favour the
  house.

### Does it pay for itself?

A discount of rate `d` breaks even when it lifts sign-ups by `d / (1 - d)`.
Revenue with it is `N(1 + L) × P(1 - d)`, without it `N × P`; setting those
equal gives the formula. It is `discountBreakEvenLift` in `promotions.ts` and
is checked against simulated revenue in `promotions.test.ts`, rather than being
a sentence in a doc nobody can verify.

At 3% that is a **3.1% lift**, which is a low bar. The risk is not the
arithmetic — it is the size of the number. 3% of Premium is **53¢/month**, and
the app already discounts **~15% for paying annually**, five times more. A
price-sensitive person has already taken the bigger discount, so the launch
rate is unlikely to be what moves them.

The mechanism is therefore built to be re-priced rather than replaced: one
constant, one bounded window, and no stored eligibility flag. The referral loop
in the same module is the part expected to actually pay — a discount buys one
cohort at a per-head cost, a share loop buys the next one at close to zero.

## Endpoints

See `docs/api.md` for the full surface. The billing ones:

| Route | Does |
|---|---|
| `GET /api/billing` | The card, the subscription, the statement and the charge history, together |
| `POST /api/subscription` | Start or change a plan; records the line and picks the rail from `platform` |
| `POST /api/subscription/cancel` | Cancel, keeping access to the end of the period |
| `POST /api/billing/charges/:chargeId/confirm` | Settle a store-rail line against its receipt |
| `GET /api/share` | The caller's referral code, link, invite text, and how many have joined with it |
| `GET /api/catalog` | Public; carries the launch-party window so the signed-out landing page can show it |

`platform` on `POST /api/subscription` is self-reported, and has to be: only the
client knows whether it is the App Store build. A client that lied would be
routing an in-app subscription around Apple's billing, which is the operator's
compliance problem — it cannot take a user's money twice or reach anyone else's
data. It is stored on the subscription so the rail is auditable afterwards.

## Real charging (PayPal)

When PayPal's keys are set and a customer saved a PayPal account, every hold in the ledger is matched by a real PayPal authorization:

- **Booked:** an `AUTHORIZE` order for the exact amount, charged to the saved account with nobody present (the hold's id is the PayPal request id). A decline, or PayPal wanting the customer to approve it themselves, stops the booking with PayPal's own reason — nothing is booked on a hold that does not exist.
- **Done:** only what was actually spent is captured; the rest of the authorization falls away.
- **Cancelled or declined by the assistant:** the authorization is voided, releasing the whole hold.

A capture that fails is written onto the charge for the owner to follow up; it never fails the assistant's "mark done". The prepaid balance, loaded with ATH Móvil or crypto, is unchanged. Plan subscriptions are charged to the saved PayPal account too — see "When the period turns over".

## Stripe, beside PayPal

Cards can be saved through Stripe (`apps/api/src/adapters/stripe.ts`) as well as
through PayPal. When `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are set,
"Add a credit or debit card" uses Stripe's Payment Element; PayPal accounts stay
on PayPal. Each method is charged by the processor it was saved with.

- **Payments:** the card is saved with a SetupIntent on the member's own Stripe
  Customer (`stripeCustomers` in the store). A task hold is a manual-capture
  PaymentIntent (`pi_…`), captured for what was spent or cancelled. A card id
  that is not attached to the member's own Customer is refused.
- **Invoicing:** a plan's monthly or yearly charge is a Stripe invoice paid off
  the saved card, so members get Stripe's invoice and receipt. Turn on
  customer emails for invoices and receipts in the Stripe Dashboard.
- **Tax:** `STRIPE_TAX=on` enables Stripe Tax on those invoices. The line is
  `tax_behavior: inclusive`, so the tax is carved out of the listed price and
  the member is charged exactly what the app shows. Stripe only collects where
  the account has a tax registration.

## ATH Móvil

Members can add money to their Safehubby balance with ATH Móvil, through
ATH Business's Payment Button API (`apps/api/src/adapters/ath-movil.ts`,
`apps/api/src/ath-loads.ts`). It is off until `ATH_MOVIL_PUBLIC_TOKEN` is set
in Railway; `ATH_MOVIL_PRIVATE_TOKEN` is needed for refunds. Both come from the
ATH Business app's settings.

1. The member picks an amount and enters their ATH Móvil phone number.
2. The server opens the payment with ATH for that amount (`POST /api/balance/ath/start`).
3. The member approves it in their ATH Móvil app within 10 minutes.
4. The page asks the server to check (`POST /api/balance/ath/:id/check`); once ATH
   reports it approved, the server authorizes it, which takes the money, and
   credits the balance. A payment that is declined or left unapproved is
   cancelled and nothing is charged.

ATH Móvil cannot be saved and charged later, so it cannot renew a plan
automatically; it funds the balance, which pays for errands and assistants.
Evertec has no test environment: the first check is a small real payment.

## Free each month: the owner's switch

What a plan gives free each month (no-fee pickups, and Basic's food credit) is
not fixed in code. In `/master`, **Free each month** (owner only) has an
on/off switch and the amounts: pickups per month for Free, Premium, Premium
Plus and Family, and Basic's credit in dollars. Off removes every free pickup
and credit and hides the row from the plan table; "Back to standard" restores
the built-in numbers. Elite stays unlimited, and included assistant hours and
desk tasks are plan features, not part of this. Limits are 30 pickups and $100
so a typo cannot give away the margin.

The runner is paid in full whatever is set; Safehubby covers the waived fee.
Stored in `monthlyFreebies`, loaded before each API request, sent to the app in
`GET /api/catalog` (`freebies`), and changed at `POST /api/master/freebies`,
which writes an audit-log entry. The static marketing site bakes its numbers
at build time, so it shows the standard amounts until it is rebuilt.
