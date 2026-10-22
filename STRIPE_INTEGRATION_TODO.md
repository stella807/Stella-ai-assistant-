# Stripe Checkout integration — remaining steps

The embedded Stripe Checkout form (`ui_mode: "form"`) lets a member subscribe to a
plan with a card from the Billing screen. This file is the single source of truth
for what is left to do.

## Values to Replace

None. `mode` is `subscription` (plans renew monthly or yearly), and `line_items`
uses an **external product catalog**: each session sends the chosen plan's name,
price and interval as `price_data`, read from the app's own plan table
(`PLANS` in `packages/core/src/billing.ts`). There are no Stripe Price IDs to
create, and a price change in the app reaches Stripe automatically.

| Field | Value |
|-------|-------|
| mode | subscription |
| line_items[0].price_data | Plan name, `unit_amount` from `PLANS`, `recurring.interval` month or year |
| metadata / subscription_data.metadata | `travelerId`, `planId`, `cadence` (for the fulfillment webhook) |

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [apps/api/src/adapters/stripe.ts](apps/api/src/adapters/stripe.ts) (server, `createCheckoutSession`)
- [apps/web/src/app/stripe-appearance.ts](apps/web/src/app/stripe-appearance.ts) (client appearance)

| Parameter | Value |
|-----------|-------|
| ui_mode | form |
| billing_address_collection | auto |
| phone_number_collection | `{ enabled: false }` |
| automatic_tax | `{ enabled: false }` |
| payment_method_collection | always (subscription mode only) |
| submit_type | auto |
| name_collection | individual and business both `{ enabled: true, optional: true }` |
| saved_payment_method_options | `{ payment_method_save: "enabled" }` |
| integration_identifier | custom_embedded_web_0001 |
| API version | 2026-09-30.endive (sent as the `Stripe-Version` header) |

The appearance was changed from Checkout Studio's default white theme to match
Safehubby: `night` theme, navy background `#121a2c`, gold primary `#c99a4c`, white
text, `12px` corners — the same colours as `apps/web/src/styles/base.css`.

## Setup

Set these in Railway (Variables tab) — no `=` sign in the normal form, one per line
in the Raw Editor:

| Variable | Value | Where it is used |
|----------|-------|------------------|
| `STRIPE_SECRET_KEY` | `sk_test_…` then `sk_live_…` | Server only. Never in the browser. |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_…` then `pk_live_…` | Served to the browser by `GET /api/payment/stripe/config`, so no `VITE_` variable or rebuild is needed. |
| `SAFEHUBBY_PUBLIC_URL` | `https://safehubby.com` | The `return_url` Stripe sends members back to. |

No new dependencies: the server talks to Stripe's REST API with `fetch`, and
Stripe.js is loaded from `https://js.stripe.com/dahlia/stripe.js` (never bundled,
as PCI requires).

## New files

- `apps/web/src/components/StripeCheckoutForm.tsx` — the embedded form.
- `apps/web/src/native/stripe-checkout.ts` — loads Stripe.js (Dahlia) on demand.
- `apps/web/src/app/stripe-appearance.ts` — Safehubby's colours for Stripe's forms.

Changed: `createCheckoutSession` in `apps/api/src/adapters/stripe.ts`, the
`POST /api/payment/stripe/checkout-session` route in `apps/api/src/routes.ts`, and
the plan picker on the Billing screen, which opens the form for a paid plan.

## How it works

1. On the Billing screen the member picks a plan and cadence and agrees to the
   renewal terms. With both Stripe keys set, a paid plan then opens Stripe's form
   (without them, the existing PayPal flow runs).
2. The browser calls `POST /api/payment/stripe/checkout-session` with
   `{ planId, cadence }`. The server checks the plan is released, takes its price
   from `PLANS` (never from the browser), finds or creates the member's Stripe
   Customer and creates the Checkout Session, returning `{ client_secret }`.
3. Stripe.js (Dahlia) mounts the form with `initCheckoutFormSdk`, in Safehubby's
   colours. On confirm, Stripe takes the payment and starts the subscription.
4. Stripe returns the member to `/#billing?session_id=…`.

## Testing

Use test-mode keys, then:

| Card | Result |
|------|--------|
| 4242 4242 4242 4242 | Succeeds |
| 4000 0025 0000 3155 | Asks for 3-D Secure |
| 4000 0000 0000 9995 | Declined (insufficient funds) |

Any future expiry, any CVC, any ZIP.

## Next steps

1. **Fulfillment webhook (not built yet).** Safehubby's plan only changes inside the
   app when its own subscribe flow runs. Add a webhook endpoint for
   `checkout.session.completed` and `invoice.paid` / `customer.subscription.deleted`,
   verified with `STRIPE_WEBHOOK_SECRET`, that sets the member's plan. Until then,
   check new subscriptions in the Stripe Dashboard.
2. **Avoid double billing.** The app's existing renewal sweep also bills plans
   (as Stripe invoices on a saved card). Once Checkout subscriptions are live, skip
   members who have an active Stripe subscription in that sweep.
3. **Tax:** `automatic_tax` is off here as configured. Turn it on in Checkout Studio
   after registering in Stripe Tax.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
