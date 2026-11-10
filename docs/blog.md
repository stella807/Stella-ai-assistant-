# The blog

`/blog` and `/es/blog`. Plain pages the server writes itself
(`apps/api/src/blog.ts`), one new article a week, always in English and
Spanish. See `docs/seo.md` for how the rest of the site is described to
search engines.

## Publishing an article

1. Add a file in `apps/api/src/blog/`, named `YYYY-MM-DD-subject.ts`, that
   exports an `Article` (copy the shape of an existing one).
2. Import it in `apps/api/src/blog/index.ts` and add it to `ARTICLES`.
3. Run `pnpm --filter @safehubby/api test`. `test/blog.test.ts` checks every
   article against the rules below.
4. It is live after the next deploy from `main`.

Safehubby's own prices are never typed into an article. Write `{{hourly}}`,
`{{armedHourly}}`, `{{errandFrom}}`, `{{hospitalDay}}` or `{{cheapestPlan}}`
and the page prints today's price. Text may use `**bold**` and
`[links](https://...)` or `[links](/blog/...)`; everything else is escaped.

## The rules

The blog is blunt about other concierge services. It stays out of trouble,
and stays believable, by being blunt only about things that can be checked.

1. **A fact about a named company comes from that company's own website** (or
   a source cited in the text), read by the writer that week. It goes in the
   article's `companies` list with the page address and the month.
2. **No fact that was not read.** If a price is not published, the article
   says "not published". It does not guess, repeat rumours, or quote reviews
   it cannot link to.
2a. **A review or complaint is quoted only from a public page**, linked in
   the article's `sources` with the month it was read. It is given as the
   customer's account, not as fact, with its date, the company's reply if one
   is shown, and the page's overall rating if it has one. A private person is
   never named.
3. **Opinions are written as ours** ("we think", "that is a bad deal for the
   customer"), about what a company publishes or charges. Never about the
   people who run it, and never an insult.
4. **Say what was not checked.** If only the pricing page was read, the
   article does not make claims about the service itself.
5. **Corrections are offered.** Each comparison invites the company to write
   to contact@safehubby.com if something is out of date, and the article is
   updated (`updatedOn`) when it is.
6. **Both languages, in full.** Same content, same blocks.
7. **Each article links** to at least one other article and to the home page.

## What to write next

One a week. Each review of a named service applies the five questions from
"Five things concierge memberships leave out": the price, who shows up, what
is included, the spending limit, and the middle of the night.

- Quintessentially (London): what it publishes about membership and price
- Velocity Black
- Knightsbridge Circle
- John Paul (Accor)
- Pure Entertainment Group
- Sienna Charles
- One Concierge
- Concierge services built into premium credit cards: what they actually do
- Hospital companions in Puerto Rico: agencies, hourly rates and what to ask
- Hiring a bodyguard in Puerto Rico: licences (Ley 108), prices, questions
- Getting home after a night out in San Juan: every option and what it costs
- Errand services in Texas and Los Angeles compared
