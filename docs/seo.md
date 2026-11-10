# Search engines

How the site describes itself to Google and other crawlers, and what has to
be done outside the code.

## What the server does

The app is one page that draws itself in the browser. Left alone, every
address would give a crawler the same empty page with the same title. So the
server (`apps/api/src/seo.ts`, applied in `server.ts`) fills in the app's
HTML per address before sending it:

- a title and description in that page's language;
- the canonical address, and its twin in the other language (`hreflang`);
- structured data: the organisation and its plans on the home page, and a
  job listing (`JobPosting`) on each job's own page while that job has a
  seat open;
- the page's main content as plain HTML inside the app's root element. The
  app replaces it as soon as it starts. It is the landing page's own
  headline, services and prices, not text written only for robots.

Prices, pay and openings are read from the running service on each request
(`seo-facts.ts`), so a price the owner changes is the price a crawler sees.

## The addresses

Defined once, in `packages/core/src/site-routes.ts`, and used by both the
server and the app:

| Page | English | Spanish |
| --- | --- | --- |
| Home | `/` | `/es` |
| All jobs | `/careers` (also `/work`) | `/es/trabajo` (also `/trabajo`) |
| One job | `/careers/<job>` | `/es/trabajo/<job>` |
| Driver application | `/drive` | `/es/chofer` |

A Spanish address always opens in Spanish. An English address leaves a
returning visitor's own language choice alone. Switching language in the app
moves the address bar to the matching address.

`/master` and `/employee` are served with `noindex`. Any other address is
answered with status 404 (the app still loads for a person).

`/sitemap.xml` is generated on request and lists the pages above, with a job
page only for jobs that are open. `robots.txt` is the static file in
`apps/web/public`.

## Settings

- `SAFEHUBBY_PUBLIC_URL` must be the address people use, `https://safehubby.com`
  (the default when it is not set). Canonical links and the sitemap are built
  from it; pointing it anywhere else tells search engines the site lives there.
- `HIRING_OPENED_ON` in `packages/core/src/open-positions.ts` is the "date
  posted" on job listings. Change it only when hiring is reopened.

## What only the owner can do

1. **Google Search Console** (search.google.com/search-console): add
   `safehubby.com`, verify it with the DNS record Google gives (add it in
   Cloudflare), then submit `https://safehubby.com/sitemap.xml`.
2. **Bing Webmaster Tools**: the same, or import from Search Console.
3. **Google Business Profile**: a free listing for the business, so it shows
   in Maps and local results.
4. **Links from real partners**: hotels, condominiums, venues and press that
   mention Safehubby and link to it. These matter more than anything on the
   page.
5. After a deploy, check a job page with Google's Rich Results Test
   (search.google.com/test/rich-results).
