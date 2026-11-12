import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

/**
 * The server answering real requests for the built app. WEB_ROOT is read when
 * server.ts loads, so it is set here first and the server imported after.
 */
const webRoot = mkdtempSync(join(tmpdir(), "safehubby-web-"));
mkdirSync(join(webRoot, "assets"));
writeFileSync(join(webRoot, "index.html"), [
  `<!doctype html>`, `<html lang="en">`, `<head>`,
  `<!--seo:head--><title>placeholder</title><!--/seo:head-->`,
  `<script type="module" src="/assets/app-AbCd1234.js"></script>`, `</head>`,
  `<body><div id="root"><!--seo:body--><!--/seo:body--></div></body>`, `</html>`,
].join("\n"));
writeFileSync(join(webRoot, "assets", "app-AbCd1234.js"), "console.log('app')");
writeFileSync(join(webRoot, "robots.txt"), "User-agent: *\nAllow: /\n");

let base = "";
let close: () => void = () => {};
const priorRoot = process.env.WEB_ROOT;
const priorUrl = process.env.SAFEHUBBY_PUBLIC_URL;

beforeAll(async () => {
  process.env.WEB_ROOT = webRoot;
  process.env.SAFEHUBBY_PUBLIC_URL = "https://safehubby.com/";
  const { createApp, makeCtx } = await import("../src/server.ts");
  const { Store } = await import("../src/store.ts");
  const { SEED } = await import("../src/seed.ts");
  const store = new Store(join(webRoot, "db.json"));
  store.reset(structuredClone(SEED));
  const server = createApp(makeCtx(store));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => {
  close();
  rmSync(webRoot, { recursive: true, force: true });
  if (priorRoot === undefined) delete process.env.WEB_ROOT; else process.env.WEB_ROOT = priorRoot;
  if (priorUrl === undefined) delete process.env.SAFEHUBBY_PUBLIC_URL; else process.env.SAFEHUBBY_PUBLIC_URL = priorUrl;
});

describe("the app's HTML, as the server sends it", () => {
  it("sends the Spanish home page in Spanish, with its own title and its English twin", async () => {
    const res = await fetch(`${base}/es`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-language")).toBe("es");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(html).toContain(`<html lang="es">`);
    expect(html).toContain("<title>Concierge y asistentes personales en Puerto Rico | Safehubby</title>");
    expect(html).toContain(`<link rel="canonical" href="https://safehubby.com/es" />`);
    expect(html).toContain(`<link rel="alternate" hreflang="en" href="https://safehubby.com/" />`);
    expect(html).toContain("Alguien de confianza");
    // The app's own script is still there to take over.
    expect(html).toContain(`<script type="module" src="/assets/app-AbCd1234.js"></script>`);
  });

  it("sends real prices and jobs read from the running service", async () => {
    const home = await (await fetch(`${base}/`)).text();
    expect(home).toMatch(/Premium: \$\d+(\.\d{2})? a month/);
    expect(home).toContain(`"@type":"Service"`);
    const job = await (await fetch(`${base}/careers/personal-assistant`)).text();
    expect(job).toContain("<title>Personal assistant jobs in Puerto Rico | Safehubby</title>");
    expect(job).toContain(`"@type":"JobPosting"`);
    expect(job).toMatch(/\$\d+\.\d{2} an hour/);
  });

  it("answers an address the site does not have with 404, still carrying the app", async () => {
    const res = await fetch(`${base}/wp-login.php`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`<meta name="robots" content="noindex" />`);
    expect(html).toContain(`/assets/app-AbCd1234.js`);
  });

  it("keeps the signed-in areas out of search results without breaking them", async () => {
    const res = await fetch(`${base}/master`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`<meta name="robots" content="noindex, nofollow" />`);
  });

  it("answers HEAD with the same status and no body", async () => {
    const ok = await fetch(`${base}/es`, { method: "HEAD" });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("");
    expect((await fetch(`${base}/nope`, { method: "HEAD" })).status).toBe(404);
  });

  it("still serves built files as files, hashed ones for a year", async () => {
    const asset = await fetch(`${base}/assets/app-AbCd1234.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(await asset.text()).toBe("console.log('app')");
    expect((await fetch(`${base}/robots.txt`)).headers.get("content-type")).toContain("text/plain");
  });

  it("builds the sitemap from the jobs that are open", async () => {
    const res = await fetch(`${base}/sitemap.xml`);
    const xml = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(xml).toContain("<loc>https://safehubby.com/es</loc>");
    expect(xml).toContain("<loc>https://safehubby.com/careers/personal-assistant</loc>");
    expect(xml).not.toContain("/master");
  });

  it("serves the blog as whole pages of its own, and lists them in the sitemap", async () => {
    const index = await fetch(`${base}/es/blog`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-language")).toBe("es");
    const html = await index.text();
    expect(html).toContain("El blog de Safehubby");
    // Not the app: no app script, and it reads without JavaScript.
    expect(html).not.toContain("/assets/app-AbCd1234.js");
    const link = /<a href="(\/es\/blog\/[^"]+)"/.exec(html)?.[1];
    expect(link).toBeTruthy();
    const article = await fetch(`${base}${link}`);
    expect(article.status).toBe(200);
    expect(await article.text()).toContain(`"@type":"BlogPosting"`);
    expect((await fetch(`${base}/blog/no-such-article`)).status).toBe(404);
    expect(await (await fetch(`${base}/sitemap.xml`)).text()).toContain(`<loc>https://safehubby.com${link}</loc>`);
  });

  it("leaves the API's own not-found as JSON", async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("passes the deploy health check only with the web app in place, and logs a browser's crash without keeping anything personal", async () => {
    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
    const logged: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { logged.push(a.join(" ")); };
    try {
      const res = await fetch(`${base}/api/client-error`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "screen", message: "TypeError: x is undefined", path: "/careers", userAgent: "TestBrowser", stack: "at f\nat g" }),
      });
      expect(res.status).toBe(200);
    } finally { console.error = orig; }
    expect(logged.join("\n")).toContain("browser screen on /careers: TypeError: x is undefined");
    expect(logged.join("\n")).not.toContain("\nat g");
  });
});
