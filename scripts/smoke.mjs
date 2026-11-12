#!/usr/bin/env node
/**
 * A smoke test of the real thing: starts the API serving the built web app,
 * then asks for every important address and checks what comes back. It catches
 * the failures unit tests cannot: a page that 500s, a script or picture the
 * built page asks for that is not there (a blank screen for everyone), a
 * missing security header, a broken sitemap.
 *
 *   pnpm --filter @safehubby/web build && node scripts/smoke.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import net from "node:net";

const root = resolve(new URL("..", import.meta.url).pathname);
const webRoot = join(root, "apps/web/dist");
if (!existsSync(join(webRoot, "index.html"))) {
  console.error("The web app is not built: run `pnpm --filter @safehubby/web build` first.");
  process.exit(2);
}

const freePort = () => new Promise((ok, fail) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); });
  s.on("error", fail);
});

const port = await freePort();
const env = { ...process.env, PORT: String(port), WEB_ROOT: webRoot, HOME: mkdtempSync(join(tmpdir(), "smoke-")) };
delete env.DATABASE_URL;
const server = spawn("node", ["--experimental-strip-types", "src/main.ts"], { cwd: join(root, "apps/api"), env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => { log += d; });
server.stderr.on("data", (d) => { log += d; });
const stop = () => { try { server.kill("SIGKILL"); } catch { /* already gone */ } };
process.on("exit", stop);

const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
  if (i === 59) { console.error("The server did not start.\n" + log.slice(-1500)); process.exit(1); }
  await new Promise((r) => setTimeout(r, 500));
}

const failures = [];
let passed = 0;
const check = (name, ok, detail = "") => { if (ok) passed++; else failures.push(`${name}${detail ? ` — ${detail}` : ""}`); };
const get = async (path, init) => {
  const res = await fetch(base + path, { redirect: "manual", ...init });
  return { res, status: res.status, text: await res.text() };
};

// ---- the app's pages
const home = await get("/");
check("home answers 200", home.status === 200, String(home.status));
check("home has the app's root and a title", home.text.includes('<div id="root">') && /<title>[^<]{10,}/.test(home.text));
check("home carries its canonical and both languages", home.text.includes('rel="canonical"') && home.text.includes('hreflang="es"'));
check("home is allowed to be indexed", home.text.includes('content="index, follow"'));
check("home has a content security policy", Boolean(home.res.headers.get("content-security-policy")));

// Everything the built page asks for must be there: this is the blank-screen test.
const assets = [...new Set([...home.text.matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|png|jpg|svg|ico|webp))"/g)].map((m) => m[1]))];
check("the page asks for scripts and styles", assets.some((a) => a.endsWith(".js")) && assets.some((a) => a.endsWith(".css")), assets.join(", "));
for (const a of assets) {
  const r = await fetch(base + a);
  check(`asset ${a}`, r.status === 200, String(r.status));
}
// The pictures the landing page shows.
for (const img of ["hero-luxury", "showcase-jet", "showcase-lounge", "showcase-yacht", "showcase-hotel", "showcase-ride", "showcase-venue"]) {
  const r = await fetch(`${base}/img/${img}.jpg`);
  check(`picture ${img}`, r.status === 200 && (r.headers.get("content-type") ?? "").startsWith("image/"), String(r.status));
}
check("the early theme script is served", (await fetch(`${base}/theme-init.js`)).status === 200);

for (const [path, needle] of [
  ["/es", 'lang="es"'], ["/careers", "<h1>"], ["/es/trabajo", "<h1>"], ["/drive", "<h1>"],
  ["/private-jets-puerto-rico", "Jettly"], ["/airport-lounge-passes", "LoungePair"],
  ["/es/jets-privados-puerto-rico", "Jettly"], ["/es/pases-salas-vip", "LoungePair"],
]) {
  const p = await get(path);
  check(`${path} answers 200 with its own content`, p.status === 200 && p.text.includes(needle), `${p.status}`);
}
for (const path of ["/master", "/employee"]) {
  const p = await get(path);
  check(`${path} opens and is kept out of search`, p.status === 200 && p.text.includes("noindex"), `${p.status}`);
}
const missing = await get("/this-page-does-not-exist");
check("an unknown address is a 404 page, not a blank 200", missing.status === 404 && missing.text.includes("noindex"));

// ---- the blog
const blog = await get("/blog");
check("blog index answers", blog.status === 200 && blog.text.includes("BlogPosting") === false && blog.text.includes("<h1"));
const article = /href="(\/blog\/[^"]+)"/.exec(blog.text)?.[1];
check("blog lists an article", Boolean(article));
if (article) {
  const a = await get(article);
  check("an article opens with structured data", a.status === 200 && a.text.includes('"BlogPosting"'), `${a.status}`);
}
check("the Spanish blog answers", (await get("/es/blog")).status === 200);

// ---- search engines
const sitemap = await get("/sitemap.xml");
const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check("sitemap lists the pages", sitemap.status === 200 && locs.length >= 20, `${locs.length} addresses`);
for (const loc of locs) {
  const path = new URL(loc).pathname;
  const r = await fetch(base + path, { method: "HEAD" });
  check(`sitemap address ${path} opens`, r.status === 200, String(r.status));
}
const robots = await get("/robots.txt");
check("robots.txt points at the sitemap and hides the private areas", robots.text.includes("Sitemap:") && robots.text.includes("Disallow: /master"));

// ---- the API
const health = await get("/api/health");
check("health check passes", health.status === 200 && health.text.includes('"ok":true'));
const api404 = await get("/api/nope");
check("an unknown API path is JSON, not a web page", api404.status === 404 && (api404.res.headers.get("content-type") ?? "").includes("json"));
check("signed-out requests to account data are refused", (await get("/api/account/export")).status === 401);
const post = await get("/api/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "error", message: "smoke test", path: "/" }) });
check("a browser can report a crash", post.status === 200);
const partner = await get("/api/partners/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company: "", name: "", email: "x", about: "" }) });
check("the partner form refuses an empty request", partner.status === 400);

stop();
console.log(`${passed} checks passed${failures.length ? `, ${failures.length} FAILED` : ""}.`);
if (failures.length) {
  console.error("\nFailed:\n" + failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}
