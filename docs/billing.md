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
| `apps/api/src/adapters/stripe.ts`, `paypal.ts` | Verifying a client-tokenized payment method against the real processor — see "Payment processors" below |

`wallet.ts` and `subscription.ts` are pure and fully tested; nothing in either
talks to a processor.

## The Elite tier — live, and priced around a covered physician's retainer

`isEnabled("elite-tier")` is **on** (features.ts) — Elite is a real,
purchasable ladder, not a dark-shipped one. It went through three pricing
rounds to get here ($119, then $500, then the current one), each one caught
by a test going red rather than by someone remembering to update this page,
which is exactly why the numbers below are read from `billing.ts` rather
than retyped from memory.

**$1,500/$7,500/$60,000 a month, for 1/2/6 people.** The ladder sells two
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
| **Safehubby Elite (entry)** | **$1,500/mo, one person, retainer included** |

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

`packages/core/src/fulfillment.ts` defines `ChargeProcessorPort`, and
`apps/api/src/adapters/stripe.ts` / `paypal.ts` implement it — the same
`ProviderStatus` automatic/handoff pattern as every other adapter in this
app (Revolut cards, Revolut payouts, Uber, DoorDash). Their one job today is
verification: the browser's own SDK tokenizes a method (Stripe.js, PayPal's
JS SDK) and hands this server a token, and the adapter asks the real
processor what that token actually is — brand, last 4, expiry — rather than
trusting whatever the client claims. Neither adapter is configured without
`STRIPE_SECRET_KEY` or `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` set, in
which case `POST /api/account/payment-method` falls back to the same typed
mock form this screen has always used, and `GET /api/payment/processors`
reports both as `handoff` so the UI never claims a wallet or PayPal button
works when it can't.

**Apple Pay and Google Pay are not separate processors.** Both are wallets
Stripe's own client SDK surfaces on top of the same card rails — a wallet
token still verifies through the Stripe adapter, and `PaymentMethodOnFile.processor`
records `"stripe"` either way, with `wallet` set only for display.

### Configuring Stripe

Stripe needs **two** keys, in two different places, and the UI reports them
separately so a half-configured setup doesn't look like one vague failure:

```bash
# Server — verifies whatever token the browser produces. Never shipped to a client.
railway variables --set "STRIPE_SECRET_KEY=sk_live_..."

# Web build — baked into the bundle at build time, like VITE_API_URL.
# A publishable key is designed to ship to browsers and is not a secret.
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_... pnpm --filter @safehubby/web build
```

With both set, `PaymentMethodCard.tsx` loads Stripe.js
(`apps/web/src/native/stripe.ts`) and:

- **Card** mounts Stripe's real Card Element, so the card fields live in
  Stripe's iframe and neither this app nor its server ever sees a raw card
  number — only the PaymentMethod id, which `adapters/stripe.ts` then
  re-verifies against Stripe's API rather than trusting the browser.
- **Apple Pay / Google Pay** go through Stripe's Payment Request sheet.
  Availability comes from Stripe's own `canMakePayment()` — the real answer
  for both wallets, replacing the earlier `ApplePaySession` sniff. The sheet
  asks for a zero total and never confirms a payment: attaching a method is
  not a purchase, and the actual money movement happens later via
  `authorizeExactHold` at booking time.

With the publishable key missing, Card falls back to the typed-in stand-in
form this screen has always had, and the wallet tabs say which half is
missing. Nothing is ever presented as working when it isn't.

## What is not wired yet

Stated plainly, because the code says the same thing where it matters:

- **No hold capture or refund through a real processor.** A card-rail charge
  still settles inline the moment it is recorded — Stripe's manual-capture
  PaymentIntents map onto `authorizeHold` / `captureHold` / `releaseHold`
  exactly, and PayPal has an equivalent authorize/capture flow, but neither
  swap is made yet. That work is contained to `apps/api/src/routes.ts` and
  `apps/api/src/billing.ts`; verifying the payment method itself (above) is
  a separate, already-done step from actually moving money against it.
- **No PayPal client SDK.** PayPal's server side (`adapters/paypal.ts`) is
  ready to verify a vaulted payment-token id, but loading PayPal's own
  checkout SDK to produce one is still a labeled gap (`attachPaypal` in
  `PaymentMethodCard.tsx`). Stripe, by contrast, is wired end to end — see
  "Configuring Stripe" above.
- **The Stripe integration has not been exercised against a live account.**
  The code follows Stripe's documented Elements and Payment Request APIs, but
  with no test keys available here it has only been verified to compile, to
  pass lint and the suite, and to degrade correctly to the stand-in form when
  unconfigured. Run a Stripe test-mode key through it before trusting it in
  production.
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

## What the plans cost, and why

Premium ($89.99) and Premium Plus ($99.99) are priced at ownership's
explicit direction, a deliberate move away from anchoring against
personal-safety apps (Life360, Noonlight) or the mid-market concierge-app
band this ladder used before. Family has no dictated number, so it keeps
the one rule every round of this ladder has held: seats and price climb
together, never seats-up-price-down (see the seat-ordering test in
`billing.test.ts`, scoped to exclude only Elite) — priced at $149.99 for a
real per-person discount against Premium Plus's own per-seat rate. See the
full rationale in `packages/core/src/billing.ts`.

| | Monthly | Annual | Seats |
|---|---:|---:|---:|
| Free | $0 | $0 | 1 |
| Premium | $89.99 | $899.99 | 1 |
| Premium Plus | $99.99 | $999.99 | 2 |
| Family | $149.99 | $1,499.99 | 6 |
| Elite (entry rung, live) | $1,500.00 | $14,999.99 | 1 |

Premium, Premium Plus and Family carry the identical feature set
(`PLUS_FEATURES` in `billing.ts`) — automatic ride/delivery booking, secure
transport, the full pharmacy-run menu, safe routes, history, group games,
extended SOS contacts, and personal concierge, all included on every paid
tier. The only thing that climbs with price is seats. See the "every paid
tier is now the everything tier" rationale in `billing.ts` for why Premium
no longer gets a lighter version of the bundle.

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
the 20% on concierge tasks (`CONCIERGE_FEE_MARGIN`), the same way Elite's is
commission rather than dues.

### The trade-off, stated

Raising the price sharply lowers how many subscribers it takes to cover the
recurring roster (`docs/budget.md`: **$4,256.67/month**):

| Plan | Break-even subscribers |
|---|---:|
| Premium | 48 |
| Premium Plus | 43 |
| Family | 29 |

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
