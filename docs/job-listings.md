# Job listings

One listing per role the app actually needs. Every rate here is read from the
code that pays it, not written fresh for a job post:

| What the post says | Where it comes from |
|---|---|
| $35.00/hr, personal assistant | `PA_HOURLY_RATE_CENTS`, `concierge.ts` |
| $6.00 per quick task | `QUICK_TASK_ASSISTANT_PAYOUT_CENTS`, `concierge.ts` |
| Driver per-trip rates | `DRIVER_RATE_CARD`, `driver-pay.ts` |
| $22.00/hr desk roles, 20 hrs/week | `STAFF_ROLES`, `staffing.ts` |
| $125.00/hr lawyer, 15 hrs/week | `STAFF_ROLES`, `staffing.ts` |
| $70.00/hr web developer, 25 hrs/week | `STAFF_ROLES`, `staffing.ts` |
| Insurance, gas stipend, published rates | `HIRING_BENEFITS`, `staffing.ts` |
| Puerto Rico, Texas, Los Angeles | `LAUNCH_MARKETS`, `service-area.ts` |
| Service starts 1 December 2026 | `SERVICE_LIVE_AT`, `promotions.ts` |

**If a rate changes in the code, change it here in the same commit.** A job post
that promises more than the payout function pays is the kind of mistake that
ends up in front of a labour board.

## Before publishing any of these

Two things are deliberately left blank because they are not engineering
decisions and guessing at them in a public job post creates real liability:

- **Worker classification.** Whether field roles are employees or independent
  contractors changes tax withholding, overtime, and what the insurance has to
  cover. The per-job structure here reads like contractor work, but "reads
  like" is not a determination — several states apply an ABC test that is
  stricter than it sounds. Get this answered by an employment lawyer in each
  launch state before a listing goes live, then fill in the classification
  line in each post below.
- **Legal entity and address.** Every post needs the hiring entity's real
  registered name and a physical address.

Both are marked `[TO CONFIRM]` where they appear.

---

# 1. Personal assistant

**Location:** Puerto Rico · Texas · Los Angeles (in person, on site with
customers)
**Pay:** $35.00 per hour, booked in blocks
**Type:** Per-job, flexible hours · [TO CONFIRM: classification]
**Starts:** Roster is being built now; work begins 1 December 2026

## What the job is

You go to people, in person, and handle something they cannot handle
themselves right then. In practice that is one of four things:

- **Wait with someone** who should not be left alone until they are steady or
  their ride arrives.
- **Check on someone** in person, and report back honestly on whether they
  are actually okay.
- **Book and buy** something on a customer's behalf — concert tickets, a hotel
  room, a table — paid for on a card we fund for that task.
- **Airport pickup** — meet someone off a commercial flight and get them where
  they are going. The app tracks the flight and tells you if it lands early,
  runs late, or changes terminal.

Most of this happens in the evening and at night, because that is when people
need it.

## What you get paid

$35.00 an hour, for every hour booked. The customer books a block of hours up
front and you are paid for the block.

**You keep all of it.** Safehubby's fee is added on top of your rate, never
taken out of it — a customer booking two hours pays $87.50, of which $70.00 is
yours. That split is visible to the customer in the app, on purpose.

Pay runs every two weeks.

## What you need

- Legally able to work in the market you are applying to
- A smartphone that can run the assistant app
- Comfortable going to an address you have not been to before, at night
- Able to stay calm with someone who is drunk, upset, or frightened — this is
  the actual skill of the job
- Background check (we run and pay for it)

You do not need a car for this role.

## What we provide

- **Liability insurance from day one**, at no cost to you. You are going to
  strangers' addresses — that exposure is the company's to carry, not yours.
- **The rate is published before you apply.** It is in this post, it is in the
  app, and the customer sees it too.
- A card funded per task for anything you have to buy, with a spend cap set by
  the customer. You never front your own money.

## The honest part

This is night work, with strangers, sometimes with people who are not at their
best. Some jobs are twenty minutes of sitting with someone who just needed
company. Some are harder. You can decline any job without explaining yourself,
and declining does not affect what you get offered next.

You are never asked to make a medical judgement, and you are never asked to
tell anybody they are safe to drive. If something is beyond you, the answer is
to call 911, and you will never be second-guessed for doing it.

**Apply:** Careers → Personal assistant, in the app.

---

# 2. Errand runner

**Location:** Puerto Rico · Texas · Los Angeles
**Pay:** $6.00 per task (roughly 10 minutes of work)
**Type:** Per-job, flexible hours · [TO CONFIRM: classification]
**Starts:** 1 December 2026

## What the job is

Short, bounded pickups. Someone needs water, food, a phone charger, a
pharmacy item. You get it and bring it to them. One counter and back.

This is the quickest way onto the roster and the most flexible thing we
offer — you take what you want, when you are around.

## What you get paid

$6.00 per completed task. These are built to take about ten minutes; if a job
turns out to be bigger than that, it should have been booked as a personal
assistant job at $35.00/hr, and you can say so.

The customer's purchase goes on a card we fund, capped at what they set. Your
own money is never involved.

Pay runs every two weeks.

## What you need

- Legally able to work in the market you are applying to
- A smartphone
- A way to get around your area reliably
- Background check (we run and pay for it)

## What we provide

- **Liability insurance from day one**, at no cost to you
- **Published rates** — $6.00 is $6.00, before you apply and after
- A funded card per task, so you never front cash

## The honest part

Six dollars for ten minutes only works out if the jobs are close together and
you are already out. Nobody should take this expecting a full income from it —
it is designed as flexible top-up work, and pretending otherwise would waste
your time and ours. If you want hours you can plan a week around, apply for
personal assistant or one of the desk roles instead.

**Apply:** Careers → Errand runner, in the app.

---

# 3. Driver

**Location:** Puerto Rico · Texas · Los Angeles
**Pay:** Per trip — see the rate card below
**Type:** Per-job, flexible hours · [TO CONFIRM: classification]
**Starts:** 1 December 2026

## What the job is

Drive people home. Two tiers:

- **Standard** — everyday driving, getting someone home safely at the end of a
  night.
- **Secure transport** — a higher-touch tier for customers who need it, priced
  and paid accordingly.

## What you get paid

Per trip, on a published rate card:

| Tier | Base | Per mile | Per minute |
|---|---|---|---|
| Standard | $3.00 | $0.90 | $0.18 |
| Secure transport | $15.00 | $3.00 | $0.60 |

A 6-mile, 15-minute standard trip pays $11.10. The same trip on secure
transport pays $42.00.

Secure transport costs more because it *is* more — it is not standard driving
with a bigger number attached. Standard is deliberately not inflated to match.

Pay runs every two weeks.

## What you need

- Valid driver's licence, in good standing
- Your own vehicle, insured and roadworthy
- Legally able to work in the market you are applying to
- Background check and driving record check (we run and pay for both)

## What we provide

- **Liability insurance from day one**, covering you while working, at no cost
  to you
- **$10 a week for gas until we launch.** There are no fares before launch day
  because there are no customers yet. Drivers who accept an offer and stay on
  the roster through the run-up get a fuel stipend for every week of it. You
  should not be out of pocket for waiting on us.
- **Published rates** — the card above is the card

## The honest part

There are no trips, and therefore no fares, until 1 December 2026. The gas
stipend exists precisely because we are asking you to be ready before there is
anything to be ready for. If you need earnings now, this is not that job yet.

Commercial auto coverage requirements vary by state and are still being
finalised per market — we will confirm exactly what is covered before you
accept, not after.

**Apply:** Careers → Driver, in the app.

---

# 4. Secretary

**Location:** One launch market, mostly remote with some local presence
**Pay:** $22.00 per hour
**Hours:** 20 hours a week, part time
**Type:** [TO CONFIRM: classification]
**Starts:** Immediately — this role works *through* the pre-launch window

## What the job is

Keep the operation running while it is being built:

- Process applications from drivers, assistants and errand runners
- Chase insurance and background-check paperwork to completion
- Answer customer email from people who have signed up and are waiting
- Support dispatch once service is live

## What you get paid

$22.00 an hour, 20 hours a week, paid from your start date — not from launch
day. Unlike the field roles, the pre-launch work *is* the job, so those hours
are real payroll.

Benchmark: the US Bureau of Labor Statistics 2024 median for secretaries and
administrative assistants is roughly $45–48k a year, about $22/hour. This is
that rate, at part-time hours.

## What you need

- Organised enough to run a paperwork pipeline without being chased
- Clear written English; Spanish is a strong plus in the Puerto Rico market
- Comfortable telling a waiting applicant an honest "not yet"
- Discretion — you will see applicant background checks and customer
  correspondence

## What we provide

- **Liability insurance from day one**
- **Published rates**
- Genuine part-time hours, not a full-time job disguised as one

## The honest part

Twenty hours is twenty hours. A full-time desk before there is a single
customer is how a launch spends its runway on overhead, so this role is
deliberately part time and will stay that way until volume justifies more.

**Apply:** Careers → Secretary, in the app.

---

# 5. Social media manager

**Location:** Remote
**Pay:** $22.00 per hour
**Hours:** 20 hours a week, part time
**Type:** [TO CONFIRM: classification]
**Starts:** Immediately — this role works *through* the pre-launch window

## What the job is

Fill the launch. On 1 December 2026 there needs to be a list of people waiting,
and building that list is this job:

- Run the accounts
- Run the launch party
- Run the newsletter
- Run the referral push that brings the first customers in

## What you get paid

$22.00 an hour, 20 hours a week, paid from your start date. Same rate and
structure as the secretary, because it is the same kind of full-attention desk
job during the same window.

## What you need

- You have actually grown an account from nothing before, and can show it
- Can write copy that does not sound like an app wrote it
- Comfortable with the subject matter: this is a product about drinking,
  getting home, and looking after people. It has to be marketed without being
  either preachy or reckless.
- Spanish is a strong plus for the Puerto Rico market

## What we provide

- **Liability insurance from day one**
- **Published rates**
- A product with an actual point of view, which is easier to market than one
  without

## The honest part

**This role is the launch's single biggest dependency and the one the original
plan forgot.** If nobody does this job, launch day is a roster of field workers
waiting for customers who never heard of us. That makes the job important; it
also means the pressure is real and the results are visible.

There are two hard rules on what you may say. The app never tells anyone they
are safe to drive, and marketing must never imply otherwise. The app is not an
emergency service, and marketing must never imply otherwise. Both have
regulatory teeth, not just taste.

**Apply:** Careers → Social media manager, in the app.

---

# 6. Lawyer

**Location:** Remote (work from anywhere)
**Pay:** $125.00 per hour
**Hours:** 15 hours a week, part time
**Type:** [TO CONFIRM: classification]
**Starts:** Immediately — this role works *through* the pre-launch window

## What the job is

Draft and review all legal documentation the business needs to operate safely:

- **Employment agreements** for field staff (drivers, assistants, errand runners)
- **Contractor agreements** for the partner network providing concierge services
- **Terms of service** and privacy policy (the customer-facing contracts)
- **Driver agreements** outlining safety, insurance, and liability boundaries
- **Independent contractor agreements** for secretary, social media manager, and
  other administrative roles
- **Compliance review** in each launch state (employment law, insurance
  requirements, worker classification, liability structures)

This is the legal infrastructure the business runs on. None of it is optional.

## What you get paid

$125.00 an hour, 15 hours a week, paid from your start date — not from launch
day. Unlike the field roles, the pre-launch work *is* the job.

For context: startup legal work typically ranges $150–300/hour depending on
market and experience. This is a fixed rate in a specific scope, so the pricing
is transparent from the start.

## What you need

- Licensed to practice law in at least one U.S. state
- Experience with startup documentation and employment law
- Comfortable working in the safety/liability space (this is a product that
  operates in a regulated area)
- Able to deliver without overthinking — perfection is the enemy of launch

## What we provide

- **Liability insurance from day one** (this is desk work, but coverage is
  included across everyone hired)
- **Published rate** — $125.00 is $125.00, before you apply and after
- **Clear scope** — you know what contracts need writing before you start

## The honest part

This is not a full-time role, and the workload is front-loaded. The heaviest
lift is the two months before launch (employee agreements, terms, privacy
policy, compliance checks). Post-launch, the scope drops to review and
amendments as the business evolves — if it stays in-house at all, it may become
as-needed consulting.

The work is straightforward but not trivial: this is a business with real
liability exposure (people in customers' homes, drivers on roads, money flowing
through cards). The agreements have to be both protective and honest — no
burying liability in footnotes, and no overpromising on safety.

**Apply:** Careers → Lawyer, in the app.

---

# 7. Web developer

**Location:** Remote (work from anywhere)
**Pay:** $70.00 per hour
**Hours:** 25 hours a week, part time
**Type:** [TO CONFIRM: classification]
**Starts:** Immediately — this role works *through* the pre-launch window

## What the job is

Build and maintain the product itself:

- The customer app (`apps/web`) — booking flows, the plans screen, the master
  dashboard, everything a subscriber or an assistant touches
- The API and dispatch runtime (`apps/api`) — the server the app runs on,
  and the integrations (payments, rides, delivery, push) that make it real
- Fixes and features as the pre-launch roster and the launch plan change —
  a lawyer's contract or a pricing decision often means a code change to
  match, and that is this job

There is no product to launch on 1 December 2026 without this role — the app
is the thing every other hire depends on being able to use.

## What you get paid

$70.00 an hour, 25 hours a week, paid from your start date — not from launch
day. The work is real starting now: the app has to exist and keep working
through the entire run-up, not just on the day service goes live.

For context: 2026 US freelance/contract web developer rates cluster
$45-95/hour, with the median around $73/hour. $70/hour is a mid-level
contract rate — solid, not the top of the band, and not junior either.

## What you need

- Comfortable across a modern TypeScript stack — this app is React on the
  front end, Node on the API, shared domain logic in between
- Can read and extend an existing, opinionated codebase rather than
  rewriting it your own way
- Understands why a safety product cannot ship a plausible-looking button
  that does not actually work — see "What every role gets" and the app's own
  disclosures for the standard this is held to
- Comfortable owning a fix or a feature end to end: the change, the tests
  that prove it, and the doc that keeps the next person from re-litigating it

## What we provide

- **Liability insurance from day one** (desk work, but coverage is included
  across everyone hired)
- **Published rate** — $70.00 is $70.00, before you apply and after
- Direct access to why every number and rule in this app is what it is — the
  codebase's own comments are the design history, not just the code

## The honest part

This is not a full-time role today, and the backlog is real: a pre-launch
product with this many moving pieces (payments, rides, delivery, a master
dashboard, an assistant portal) always has more to build than 25 hours a
week covers. Priorities get set by what the launch actually needs next, not
by whichever ticket is most interesting. Post-launch, scope and hours are
expected to grow with the roster, not shrink.

**Apply:** Careers → Web developer, in the app.

---

## What every role gets

From `HIRING_BENEFITS` in `staffing.ts`, which is the single source these
promises are read from:

- **Liability insurance, from day one.** Every person hired is covered while
  working, at no cost to them.
- **$10 a week for gas until we launch** (drivers).
- **The rate is published before you apply.** What a trip or a task pays is
  written down and visible up front, and the company's margin is added on top
  of it rather than taken out of it.

## What no role involves

Worth stating, because applicants ask:

- No medical judgements, ever. Nobody on this roster tells a customer they are
  fit to drive, at any reading.
- No signing in as a customer. An assistant drafts things for a customer to
  send, or sends from Safehubby and says so.
- No fronting your own money. Purchases go on a card funded per task.
