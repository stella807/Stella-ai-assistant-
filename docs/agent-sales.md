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
| Weekly digest: newest and lately updated articles with dates, plus current plans and prices | `/api/agent/digest` | $0.05 |
| Brief: one page to forward to a person (what Safehubby does, plans, safety rules, how to reach us) | `/api/agent/brief` | $0.05 |
| Airport directory: name, code, city and country for the cities Safehubby covers (names and codes only, nothing about any service) | `/api/agent/airports?q=&country=&limit=` | $0.01 |
| Checklists to hand to a person, English and Spanish: a day at the hospital with a parent, arriving at an airport with an older relative, questions to ask before hiring a concierge (general information, not medical or legal advice) | `/api/agent/checklists/{slug}?lang=en\|es` (list free at `/api/agent/checklists`) | $0.02 |
| Books as PDF files: traveling with an older parent, hiring and working with a concierge, visiting Puerto Rico, delegating real-world tasks to human assistants, and building a local concierge business (18 to 21 pages each; each opens with a quick reference for agents; general information) | `/api/agent/books/{slug}` returns the PDF (list free at `/api/agent/books`; needs a site pass first) | $0.50 |
| Currency check: is an answer you hold still current? Give the SHA-256 of the response body; get a signed `current` or `changed` | `/api/agent/currency/{sha256}` | $0.02 |
| Request check: send a request you are about to give a person (JSON); get what is missing, stop signs, what only the person may decide, and plain text to send | `/api/agent/check?request={JSON}` | $0.03 |
| Alerts feed: what changed since you last asked, and the hurricane-season calendar | `/api/agent/alerts?since=&lang=` | $0.02 |
| Checked today: what a person from Safehubby saw on the ground, dated and attributed, sold only while fresh | `/api/agent/checked?q=` | $0.10 (charged each time, even with a pass) |
| Live answers: storm and flood alerts for Puerto Rico (National Weather Service) and US and Puerto Rico airport delays (FAA), read when asked, dated, source named | `/api/agent/live?q=` | $0.10 (charged each time, even with a pass) |
| Approval page: plain text an agent shows the person it works for, with the live prices (free, no pass needed) | `/api/agent/approval?lang=en\|es` | free |

Add `?info` to any product address for a free description. Prices can be changed with
`X402_PRICE_FACTS` and `X402_PRICE_BLOG` (for example `$0.02`).

## The site pass: $2.99 a visit for AI crawlers to read the website

**A pass includes the whole store.** During the visit, plans and prices facts, blog articles as clean text, the digest,
the brief, the airport directory, the checklists and the currency check answer with no further payment: send the same `X-Safehubby-Pass` header. Bought one at a time they cost
cents each; the pass is the cheap way in. The digest and brief are built only from what Safehubby has published (articles
with their dates, the live plan list). There is no vendor list in any of it. Anything that needs a person is not
included. There is no cap per visit yet; if one agent abuses it, add one.

A visitor that names itself as an AI crawler or agent (GPTBot, ChatGPT-User, OAI-SearchBot,
ClaudeBot, Claude-User, PerplexityBot, CCBot, Bytespider, Meta-ExternalAgent and a few more; the
list is in `apps/api/src/site-pass.ts`) is asked for **$2.99 per visit** (`X402_SITE_PASS_PRICE`; it was $8.99, and agents on Moltbook said that was steep) to read
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

## The books

Five original guides, each opening with an agent quick reference (rules, a JSON request to fill in, stop signs), written for this store and sold as PDFs: `books/src/*.md` is the text and `node apps/api/scripts/build-books.mjs`
builds `books/*.pdf` and `books/manifest.json` (needs Playwright's Chromium; the PDFs are committed so the server needs no browser).
A test fails if a book's text changes without a rebuild, and keeps out company names, phone numbers, links and promises: only
general advice and our own email. **The pass is the access to buy them, and each book costs extra:** `X402_PRICE_BOOKS` (default $0.50). A book address asked for without a pass is answered with a request to buy the pass; when the pass is paid it is issued with a note saying to repeat the request, and the book is then charged for on top. The books are not free with the pass. A paid answer is the PDF itself,
signed over its exact bytes, and the free list gives each file's sha256. To add a book, write the markdown, rebuild, and run the tests.

**Agents only.** The books and their list are not shown to a person opening them in a browser: such a request gets a plain
403 that says the books are for AI agents and points to the blog and the email, and nothing is charged or settled, even if a
pass or a payment header is sent. A "person in a browser" is a request that says it is navigating to a document, or asks for a
web page in a language (`looksLikePersonInBrowser` in `visitor-kind.ts`). Responses carry `X-Robots-Tag: noindex`, the files are
not under the public web folder and not in the sitemap. Limits, said plainly: it is a filter, not a lock. Someone can set headers
by hand, a person with a wallet can pay, an agent that drives a real browser looks like a person (it should use plain HTTP), and
an agent can pass a PDF on to a human.

## Signed answers

Every answer from the paid items (facts, blog copies, digest, brief, airports, checklists), whether paid for or covered by
a pass, carries an `X-Safehubby-Signature` header: `keyId`, `alg="ed25519"`, `created` and `sig`. The public key is free at
`/api/agent/key` (and its fingerprint is in the catalog under `signing`). The signed message is four lines: `safehubby-v1`,
the path and query that were asked, the `created` time, and the SHA-256 (hex) of the exact response bytes. An agent that checks it
knows the answer is unchanged, was made at that time, and answers the question it asked. This proves where an answer came
from; it does not make the content true beyond what Safehubby publishes. The private key is made on first use, kept in the
database (`signingKey`) and never sent. If the database is lost a new key is made and the key id changes, so verifiers notice.

### After the pass ends, and when the key changes

A signature stays valid after a pass ends: keep the answer and its header and check them any time with the free public key. The
public key and every earlier public key are listed at `/api/agent/key` (`retired`), so an old answer still verifies after a key
change. Only public halves are ever shown. Set **`SIGNING_SEED`** in Railway (any random secret of at least 32 characters) and the
key is made from it, so it also survives a rebuilt database; the key in use before is moved to the retired list, not lost. Keep
that secret like a password and never paste it in chat.

**The currency check** is the one paid part of this. A signature proves where an answer came from and when. It cannot say
whether it is still what we publish. Give `/api/agent/currency/{sha256}` the SHA-256 (hex) of the exact bytes you were sent and
the reply, itself signed, says `current` (the same request gives the same answer today) or `changed`. The store keeps, for each
answer it signs, only a fingerprint, the product, the address asked and the time (`receipts`, the latest 20,000), never a payer or
an address. A fingerprint it never issued, or that is not 64 hex characters, is answered 404 and not charged. Price:
`X402_PRICE_CURRENCY` (default $0.02), free with a pass. Verifying a signature stays free and always will: a check that cost
money could not be trusted.

```js
import { createHash, createPublicKey, verify } from "node:crypto";
const msg = `safehubby-v1\n${path}\n${created}\n${createHash("sha256").update(bodyText).digest("hex")}`;
const ok = verify(null, Buffer.from(msg), createPublicKey(publicKeyPem), Buffer.from(sig, "base64"));
```

## The owner's NFTs

The free catalog has an `nfts` entry that points agents to the owner's collection on Rarible
(`NFT_URL`, default `https://rarible.com/thesmurfetfuturenft`). They are sold on Rarible, never through this server, which
holds no wallet. A free gallery at `/api/agent/nfts` (pictures at `/nft/*.jpg`, served from `apps/web/public/nft`) shows the 7
pieces the owner says were made with ChatGPT; the others are on hold. The note says the pieces are made with AI, are art and not an investment, and promises no value. Nothing
is posted anywhere about them without the owner's go. Only pieces the owner has shown the rights to should be listed
(see `/home/user/cryptic-future-nft/README.md`).

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

## The request check, the alerts feed and the approval page

**Request check** (`src/request-check.ts`). Applies the rules in the book *Delegating Real-World Tasks* to a request an agent is about to give a
person. It is deterministic and keeps nothing: the signals count that a check happened, never what was in it. A request that cannot be read
(not JSON, not an object, a field over 500 characters, over 2,000 characters in all) is refused with 400 before any payment moves.
It accepts the field names the books use (`what`, `where_from`, `where_to`, `confirm_with`) as well as the short ones.

**Alerts feed** (`src/notices.ts`). For many agents at once: nothing is stored per agent. Each agent passes the `asOf` from its last answer as
`since`. Notices are written by hand in `NOTICES` with the date they took effect (add one when something an agent would care about changes),
plus the Atlantic hurricane-season calendar computed from the date. They are notices about what Safehubby publishes, never weather
forecasts or warnings, and the feed says so. An unreadable `since` is refused with 400 before any payment.

**Approval page** (`src/approval-pack.ts`). Free. Built from the live prices so it cannot disagree with what is charged. It gives email
only, never a phone number, and promises nothing about results.

**One book can cost more than the rest.** A book's source may carry `<!-- price: $0.05 -->`; the build writes it into the manifest as `price`, and that
book is charged (and asked for in the pass reply) at that price. Books without one use `X402_PRICE_BOOKS` (default $0.50). Today only
*Building a Local Concierge Business* has its own price ($0.05). It describes the parts of such a business in general terms for any city and gives no
vendor names, settings, pay rates or screening rules, on purpose.

## Checked today

`src/local-checks.ts`. A person who was there records what they saw (open, in stock, a line, something else) with the time, their first name,
and whether they kept a photo or a receipt (the photo is not stored). Each kind goes stale on its own: a line after 45 minutes, stock after 3 hours,
opening hours after 6; the person may set a shorter time, never longer than a day. A stale check is never sold. A check older than 7 days is
refused when recorded, and checks are forgotten after 14 days. Links, email addresses and phone numbers are refused. Matching needs at least half
of the question's words, and at least one that names the place or thing, so "clinic open" does not return a pharmacy. Spanish place words match
too. No fresh match: 404 before payment, and the words are kept in Signals as something agents wanted and did not get. It is `alwaysPaid`: charged
even to a holder of a pass, and the pass is not needed. Record checks in the owner portal (Money tab) or with `POST /api/master/local-checks`.
The record of what agents said they would pay for is in `docs/agent-demand.md`.

## Live answers (nobody has to do anything)

`src/live-feeds.ts`. Free public sources, read on request: the National Weather Service's active alerts for Puerto Rico, NOAA's GOES-East
(GOES-19) satellite pictures of Puerto Rico (the time each latest picture was made, from its Last-Modified header, and its official address;
the picture is not downloaded), the National Hurricane Center's active storms (with distance from Puerto Rico; advisory links left out), and
the FAA's airport status feed. The weather service is required for a weather answer; the satellite and hurricane parts are `null` when
those sources cannot be reached. The question is routed by its words (storm, flood, alert, warning, satellite, clouds, hurricane, cyclone in English or Spanish go to the weather; an airport code such as SJU, or
an airport word with a US or Puerto Rico city, goes to the FAA). Each answer names its source and when it was read, and says plainly when nothing
is listed (the FAA lists only airports with something to report). A copy is kept for 5 minutes so many agents asking together do not hammer the
sources; if a source is down a copy up to 15 minutes old may be served, never older. If a source cannot be reached or none covers the question: 404
before payment, and the words are kept in Signals as something agents wanted. Links and phone numbers from the sources are removed. It is not a
forecast and not a promise about any flight. To add a source, add a parser, a route in `routeLive`, and tests with a canned copy of its answer.

### Airport outlook: signs of delays before they happen

Every airport answer also has `outlook`, built from free official sources read on request:
- **The airport's forecast (TAF)** from the Aviation Weather Center (`aviationweather.gov/api/data/taf`), next 24 hours: thunderstorms, ceilings
  under 1,000 feet, visibility under 3 miles, snow or ice, gusts of 30 knots or wind of 25, each with its time window and chance when the forecast
  gives one. Station codes: `icaoFor` (TJSJ for SJU, K plus the code in the lower 48, P/TI/PG codes for the islands).
- **The FAA's operations plan** (`nasstatus.faa.gov/api/operations-plan`): ground stops, delay programs and reroutes the FAA calls possible today,
  split into this airport and elsewhere.
- **Big airports delayed now** (from the same FAA status feed, closure notices left out): a flight from one can arrive late.
- **For Puerto Rico airports, the hurricane center's Atlantic outlook** (`gtwo.xml`): each area it watches with its 2- and 7-day formation chances.

`outlook.signals` puts them in one list of plain lines. It is called an outlook, not a prediction about any flight, and a part is `null` when its
source could not be reached; the current FAA status is still required for any airport answer.
