# Protecting the site from bugs

What stands between a mistake and the live site, in the order a change meets it.

1. **While it is written.** Lint (`pnpm lint`), types (`pnpm typecheck`) and tests
   (`pnpm test`) in every package. Type-checking covers the tests too, which is
   how a test that passed for the wrong reason gets caught.
2. **On every push (GitHub Actions, `.github/workflows/ci.yml`).** The same four
   checks, then a build of the web app, then `node scripts/smoke.mjs`: it starts
   the real server on the real build and asks for every important page. It fails
   on a page that errors, a script or picture the built page asks for that is
   missing (a blank screen for everyone), an unknown address that answers 200, a
   missing security policy, a sitemap address that does not open, or an API path
   that answers with a web page. Run it yourself with `pnpm build` then `pnpm smoke`.
3. **When the deploy starts (Railway).** The health check (`/api/health`, see
   `railway.json`) fails if the web app is missing from the build, so Railway
   keeps the old working version running instead of switching to a broken one.
4. **When a visitor hits a crash.** The browser reports it (`app/error-report.ts`)
   and the server writes one line to the log, "browser error on /path: ...", with
   no personal detail. Search Railway's logs for `browser error` or `browser screen`.

## Two switches that make steps 2 and 3 binding

They are settings on the websites, not code, so someone with access has to turn them on:

- **GitHub:** Settings → Branches → add a rule for `main` that requires the
  "Checks" status to pass before merging. Without it the checks still run and
  report, but nothing stops a failing change reaching `main`.
- **Railway:** in the service's settings, turn on "Wait for CI" (if it is offered
  for your plan), so a deploy waits for the GitHub checks and is skipped when they fail.
