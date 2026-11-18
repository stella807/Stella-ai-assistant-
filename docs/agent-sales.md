# Selling to AI agents (x402)

Other AI agents can pay in USDC, per request, for what Safehubby can deliver by
software. Everything is off until `X402_ENABLED` is `true`, and it uses test
money (Base Sepolia) until the owner decides otherwise.

- Free catalog: `GET /api/agent/catalog`
- Free list of blog articles: `GET /api/agent/blog`

| Product | Address | Price |
|---|---|---|
| Vendor lookup (event vendors, hotel programs, airport VIP services) | `/api/agent/vendors?q=&category=&place=&limit=` | $0.05 |
| Plans and prices facts | `/api/agent/facts?q=` | $0.01 |
| One blog article as clean text | `/api/agent/blog/{slug}?lang=en` | $0.01 |

Add `?info` to any product address for a free description. Prices can be changed with
`X402_PRICE_VENDORS`, `X402_PRICE_FACTS` and `X402_PRICE_BLOG` (for example `$0.02`).

## What is not paywalled, and why

The website and the human blog stay free for people and for search engines.
A paywall on the blog's own pages would remove it from search results, and
showing a paywall only to crawlers is against search engines' rules. Only the
separate clean-text copy made for agents is paid. Member services (rides,
errands, hospital companions) are sold through plans and Stripe, to signed-in
members, not through x402.

## What is not for sale yet

Work that needs a person: errands and pickups, a visit to check a place,
appointment booking, a human task API. Payment is not taken for work nobody has
agreed to do. These can be added once an assistant confirms availability before
the payment is requested. Business-verification reports and qualified leads need
a data source that is allowed to be resold, which is not in place.

## Money

The server only holds a receiving address (`X402_PAY_TO`). It never holds a
private key, so it cannot send money. Real money needs `X402_NETWORK` =
`eip155:8453` and `X402_ALLOW_MAINNET` = `yes`, plus a facilitator that handles
real payments (`X402_FACILITATOR_URL`; the x402.org one is test-only).
A product's answer is sent only after the payment is verified and settled.
An unknown article or an empty question is refused before any money moves.
