import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
// The @font-face rules go first so the faces are known before anything that
// uses them, and the woff2 files ride along next to the stylesheet.
const fontDir = join(here, "fonts");
const faces = readFileSync(join(fontDir, "fonts.css"), "utf8");
write("site.css", `${faces}\n${STYLESHEET}`);
for (const file of readdirSync(fontDir).filter((f) => f.endsWith(".woff2"))) {
  mkdirSync(join(dist, "fonts"), { recursive: true });
  copyFileSync(join(fontDir, file), join(dist, "fonts", file));
}
console.log(`  fonts/  ${readdirSync(fontDir).filter((f) => f.endsWith(".woff2")).length} files, self-hosted`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    LANGS.map((l) => `  <url><loc>${ORIGIN}${pathFor(l)}</loc></url>`).join("\n") +
    `\n</urlset>\n`,
);
console.log(`Done → ${dist}`);
