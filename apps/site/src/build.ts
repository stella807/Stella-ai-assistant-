import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, ORIGIN } from "./content.ts";
import { STYLESHEET, pathFor, renderPage } from "./render.ts";

/**
 * Writes the whole site to `dist/`. Plain files, no server — deployable to
 * Railway, Netlify, Cloudflare Pages or an S3 bucket without changing
 * anything.
 */

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");

function write(relative: string, body: string): void {
  const target = join(dist, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, "utf8");
  console.log(`  ${relative}  ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB`);
}

console.log("Building the Safehubby site…");
for (const lang of LANGS) {
  write(lang === "en" ? "index.html" : "es/index.html", renderPage(lang));
}
write("site.css", STYLESHEET);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    LANGS.map((l) => `  <url><loc>${ORIGIN}${pathFor(l)}</loc></url>`).join("\n") +
    `\n</urlset>\n`,
);
console.log(`Done → ${dist}`);
