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
| `packages/core/src/payment.ts` | The card on file and pre-authorization holds |
| `packages/core/src/billing.ts` | The plan catalogue and what each plan unlocks |
| `apps/api/src/billing.ts` | `renewDueSubscriptions` — the sweep that turns periods over |

`wallet.ts` and `subscription.ts` are pure and fully tested; nothing in either
talks to a processor.

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

## What is not wired yet

Stated plainly, because the code says the same thing where it matters:

- **No card processor.** A card-rail charge settles inline the moment it is
  recorded. Stripe's manual-capture PaymentIntents map onto `authorizeHold` /
  `captureHold` / `releaseHold` exactly; that swap is contained to
  `apps/api/src/routes.ts` and `apps/api/src/billing.ts`.
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
