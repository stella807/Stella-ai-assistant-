# Marketing site

A static, dependency-free landing page for Safehubby — `index.html`,
`styles.css` and the logo. No build step.

- Preview: `npx serve site` (or open `index.html` directly).
- Deploy: `.github/workflows/site.yml` publishes this folder to GitHub Pages
  on every push to `main` that touches it. Turn it on once under
  Settings → Pages → Source: **GitHub Actions**.

Prices and claims mirror the root `README.md` — update both together.
Calls to action point at the app on `https://safehubby.app`.
