# What each position pays, and what it takes to operate

Numbers come from `packages/core/src/staffing.ts`, `errand-tiers.ts`,
`concierge.ts` and `driver-pay.ts` as of 16 October 2026. If a rate changes in
code, this page is the thing to update. Anything marked **estimate** is a
guess, not a quote.

## 1. What each position pays

| Position | Pay | How it is paid |
|---|---|---|
| **Errand runner** | $4.00 – $23.00 per errand by size, plus $0.70 a mile | Per task. $16/hr for the minutes the size assumes. |
| **Personal assistant** | $35.00 an hour, 1 to 12 hours a booking | Per booking. They keep all of it; our fee is added on top. |
| **Driver** | Dormant. Standard: $3.00 base + $0.90/mi + $0.18/min. Secure transport: $15.00 + $4.50/mi + $0.60/min | Not live: rides go through Uber/Lyft for now. |
| Secretary | $22.00/hr, ~20 hrs/wk before launch | Hourly payroll |
| Social media manager | $22.00/hr, ~20 hrs/wk | Hourly payroll |
| Wingman Club coordinator | $40.00/hr, ~20 hrs/wk | Hourly payroll |
| Nurse (Elite coordination) | $45.00/hr, ~15 hrs/wk | Hourly payroll |
| Web developer | $70.00/hr, ~25 hrs/wk | Hourly payroll |
| Lawyer | $125.00/hr, ~15 hrs/wk | Hourly payroll |
| Physician (Elite advisor) | $150.00/hr, ~8 hrs/wk | Hourly payroll |

Errand sizes: in the building $4.00 · nearby store $12.13 · shopping trip
$23.00 · wait in line $17.53. Pay runs every two weeks.

## 2. People needed to operate

The code's own pre-launch floors (`PRELAUNCH_HEADCOUNT`) are sized to cover the
first weekend without anyone working every shift. The **pilot** column is what
I would hire to open one hospital area in Puerto Rico, with the owner doing the
desk work. Pilot numbers are my recommendation, not code.

| Position | Code floor | Pilot | Why the pilot number |
|---|---|---|---|
| Errand runner | 4 | 4 | Two per shift cover one hospital with a backup. |
| Personal assistant | 5 | 3 | One on shift, two to cover sickness and days off. |
| Driver | 8 | 0 | Rides are arranged on Uber/Lyft; nobody drives for us yet. |
| Secretary | 1 | 0 | The owner does it until there are customers. |
| Social media manager | 1 | 0 | The Instagram account is the owner's for now. |
| Wingman Club coordinator | 1 | 0 | The Club has no members yet. |
| Nurse, physician | 1 each | 0 | Elite is not selling yet. |
| Web developer | 1 | 0 | The site and app are built. |
| Lawyer | 1 | 1, briefly | Terms of Service and Privacy Policy are still placeholders. |

## 3. What that costs

**The code's full pre-launch plan: $70,940 for the 9 weeks to 1 December.**
Insurance $5,600, driver gas stipend $720, and $64,620 of wages. Almost all of
it is the seven hourly roles, which is why most of them are zero in the pilot.

**The pilot:**

| Item | Cost | Source |
|---|---|---|
| Domain (Cloudflare Registrar) | ~$10.44 a year | quoted earlier |
| Site on Cloudflare | $0 | free plan |
| App on Render + Neon | $0 | free plans; see section 4 |
| Insurance, 7 field people | ~$1,050 for 2 months ($75 each a month) | **estimate** in `staffing.ts` |
| Lawyer, one-time | ~$1,250 – $1,875 (10 – 15 hrs) | **estimate** |
| Background checks | not modelled | **unknown**; get a quote |
| Runners and assistants | $0 until a job exists | paid per job |

Roughly **$2,300 – $3,000** of real cash before the first customer, dominated
by the lawyer and the insurance. Neither is optional if you advertise
insurance to applicants.

## 4. Can the pilot pay for itself?

Errands will not. At 5¢ each they cover nothing fixed. Two things can:

- **Subscriptions.** Premium is $89.99 a month, about $87 after card fees.
  Premium includes 10 no-fee grabs a month, which cost up to $40 in runner pay
  if fully used, so count on **about $47 a month** from each. Pilot insurance
  of ~$525 a month is covered by roughly **11 Premium subscribers**.
- **Assistant hours.** Each booked hour at $43.75 leaves about $8.75 after the
  assistant's $35.

Until the first subscribers arrive the pilot is funded from your pocket, so the
insurance is the line to time carefully: buy it for the people you have hired,
not the people you plan to.

## 5. Building it for free, tomorrow

Only the domain costs money. Everything else has a free plan:

1. **Cloudflare, today, no domain needed.** Create a free account and import
   the repo as described in `docs/deploy.md` ("Put the site up today"). It gets
   an address like `safehubby-site.something.workers.dev`.
2. **Neon.** Free Postgres at neon.tech. Copy the connection string.
3. **Render.** New Blueprint from the repo; it reads `render.yaml`. Paste the
   Neon string into `DATABASE_URL`. Read `SAFEHUBBY_ADMIN_KEY` once from the
   dashboard and keep it: it is how you create the first owner login.
4. **Link them.** Set `APP_URL` (the Render address) and `SITE_ORIGIN` (the
   Cloudflare address) on the Cloudflare build, and redeploy it.
5. **Tomorrow, once paid:** buy the domain on Cloudflare, add it to the
   Cloudflare project, and change `SITE_ORIGIN`.

What free costs you: a Render free service sleeps after 15 minutes and takes
about 50 seconds to wake. The first applicant after a quiet spell waits. It is
fine for taking applications and demos, and **not** fine for SOS or check-ins,
which a sleeping server cannot answer. Do not promote the safety features until
the app is on a paid instance (Render's is about $7 a month).
Cloudflare cannot host the app for free: it would need Cloudflare Containers,
from $5 a month, and the port has not been built.
