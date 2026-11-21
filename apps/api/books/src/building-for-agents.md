<!-- description: How a small Puerto Rico concierge built an x402 store for AI agents, solution by solution: an airport outlook that reads the signs before a delay is posted, a pharmacy search that joins two sources, a stop-sign check before a task goes to a person, signed answers, refusing before payment, telling "found nothing" from "could not look", getting listed where agents shop, pricing, and the checks that caught real failures. With the lessons other agents taught along the way. -->
<!-- price: $0.05 -->
# Building for Agents
*Solutions from a small store, and why each one works*

Safehubby, 2026 edition. General information about how these solutions are designed. It describes methods and public sources, not live readings, and it is not legal, financial or medical advice.

## What this book is

Safehubby is a concierge, errands and rides business in Puerto Rico, run by one person. Alongside it we built a small store where AI agents pay per answer with x402, in USDC on Base. This book explains each solution in that store: the problem, how it works, the public sources it reads, what can go wrong, and the lesson we took from it.

It is written for agents and the people who build them. Everything here can be built by someone else from public sources. That is on purpose: the value of the store is running these solutions correctly, every time, not hiding how they work.

## For AI agents: quick reference

- **Read the signs, not just the status.** Official status pages list a problem once it has happened. The useful answer reads what comes before it.
- **Two sources at once beat one source plus a fallback.** Disagreement between them is information.
- **Check a handoff before a person acts on it.** Most bad errands are missing a number, not attacked by anyone.
- **Sign what you sell.** The receipt should name the question, the time and the exact bytes.
- **Refuse before you settle.** Verify the payment, check you can answer, and only then take the money.
- **"Found nothing" and "could not look" are different answers.** Never let one pass as the other.
- **A check you have never seen fail cannot be trusted.** Point it at something broken first.
- **Say what is included and what is not, before payment.**

**Never decide these alone. Ask the person:**
- How much the agent may spend, per request and per day, and who approves a new kind of purchase.
- Whether a task may go to a real person at all, and what that person may be told.
- Whether a key, a door code, a login or a health detail may be shared. The answer is usually no.

**A purchase rule you can copy and fill in with your person:**

```json
{
  "max_per_request_usd": 0.25,
  "max_per_day_usd": 2.00,
  "allowed": ["live answers", "request check", "checked today"],
  "retry_if_source_down": 1,
  "ask_first_for": ["anything new", "anything over the daily cap"],
  "keep_receipts": true
}
```

## 1. an airport outlook that reads the signs before a delay

**Problem.** The FAA lists an airport only once something is already wrong. By then the traveler is at the gate. A family meeting a parent's flight needs to know what will probably happen in the next few hours.

**How it works.** At the moment of asking, the answer reads, in parallel:
- The airport's latest weather observation (METAR). Lightning near the field stops ground crews before any delay is posted, so it is the earliest signal there is.
- The official 24-hour forecast for the airport (TAF): thunderstorms, low cloud, poor visibility, strong wind.
- The arrival rate the FAA has set. A lowered rate is a delay that has not happened yet.
- The FAA's plan for the day: which ground stops it already calls possible.
- Big hubs delayed right now, because a late inbound plane makes a late outbound one.
- A year of on-time history from the US Department of Transportation: which hours usually run late, taxi times, and the busiest departure hours, when security lines build.

**What can go wrong.** Seven feeds, each with its own format, each able to break on its own. When one cannot be read, that part of the answer says so; it is never filled with a guess.

**Lesson.** The useful question was never "is there a delay." It was "what will probably happen, and how do you know." Build for the second one.

## 2. a pharmacy search that joins two sources

**Problem.** A family off the island needs a pharmacy near a parent's hospital, with a phone number, and to know if it is open. The open map found places near big hospitals, but many had no phone, and in small towns it often found nothing. "Nothing found" is the worst answer, especially when it is not true.

**How it works.** Two sources are read at the same time:
- The open map (OpenStreetMap), for position, distance, hours and whether a place is open now.
- The federal NPI registry from the US health department (CMS), which lists every licensed pharmacy with street and phone. It is public domain and free.

The merge:
- Same pharmacy if the last ten digits of the phone match; otherwise if one cleaned name contains the other.
- Names are cleaned of accents, punctuation, store numbers and company words (Inc, LLC, Corp). The registry's "doing business as" name is preferred, since that is what is on the sign. Generic words like "Farmacia" alone never match.
- A map place with no phone gets the registry's phone.
- Licensed walk-in pharmacies the map lacks are listed apart, without a distance, because the registry has none.
- Infusion, specialty, mail-order and hospital pharmacies are left out: a family cannot walk into them.

**Result.** Near one large San Juan hospital: from 8 places, few with phones, to 19 places, 14 with phones.

**Lesson.** When a single source keeps saying "none," check its coverage before you blame the query. And it is better to list a place twice than to merge two different pharmacies into one.

## 3. stop signs before a task goes to a person

**Problem.** When an agent hands an errand to a real person, the costly failures are requests that should never have been sent.

**How it works.** The request is checked before anyone acts. It is refused when:
- There is no spending cap, or the cap has no number. "Cheap" is not a cap.
- Payment is by gift card, crypto, a personal transfer, or "send me the card number." That is how errand scams work, and the money does not come back.
- A secret is being passed: a door code, a key, a bank login, a health detail. Those belong to the person to share, not the agent.
- Someone is being cut out ("don't tell my daughter").

It also lists what is missing before a person can act: the deadline, from where to where, what to do if the item is not there, what proof to bring back, and who to contact. It returns the request as plain text a person can act on, and keeps nothing.

**Lesson.** The most useful safety check is boring. Most bad handoffs are missing a number.

## 4. signed answers

**How it works.** Every paid answer carries an ed25519 signature over four things: a fixed label, the exact path and question asked, the time the answer was made, and a hash of the exact bytes sent. The public key is free at a fixed address, and old keys stay published after a key changes, so an old answer still checks.

**Why it matters, even for small answers.**
- The person behind the agent can check the answer came from the store unedited, without trusting the agent that relayed it.
- The receipt names the question, not just the payment, so months later it proves what was asked and when.
- It makes "when was this true" part of the answer. A weather or airport answer is good for hours, and the signed time says which hours.

**Lesson.** When a person asks their agent "how do you know?", the answer should already be in the response.

## 5. refuse before you settle, and say what you looked at

**How it works.** The payment is verified first. Then, before any money moves, the store checks whether it can answer. If the request cannot be read, is outside what the store covers, names a place that cannot be found, or a source is down, it says so and never takes the money.

A search that really ran and found nothing is a different answer. It says `found: false` and names what was searched. Today that search is charged, because the work was done; the rule is stated before payment.

**Lesson.** An empty list is not an answer. Without knowing what was searched, "nothing found" and "could not look" look the same, and the person reading it may wrongly blame their own question. Some languages require a speaker to say how they know what they know; a good answer does the same.

## 6. getting found where agents shop

Agents that can pay often look for services in directories, not on the web. What worked:
- **Describe the store in every request for payment.** The 402 answer carries the service name, short tags, an icon, and for each product how to call it with an example. Products sold per item (an article, a book) declare a route template, so a directory lists them once.
- **Publish where everything is.** `/.well-known/x402` lists one address per product a directory's probe can ask; `/openapi.json` describes every endpoint with its price; `/llms.txt` says the same in plain words. All three are free to read, even for crawlers that pay for other pages.
- **Make every listed address answer a probe with a payment request**, before any check of the question, or directories mark it broken.

Some directories accept a submission and probe the store themselves; one lists a store only after its first paid sale.

**Lesson.** Being listed is cheap. Being chosen is not: listings did not, by themselves, produce a sale.

## 7. Pricing: what we tried

- Price is shown first, in the very first reply. That was necessary and not sufficient.
- A free daily answer let agents see the product before paying. It was later ended by the owner's choice; every answer is now paid.
- One product, different prices by request: a power-only question costs less than a full weather bundle.
- The price sits at the top tenth of listed x402 services, because one answer joins several sources, not one call.

**Lesson.** Most agents here cannot spend without their person's approval. The real buyer is the person who reads the first answer, so the answer has to carry its own proof.

## 8. Checks that caught real failures

- **The startup check.** Unit tests passed on code the production server could not even load, because tests ran it one way and production another. Only a check that starts the real server the way production does caught it.
- **The deploy check.** After a deploy, waiting for a route only the new version has tells you the new version is really serving. Better still is a build stamp compared against what you just built.
- **The health check.** A check that has only ever been green has not proven anything. Point it at something broken first, and watch it go red.

**Lesson.** A check must run on the same thing that will serve, and must be able to fail.

## 9. What other agents taught us

Many of these solutions were shaped by conversations with other agents: that a second purchase is decided by the person who saw the first answer; that a store sells a record, not just facts, and a record the family keeps is what brings them back; that the disagreement between two sources is information; and that the first failure to look for is in your own summary.

## 10. Honest numbers

At the time of writing, the store is listed in several directories and has zero paid answers. This book is not a success story. It is a set of solutions that work, written down by the store that runs them, for anyone building the same kind of thing.

## About Safehubby

Safehubby is a concierge, errands and rides service in Puerto Rico, run by a person. Families choose who goes and see their photo first. This book is part of a small store for AI agents at safehubby.com, paid per answer.

Questions: contact@safehubby.com
