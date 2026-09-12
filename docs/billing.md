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

## The Elite tier — built, and held for a later release

`isEnabled("elite-tier")` is **off** (features.ts), so Elite is absent from
`GET /api/catalog` and `POST /api/subscription` refuses it with the flag's own
note. It lives in `PLANS` rather than a branch so it stays compiled, typed and
tested meanwhile — the same "ships dark rather than being deleted and
rewritten" reasoning party supply already follows.

**$249/month, or $2,499/year.** Priced against what the market actually
charges:

| Competitor | Annual |
|---|---|
| Quintessentially, entry ("Devoted") | ~$2,500–$3,800 |
| Quintessentially, Elite | ~$19,000–$31,700 |
| Established luxury concierge firms | $10,000–$50,000 |
| Ultra-premium engagements | $50,000–$100,000+ |
| **Safehubby Elite** | **$2,499** |

So Elite undercuts even the cheapest tier of the best-known name in the
category while carrying the high-end catalogue. That is only sustainable
because **the luxury desk earns on the supplier side, not from the
membership**: a 5–8% commission on one $50,000 jet charter is $2,500–$4,000,
more than a year of membership. The subscription buys access and the
lifestyle manager's time; the bookings pay for the desk.

### What's in it

`ELITE_ONLY` in billing.ts, deliberately withheld from every everyday tier so
a $69.99 Family plan is never silently handed a private jet desk:

| Feature | Market rate it replaces |
|---|---|
| `private-aviation` | Brokers take 5–15% of charter (up to 30%); Safehubby targets 5–8% |
| `yacht-charter` | Typically project fees or retainers against scope |
| `luxury-property` | Villa and property sourcing, same retainer shape |
| `event-production` | Planners charge 10–20% of budget, or $2,000–$50,000 flat |
| `premium-hospitality` | Hotel advisors earn 5–10% supplier commission (Virtuoso 20–25%) |
| `lifestyle-manager` | Luxury specialists bill $200–$500+/hour |

### Why the feature list is derived, not hand-written

`PLUS_FEATURES` is `ALL_FEATURES.filter((f) => !ELITE_ONLY.includes(f))`. That
keeps the guarantee that matters: `EVERY_FEATURE`'s
`satisfies Record<Feature, true>` still makes adding a `Feature` a compile
error until it's listed, and the author then has to decide whether it's
Elite-only or lands on the everyday tiers. Nothing can be added and quietly
forgotten in either direction.

### Three things to settle before turning the flag on

1. **The money flow does not reach this far.** `CONCIERGE_MAX_CAP_CENTS` is
   $300 and every task rides a single-use card capped at exactly that. A jet
   is $20,000–$100,000+. These bookings need the customer paying the supplier
   directly with Safehubby taking commission, which is a different flow from
   anything in `payment.ts` today — so they are a new kind of task, not new
   entries in `CONCIERGE_CATEGORIES`.
2. **Private aviation carries a legal duty.** [14 CFR Part 295](https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-295)
   requires an air charter broker to disclose, *before contracting*: the air
   carrier actually operating the flight, the capacity the broker acts in, and
   the amount of liability insurance carried — or that none is. No licence or
   registry is required, but those disclosures are mandatory. Shape it like
   `SECURE_TRANSPORT_DISCLOSURES`, which already solves exactly this problem.
3. **Commission needs relationships that don't exist.** Hotel commission needs
   a host agency or consortium; jet commission needs operator agreements. Until
   they exist every one of these earns $0, which is the real reason the flag is
   off rather than a release-date preference.

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

## Endpoints

See `docs/api.md` for the full surface. The billing ones:

| Route | Does |
|---|---|
| `GET /api/billing` | The card, the subscription, the statement and the charge history, together |
| `POST /api/subscription` | Start or change a plan; records the line and picks the rail from `platform` |
| `POST /api/subscription/cancel` | Cancel, keeping access to the end of the period |
| `POST /api/billing/charges/:chargeId/confirm` | Settle a store-rail line against its receipt |

`platform` on `POST /api/subscription` is self-reported, and has to be: only the
client knows whether it is the App Store build. A client that lied would be
routing an in-app subscription around Apple's billing, which is the operator's
compliance problem — it cannot take a user's money twice or reach anyone else's
data. It is stored on the subscription so the rail is auditable afterwards.
