// Builds the agent-store books: books/src/*.md -> books/*.pdf and books/manifest.json.
// Run by hand after editing a book: `node apps/api/scripts/build-books.mjs` (needs Playwright's Chromium).
// The PDFs and the manifest are committed, so the server never needs a browser. A test checks they match the sources.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../books/", import.meta.url));
const { chromium } = createRequire(import.meta.url)("playwright");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function markdownToHtml(md) {
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const out = []; let i = 0; let title = ""; let subtitle = ""; const chapters = [];
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("# ")) { title = line.slice(2).trim(); i++; continue; }
    if (!subtitle && /^\*[^*].*\*$/.test(line.trim())) { subtitle = line.trim().slice(1, -1); i++; continue; }
    if (line.startsWith("## ")) { const t = line.slice(3).trim(); chapters.push(t); out.push(`<h2 id="${slugify(t)}">${inline(t)}</h2>`); i++; continue; }
    if (line.startsWith("```")) {
      const code = []; i++; while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]); i++;
      out.push(`<pre>${esc(code.join("\n"))}</pre>`);
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = []; while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows; const h = cells(head); const blankHead = h.every((c) => !c);
      out.push(`<table>${blankHead ? "" : `<thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`}<tbody>${body.map((r) => `<tr>${cells(r).map((c, n) => `<${n === 0 && blankHead ? "th" : "td"}>${inline(c)}</${n === 0 && blankHead ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line); const items = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : /^- /.test(lines[i]))) items.push(lines[i++].replace(ordered ? /^\d+\. / : /^- /, ""));
      const check = items.every((t) => t.startsWith("[ ] "));
      out.push(`<${ordered ? "ol" : "ul"}${check ? ' class="check"' : ""}>${items.map((t) => `<li>${inline(check ? t.slice(4) : t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#|\||- |\d+\. |```)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return { title, subtitle, chapters, body: out.join("\n") };
}

const CSS = `
@page { size: Letter; margin: 0.95in 0.9in 1in; }
* { box-sizing: border-box; }
body { font-family: Georgia, "Times New Roman", "Liberation Serif", "DejaVu Serif", serif; font-size: 11.5pt; line-height: 1.55; color: #1b1f24; }
.cover { height: 8.6in; display: flex; flex-direction: column; justify-content: center; border-left: 10px solid #1d4ed8; padding-left: 0.5in; break-after: page; }
.cover h1 { font-size: 34pt; line-height: 1.1; margin: 0 0 14pt; letter-spacing: -0.01em; }
.cover .sub { font-size: 15pt; color: #3b4452; margin: 0 0 28pt; font-style: italic; }
.cover .imprint { font-size: 10pt; color: #5b6573; max-width: 4.8in; }
.toc { break-after: page; } .toc h2 { break-before: auto; margin-top: 0; }
.toc ul { list-style: none; padding-left: 0; } .toc li { margin: 7pt 0; }
h2 { font-size: 20pt; line-height: 1.2; margin: 0 0 12pt; padding-top: 4pt; break-before: page; color: #0f2a6b; break-after: avoid; }
p { margin: 0 0 9pt; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 10pt; padding-left: 1.3em; } li { margin: 0 0 4pt; }
ul.check { list-style: none; padding-left: 0.2em; } ul.check li::before { content: "\\2610"; display: inline-block; width: 1.4em; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 14pt; font-size: 10.5pt; break-inside: avoid; }
th, td { border: 1px solid #b9c0ca; padding: 6pt 8pt; vertical-align: top; text-align: left; } th { background: #eef2f8; font-weight: 600; width: 40%; }
thead th { width: auto; } td { min-height: 22pt; }
strong { font-weight: 700; }
pre { font: 9.5pt/1.4 "DejaVu Sans Mono", "Liberation Mono", monospace; background: #f3f5f9; border: 1px solid #d3d9e3; border-radius: 4pt; padding: 8pt 10pt; margin: 0 0 12pt; white-space: pre-wrap; break-inside: avoid; }
`;

const bookHtml = ({ title, subtitle, chapters, body }, intro) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<section class="cover"><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p><p class="imprint">${inline(intro)}</p></section>
<section class="toc"><h2>Contents</h2><ul>${chapters.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>
${body}</body></html>`;

const files = readdirSync(join(root, "src")).filter((f) => f.endsWith(".md")).sort();
const browser = await chromium.launch();
const manifest = [];
for (const f of files) {
  const source = readFileSync(join(root, "src", f), "utf8");
  const description = /<!--\s*description:\s*([\s\S]*?)\s*-->/.exec(source)?.[1] ?? "";
  const parsed = markdownToHtml(source);
  // The first paragraph after the subtitle is the edition line; it goes on the cover, not in the body.
  const intro = /<p>(Safehubby, [^<]*)<\/p>/.exec(parsed.body)?.[1].replace(/<[^>]+>/g, "") ?? "Safehubby";
  parsed.body = parsed.body.replace(/<p>Safehubby, [^<]*<\/p>/, "");
  const slug = f.replace(/\.md$/, "");
  const page = await browser.newPage();
  await page.setContent(bookHtml(parsed, intro), { waitUntil: "load" });
  const pdf = await page.pdf({
    format: "Letter", printBackground: true, displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="width:100%;font:9px Georgia,serif;color:#6b7480;padding:0 0.9in;display:flex;justify-content:space-between"><span>${esc(parsed.title)} · Safehubby</span><span><span class="pageNumber"></span></span></div>`,
  });
  await page.close();
  writeFileSync(join(root, `${slug}.pdf`), pdf);
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  manifest.push({ slug, title: parsed.title, subtitle: parsed.subtitle, description, language: "en", pages, bytes: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex"), sourceSha256: createHash("sha256").update(source).digest("hex"), file: `${slug}.pdf` });
  console.log(`${slug}: ${pages} pages, ${(pdf.length / 1024).toFixed(0)} KB`);
}
await browser.close();
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
