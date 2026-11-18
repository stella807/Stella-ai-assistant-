# Selling to AI agents (x402)

Other AI agents can pay in USDC, per request, for what Safehubby can deliver by
software. Everything is off until `X402_ENABLED` is `true`, and it uses test
money (Base Sepolia) until the owner decides otherwise.

- Free catalog: `GET /api/agent/catalog`
- Free list of blog articles: `GET /api/agent/blog`
- Email, free, for agents and the people they work for: **contact@safehubby.com**. It is in the catalog (`contact`),
  in every request for payment (the 402's description) and at the top of `robots.txt`, because agents can send email
  but not WhatsApp. It goes to the owner's inbox; nothing is sent automatically.

| Product | Address | Price |
|---|---|---|
| Plans and prices facts | `/api/agent/facts?q=` | $0.01 |
| One blog article as clean text | `/api/agent/blog/{slug}?lang=en` | $0.01 |

Add `?info` to any product address for a free description. Prices can be changed with
`X402_PRICE_FACTS` and `X402_PRICE_BLOG` (for example `$0.02`).

## The site pass: $8.99 a visit for AI crawlers to read the website

A visitor that names itself as an AI crawler or agent (GPTBot, ChatGPT-User, OAI-SearchBot,
ClaudeBot, Claude-User, PerplexityBot, CCBot, Bytespider, Meta-ExternalAgent and a few more; the
list is in `apps/api/src/site-pass.ts`) is asked for **$8.99 per visit** (`X402_SITE_PASS_PRICE`) to read
the website's pages. A **visit lasts 1 hour** (`X402_SITE_PASS_MINUTES`) and covers as many pages as it
likes. The payment answer carries an `X-Safehubby-Pass` header to send back on every request during the
visit. When the hour is over, it pays again. The payment goes through the same checks as the store:
verified, then settled, and only then is the page served.

Also asked to pay, because they hide what they are:
- scripts and headless browsers that give themselves away (`python-requests`, `Go-http-client`,
  `HeadlessChrome` and similar; plain `curl` and `wget` are left out because people and health checks use them);
- a "browser" that sends **neither a language nor a Sec-Fetch header**, which every real browser does
  (an old iPhone sends a language, so it is let in);
- a visitor that says it is **Googlebot or bingbot** but whose address does not belong to Google or Microsoft
  (checked the way the engines publish: the address's name must end in their domain and point back to the same
  address). If that check cannot be made (a DNS outage), the visitor is let in, so the site's ranking is never hurt;
- optionally, an address that loads more pages than `X402_SITE_PASS_PAGE_LIMIT` in ten minutes (off by default,
  because many phones in Puerto Rico can share one address).

A crawler that copies a real browser perfectly, headers included, still reads the site free. If the charge
catches a real person by mistake, the payment request tells them to write on WhatsApp.

Never charged: people with a browser, **real search engines** (the real Googlebot and bingbot, checked
as above), link previews (WhatsApp, iMessage, Slack, Telegram), the **blog** (`/blog`, `/es/blog`), the agent store, the whole API, `robots.txt`,
`sitemap.xml`, `llms.txt`, the chat box script, and any file such as a script or an image.

It is on whenever paid access is on. Turn it off alone with `X402_SITE_PASS` = `off`.

Limits, said plainly:
- It goes by the name a visitor gives itself. A crawler that calls itself a browser reads the site free.
- AI search tools that obey it will no longer read the website's pages, only the blog. That means
  fewer mentions of the site in their answers. The blog stays open so they can still cite it.
- A crawler that reads thousands of pages pays once an hour, so the price is per visit, not per page.
- Every payment is real USDC once the real-money switch is on.

## Signals: what the owner learns from who asks and who pays

The owner portal (Money, **Signals: what visitors do**) shows the numbers that say what to change. They are counted quietly
as it happens, and `GET /api/master/signals` (owner, money scope) returns them:

- **Asked and paid, per product:** how many times a price was shown and how many times it was paid, for the last 30 days
  and the last 7. A product that is asked for often and never paid points at the price, or at buyers that cannot pay.
- **Which crawlers hit the paywall:** by the name a crawler gives itself (`gptbot`, `claudebot`) or a fixed label
  (`python-requests`, `browser-lookalike`, `fake-googlebot`, `busy-address`).
- **What agents search for**, and **searches with no answer** (a vendor or fact we could add).
- **The chat box:** how many questions, and how many it sent to a person.
- **Buyers:** how many different payers, and how many came back, from the sales record.

Private by design: only counts. No addresses, no browser strings, no names. The words an AI agent searched for are kept
lowercase, at most 100 characters, at most 200 different ones a day (so a flood of junk searches can fill a day's list: the numbers are a guide, not proof). **The words a person types in the chat box are never
kept, only whether it could answer.** Days older than 90 are forgotten.

Limits, said plainly: "asked" counts requests that were shown a price, not different visitors (a crawler that ignores the
price and keeps fetching counts each time). With only a few requests the numbers say nothing; the page says so until there
are at least ten.

## The vendor list is not for sale

Safehubby's vendor research (event vendors, hotel programs, airport VIP services) is what clients pay for, so it is
not sold to AI agents in any form. A vendor lookup was sold for a short time and has been removed: `/api/agent/vendors`
no longer exists. Agents who want a vendor are told to email contact@safehubby.com, which makes them a lead instead of
a way around Safehubby. The owner's own vendor records in the portal are untouched.

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
