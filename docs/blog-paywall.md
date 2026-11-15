# AI agents pay to read the blog

People read the blog free. AI crawlers and agents (GPTBot, PerplexityBot
and the rest, except Claude's, and plain tools like curl or python-requests) pay
in USDC on Solana, through [x402](https://x402.org), to the owner's wallet:

| Page | Price | Address |
|---|---|---|
| A whole article | $0.05 | `/blog/<slug>`, `/es/blog/<slug>` |
| A preview: title, summary, first paragraph | $0.001 | the same, with `?preview=1` |
| The blog's index and the 404 page | free | `/blog`, `/es/blog` |

The code is `apps/api/src/agent-paywall.ts` (who pays, the price, the payment
check) and `apps/api/src/adapters/x402-facilitator.ts` (Coinbase's facilitator).

## How a payment works

1. The agent asks for an article and gets `402 Payment Required`. The
   `PAYMENT-REQUIRED` header (base64 JSON, x402 version 2) names the price,
   USDC on Solana, the owner's wallet and the facilitator's fee payer. The body
   says the same in words and offers the preview.
2. The agent signs a USDC transfer and asks again with it in `PAYMENT-SIGNATURE`.
3. The server checks the payment is for exactly this page's price, has the
   facilitator verify it and put it on chain, and only then sends the page,
   with the receipt in `PAYMENT-RESPONSE`. The money goes straight to the
   wallet; the server never holds it.

Each paid read writes one line to the log: `Blog: $0.05 paid for /blog/...,
transaction ...`. Look the transaction up on any Solana explorer.

## Who reads free

- **People.** Anyone whose browser says it is a browser.
- **Search engines and link previews** (Google, Bing, Apple, DuckDuckGo,
  WhatsApp, Facebook, Slack...). Charging them would take the blog out of
  search and break shared links.
- **Claude.** Every one of Anthropic's agents and crawlers (Claude-User,
  ClaudeBot, Claude-SearchBot), on the owner's say, so Claude can read and
  check the blog it helps write. A visitor is taken to be Claude by its
  User-Agent alone, so a scraper calling itself Claude also reads free. If
  that is ever abused, drop the `CLAUDE` list in `agent-paywall.ts` and use
  the key below instead.
- **The owner's key.** `?access=<BLOG_ACCESS_KEY>` on an article's address, or
  the `x-safehubby-access` header. This is how the owner, or Claude working
  for them, checks a live post. Keep it private; change it in Railway if it
  leaks, and the old one stops working on the next deploy.

Who is who comes from the visitor's User-Agent, so the paywall stops honest
agents, not one that pretends to be a browser. That is the same line
robots.txt draws.

## Turning it on

1. **A wallet.** Agents pay USDC on Solana to
   `HCuw5TGE98YKdATjDaqVGKou9HPt1htiZVMQdiqYyaut` (in the code as
   `OWNER_SOLANA_WALLET`; `X402_PAY_TO` replaces it). The wallet needs a USDC
   account, which it gets the first time it receives USDC; without one every
   payment is refused (`recipient_ata_missing`).
2. **A Coinbase Developer Platform API key** at portal.cdp.coinbase.com
   (API keys, "Secret API key"). Set `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`
   in Railway. The key cannot move money; the facilitator only puts on chain a
   transfer an agent already signed.
3. **`BLOG_ACCESS_KEY`**: 24 or more random characters
   (`openssl rand -hex 24`).
4. Deploy. The log says
   `Blog paywall for AI agents: on, Solana mainnet, paid to ...`.

To try it first with test money: `X402_NETWORK=solana-devnet` and
`X402_FACILITATOR_URL=https://x402.org/facilitator`, no CDP key needed.

## Cloudflare

safehubby.com is behind Cloudflare, which is fine as long as Cloudflare does
not cache the blog's HTML (it does not by default). Do not add a "Cache
Everything" rule for `/blog`: a cached page would be handed to agents without
the paywall. Cloudflare's own AI-crawler blocking ("Block AI bots", AI Crawl
Control) should stay off, or crawlers are turned away before they ever see the
price.
