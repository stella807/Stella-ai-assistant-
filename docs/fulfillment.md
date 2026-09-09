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

## 2. Delivery — Uber Direct or DoorDash Drive

Both dispatch a courier for **a merchant's own goods**. Safehubby therefore has
to be the merchant of record for the basket, which means a supplier agreement
with whoever stocks it — a pharmacy chain, a convenience partner, or your own
inventory. That is the real work here; the API is the easy half.

```bash
# Uber Direct
railway variables --set "UBER_DIRECT_TOKEN=..." --set "UBER_DIRECT_CUSTOMER_ID=..."
# or DoorDash Drive
railway variables --set "DOORDASH_DRIVE_JWT=..."

# Both need a pickup point — the store the courier collects from.
railway variables --set "FULFILLMENT_PICKUP_ADDRESS=..."
```

Uber Direct wins when both are configured.

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
