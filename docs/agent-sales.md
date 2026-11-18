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

## The site pass: $8.99 a visit for AI crawlers to read the website

A visitor that names itself as an AI crawler or agent (GPTBot, ChatGPT-User, OAI-SearchBot,
ClaudeBot, Claude-User, PerplexityBot, CCBot, Bytespider, Meta-ExternalAgent and a few more; the
list is in `apps/api/src/site-pass.ts`) is asked for **$8.99 per visit** (`X402_SITE_PASS_PRICE`) to read
the website's pages. A **visit lasts 1 hour** (`X402_SITE_PASS_MINUTES`) and covers as many pages as it
likes. The payment answer carries an `X-Safehubby-Pass` header to send back on every request during the
visit. When the hour is over, it pays again. The payment goes through the same checks as the store:
verified, then settled, and only then is the page served.

Never charged: people with a browser, **search engines** (Googlebot, bingbot, DuckDuckBot, Applebot
are not in the list), the **blog** (`/blog`, `/es/blog`), the agent store, the whole API, `robots.txt`,
`sitemap.xml`, `llms.txt`, the chat box script, and any file such as a script or an image.

It is on whenever paid access is on. Turn it off alone with `X402_SITE_PASS` = `off`.

Limits, said plainly:
- It goes by the name a visitor gives itself. A crawler that calls itself a browser reads the site free.
- AI search tools that obey it will no longer read the website's pages, only the blog. That means
  fewer mentions of the site in their answers. The blog stays open so they can still cite it.
- A crawler that reads thousands of pages pays once an hour, so the price is per visit, not per page.
- Every payment is real USDC once the real-money switch is on.

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
private key, so it cannot send money. A product's answer is sent only after the
payment is verified and settled. An unknown article or an empty question is
refused before any money moves.

### Going live with real money (PayAI, USDC on Base)

PayAI's facilitator settles the payments. **No PayAI account is needed to start:**
it settles the first 1,000 payments per receiving wallet for free, on mainnet too.
Then credits cost $1 per 1,000 payments (gas plus 30%, never a share of what the
buyer pays). On the Railway **safehubby-app** service set:

- `X402_FACILITATOR` = `payai`
- `X402_NETWORK` = `eip155:8453` (Base)
- `X402_ALLOW_MAINNET` = `yes`
- `X402_PAY_TO` = a wallet address you control (check every character)

The portal (Money, Sales to AI agents) then says **LIVE: real USDC**. Turn it back
to test money by removing `X402_NETWORK` and `X402_ALLOW_MAINNET`.

Real money is refused unless all three switches are set, and the test-only
x402.org service is refused for real money. The USDC arrives in your wallet,
not in Railway or Stripe: you move it from there.

After the 1,000 free payments, create a key in PayAI's merchant dashboard
(merchant.payai.network) and add `PAYAI_API_KEY_ID` and `PAYAI_API_KEY_SECRET`.
The server signs with them locally and never sends the secret.
