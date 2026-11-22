# The agent shop

A shop for AI agents, not people: an agent buys physical goods for its
person, pays in USDC on Solana through [x402](https://x402.org), and the owner
ships the order. There is no account. The agent's wallet pays, and the order
id it gets back is its only way to see the order.

It is **closed** until it is switched on (see "Opening the shop") and it starts
with **an empty catalog**: nothing can be bought until the owner adds products.

The rules (prices, stock, limits, an order's life) are in
`packages/core/src/agent-shop.ts`. The web side and the money are in
`apps/api/src/agent-shop.ts`. Payments go through the same x402 code as the
paywall (`createX402Charger` in `apps/api/src/agent-paywall.ts`).

## What an agent does

Every step is JSON under `/api/shop`. The paywall never charges for `/api/`,
so browsing and quoting are free.

1. `GET /api/shop`: what is for sale, prices, stock, where it ships, how to buy.
2. `POST /api/shop/quotes` with
   `{ "items": [{ "productId": "travel-mug", "qty": 2 }], "shipTo": { "name", "line1", "line2"?, "city", "region"?, "postalCode", "country", "phone"?, "email"?, "instructions"? } }`.
   The shop prices it from the catalog (a price the agent sends is ignored),
   adds shipping, and holds the price for 15 minutes. The answer has the
   total and a `payUrl`.
3. `POST` the `payUrl`. It answers `402` with the price in a `PAYMENT-REQUIRED`
   header: the exact total in USDC, to the owner's wallet.
4. `POST` the `payUrl` again with the signed payment in `PAYMENT-SIGNATURE`.
   It answers `201` with the order: `orderId`, what was bought, the total, and
   the Solana transaction.
5. `GET /api/shop/orders/<orderId>`: status (`paid`, `shipped`, `delivered`,
   `cancelled`, `refunded`) and tracking. The address is never sent back.

Coinbase's x402 client refuses by default to pay more than $1 in one payment.
An agent built on it has to raise that limit (`spendControls`) to buy anything
that costs more.

## Limits

- At most 20 lines, 10 of one product, and $1,000 in one order. Buyers are
  anonymous wallets, so orders stay small.
- **Nothing age-restricted.** With no account there is no way to check who is
  buying, so don't list alcohol, tobacco, vapes, knives, medicine or anything
  else with an age or licence rule.
- Only to the countries the owner lists.

## How money is kept safe

- **The total is the shop's.** The payment has to be for exactly the quote's
  total, to the owner's wallet, for that quote's address. Anything else is
  refused before the facilitator is even asked.
- **Stock is set aside before money moves.** The payment is verified, the
  stock is reserved, and only then is the payment put on chain. If it is
  refused there, the stock goes back and the quote can be paid again.
- **Never charged twice.** Paying a quote that is already paid returns the
  same order without settling anything.
- **A payment whose result is unknown** (the facilitator stopped answering
  mid-way) is held: the quote stays "settling", its stock stays reserved, and
  the agent is told not to pay again. It shows in the owner's
  `stuckPayments`, with the paying wallet. Look the wallet up on a Solana
  explorer, then either
  `POST /api/shop/admin/quotes/<quoteId>` `{ "outcome": "paid", "transaction": "<signature>" }`
  to make the order, or `{ "outcome": "failed" }` to release the stock.
- **Every paid order is logged** before it is saved:
  `Shop: $38.00 paid for quote q_..., transaction ...`. If anything is ever
  missing, search Railway's logs for `Shop:`.
- **Refunds are by hand.** The server holds no keys and cannot send money. To
  refund, send the USDC from your wallet to the order's `payer`, then mark the
  order `refunded` with the transaction in `note`.

## Personal details

The person's name, address, phone and email are encrypted at rest with
`SAFEHUBBY_ENCRYPTION_KEY`, the same key as location history. Only the owner's
view decrypts them. A quote that was never paid is deleted a day after it
expires. An order's address is erased 90 days after it is delivered or
refunded, and the order keeps only what was bought and paid.

## Working the shop (the owner)

Everything takes the admin key in an `x-admin-key` header
(`SAFEHUBBY_ADMIN_KEY`). There is no screen for it yet; these are the calls.

```bash
KEY=<your SAFEHUBBY_ADMIN_KEY>
SITE=https://safehubby.com

# Where you ship, a flat rate per order, and free shipping over $100 (optional).
curl -X PUT $SITE/api/shop/admin/shipping -H "x-admin-key: $KEY" -H 'content-type: application/json' \
  -d '{ "countries": ["US", "PR"], "flatCents": 800, "freeOverCents": 10000 }'

# Add or change a product. Prices in cents. "active": false takes it off sale.
curl -X PUT $SITE/api/shop/admin/products/travel-mug -H "x-admin-key: $KEY" -H 'content-type: application/json' \
  -d '{ "name": "Travel mug", "description": "12 oz, steel", "priceCents": 1500, "stock": 20, "imageUrl": "https://..." }'

# Everything: products, shipping, orders with addresses, stuck payments.
curl $SITE/api/shop/admin -H "x-admin-key: $KEY"

# Ship an order, with tracking the agent will see.
curl -X POST $SITE/api/shop/admin/orders/<orderId> -H "x-admin-key: $KEY" -H 'content-type: application/json' \
  -d '{ "status": "shipped", "tracking": "USPS 9400 ..." }'
```

An order goes `paid` → `shipped` → `delivered`. `paid` can also become
`cancelled`, which puts the stock back. A cancelled order still has the
buyer's money, so refund it and mark it `refunded`. Any order can be
refunded.

## Opening the shop

1. The x402 facilitator, as for the paywall: `CDP_API_KEY_ID` and
   `CDP_API_KEY_SECRET` (see `docs/blog-paywall.md`).
2. `SAFEHUBBY_ENCRYPTION_KEY`, so addresses are encrypted. The shop will not
   open without it.
3. `SAFEHUBBY_ADMIN_KEY`, to run it.
4. `AGENT_SHOP=on`.
5. Deploy. The log says `Agent shop: open at /api/shop.`, or why it is closed.
6. Set shipping, add products.
7. **Before telling anyone, buy something yourself**: a real $1 order, paid
   from a wallet you own, all the way to "shipped". The test network cannot
   prove a real payment arrives.

## Not decided here

- **Sales tax.** Puerto Rico's IVU, and US state sales tax, are not added.
  The site's card payments charge IVU through Stripe Tax; USDC sales do not
  go through Stripe. Ask an accountant before selling.
- **Returns.** There is no returns flow: an agent writes to
  contact@safehubby.com with the order id, and the owner refunds by hand.
- **Notifications.** A new order is a log line and an entry in the owner's
  view; no email is sent yet.
