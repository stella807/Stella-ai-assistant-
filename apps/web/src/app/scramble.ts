const NOISE = "▪▫◦·+×/\\|<>#%&01";

/** The text as it looks part-way through settling: letters on the left are right, the rest are noise. */
export function scrambleFrame(text: string, progress: number, rand: () => number = Math.random): string {
  const settled = Math.floor(text.length * Math.min(1, Math.max(0, progress)));
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    out += ch === " " || i < settled ? ch : NOISE[Math.floor(rand() * NOISE.length)]!;
  }
  return out;
}

const TARGETS = ".lux-eyebrow, .lux-tagline, .mission-eyebrow";

/**
 * Small caps lines scramble into place the first time they come into view, as the
 * reference's text does. The real text is never touched: a copy is laid over it and
 * removed at the end, so React and the language switch go on working, and anyone
 * reading the page gets the true words throughout.
 */
export function installScramble(): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const done = new WeakSet<Element>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || done.has(e.target)) continue;
      done.add(e.target);
      io.unobserve(e.target);
      run(e.target as HTMLElement);
    }
  }, { threshold: 0.6 });
  const seen = new WeakSet<Element>();
  const watch = () => document.querySelectorAll(TARGETS).forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
  watch();
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
}

function run(el: HTMLElement): void {
  const text = el.textContent ?? "";
  if (!text.trim()) return;
  const overlay = document.createElement("span");
  overlay.className = "scramble-overlay";
  overlay.setAttribute("aria-hidden", "true");
  el.classList.add("scrambling");
  el.appendChild(overlay);
  const start = performance.now();
  const total = 900;
  const tick = (now: number) => {
    const p = (now - start) / total;
    if (p >= 1 || !overlay.isConnected) { overlay.remove(); el.classList.remove("scrambling"); return; }
    overlay.textContent = scrambleFrame(text, p);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
