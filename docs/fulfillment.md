# Making it automatic

"Automatic" means Safehubby books the ride and dispatches the delivery itself,
with no hand-off and no app-switching. That is possible — through the
**business** APIs, not the consumer ones.

Every adapter has three states, and the state is visible in the app rather than
hidden: `automatic` when credentials are present, `handoff` when they are not,
`unavailable` where the provider does not operate. Nothing ever claims a
booking it did not make. A user who believes a car is coming and is wrong is
worse off than one who knows they have to tap twice.

Check what is live at any time:

```bash
curl -b cookies https://<your-app>/api/fulfillment/status
```

## 1. Rides — Uber for Business

The consumer Ride Request API is closed. **Uber for Business "rides for others"**
is not: an organisation books and pays for a ride on someone else's behalf.
This is the successor to Uber Central and is exactly the shape this needs.

1. Create an organisation at [business.uber.com](https://business.uber.com).
2. Ask your account team to enable **guest rides / rides for others**. This is
   not self-serve; expect a conversation about volume and use case.
3. Create an OAuth client and get a token with the guest-rides scope.

```bash
railway variables --set "UBER_BUSINESS_TOKEN=..." --set "UBER_BUSINESS_ORG_ID=..."
```

Your organisation is billed for the ride, so you need to bill the user. That
float is the reason Premium Plus costs what it does.

## 2. Supplies — Instacart, with Walmart as the fallback

**Instacart is the one to set up.** It is the only provider here with a
self-serve key and a real cart-building API, and it already has the stores, the
shoppers and the checkout — so Safehubby does not have to become a merchant or
hold stock.

The **Shopping Lists API** takes our basket as line items and returns a link
that opens Instacart with everything already in the cart. The customer taps once
to check out. That is the automatic part that matters: the basket is assembled
by the app rather than typed by someone at 1am. Payment still happens in their
own Instacart account, which keeps the consent rule from `care-package.ts`
intact — Safehubby prepares, the customer confirms, and no card of theirs is
ever charged by us.

```bash
# Self-serve at docs.instacart.com — no partnership call required.
railway variables --set "INSTACART_API_KEY=..."
railway variables --set "PUBLIC_APP_URL=https://<your-app>.up.railway.app"
```

`PUBLIC_APP_URL` is the link-back Instacart shows to bring people home again.

### Walmart

Walmart publishes **no consumer ordering API**, and its terms forbid scraping
the catalogue. Two things are available:

- **Content Provider (affiliate) API** — product data and tracked links that
  earn commission. Self-serve-ish, needs approval as a content provider. This
  is a real revenue line, and it replaces the ride commission that turned out
  not to exist.
- **AddToCart proxy** — can add items to a Walmart cart, but needs approval and
  "a sound business case".

```bash
railway variables --set "WALMART_PUBLISHER_ID=..."   # from the affiliate programme
```

Without it the app still links to Walmart, just untracked — and says so in the
response (`tracked: false`) rather than implying a commission that is not being
earned.

### Couriers (only if you hold stock)

`uberDirect` and `doordashDrive` remain implemented for the day Safehubby
stocks its own baskets. Both move **a merchant's own goods**, so they need a
supplier agreement plus `FULFILLMENT_PICKUP_ADDRESS`. Instacart is tried first;
these are for later.

### If Instacart's schema differs from the docs

The request and response are mapped in one place in
`apps/api/src/adapters/grocery.ts`, built from the documented Shopping Lists
shape. It has not been run against a live key here, so verify these before
launch — the fix is a few lines, not a rewrite:

| | Expected |
|---|---|
| Endpoint | `POST /idp/v1/products/products_link` |
| Auth | `Authorization: Bearer <INSTACART_API_KEY>` |
| Request | `{ title, link_type: "shopping_list", expires_in, line_items: [{ name, quantity, unit, display_text }], landing_page_configuration }` |
| Response | `{ products_link_url }` |

## 3. Secure transport

A ride whose driver is a licensed protection professional. Kept as its own port
rather than another row in the ride list, because it is a different product with
different law behind it.

```bash
railway variables \\
  --set "SECURE_TRANSPORT_PROVIDER=Blackwolf" \\
  --set "SECURE_TRANSPORT_API_BASE=https://..." \\
  --set "SECURE_TRANSPORT_API_KEY=..."
```

**The adapter is provider-agnostic on purpose.** Blackwolf is the intended
provider, but I could not verify that they publish a partner API, so nothing is
written against a guessed endpoint shape. Point `SECURE_TRANSPORT_API_BASE` at
whatever they — or another licensed operator — actually give you.

The adapter expects three endpoints. If theirs differ, the mapping in
`apps/api/src/adapters/fulfillment.ts` is a small edit rather than a rewrite:

| Call | Expected | Returns |
|---|---|---|
| Coverage | `GET /coverage?lat=&lng=` | `{ "covered": true }` |
| Quote | `POST /quotes` | `{ "fare_cents", "currency", "eta_minutes" }` |
| Book | `POST /rides` | `{ "id", "fare_cents", "eta_minutes", "tracking_url", "driver" }` |

### Things to settle before switching this on

**Coverage is checked before the option is ever shown.** Armed protective
service is licensed state by state in the US. Licence classes differ,
reciprocity is patchy, and an operator legal in one state may be committing a
felony in the next. The adapter fails closed: an unreachable provider means not
covered, because offering a ride that cannot legally arrive is worse than
offering nothing — someone stops looking for another way home.

**The passenger is told before they book.** The disclosures are shown and must
be acknowledged; the API rejects a booking without it. Someone who did not
realise their driver is armed is in a situation they did not consent to, and
that is not a footnote.

**Insurance and liability are yours, not the app's.** Dispatching armed
personnel to a member of the public carries exposure that ordinary rideshare
does not. Get this in front of a lawyer and an insurer before it goes live, not
after.

**It is not bundled into a subscription.** A protective-service trip costs
multiples of a normal ride. Folding it into a monthly price would mean either
rationing it — rationing the safest way home is indefensible on this product —
or charging everyone for what few will use. It is billed per trip at the
provider's rate, and only the Family tier can reach it.

**App Store framing.** Do not describe this as security, protection, or an
emergency service in the store listing; describe it as transport with a licensed
professional driver. Apple's 1.4.1 scrutiny applies to anything that reads as a
safety guarantee, and the app already states plainly that it cannot dispatch an
ambulance.

## What the pricing assumes

| Plan | Monthly | Annual | Automatic? |
|---|---|---|---|
| Free | — | — | No |
| Premium | $14.99 | $152.88 | No |
| Premium Plus | $29.99 | $305.88 | Rides + delivery |
| Family | $49.99 | $509.88 | Everything, plus secure transport |

Rides and deliveries are **passed through at the provider's price** on top of
the subscription. Bundling them would mean capping how often someone can get
home safely, which is not a cap this product should have.
