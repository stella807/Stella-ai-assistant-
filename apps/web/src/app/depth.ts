/**
 * Where an element is on the screen, as a number: 0 when it is centred, 1 when
 * it has just come in at the bottom, -1 when it has left at the top.
 */
export function depthProgress(top: number, height: number, viewportHeight: number): number {
  const centre = top + height / 2;
  const p = (centre - viewportHeight / 2) / (viewportHeight / 2 + height / 2);
  return Math.max(-1, Math.min(1, Math.round(p * 1000) / 1000));
}

const TARGETS = ".landing .card, .landing .banner";

/**
 * Sets --p on each card as the page scrolls. Only cards near the screen are
 * measured, and only on animation frames, so scrolling stays smooth. Done here
 * rather than with CSS scroll timelines because the cards sit inside the
 * carousel, whose own scroller would otherwise be the one they were measured against.
 */
export function installDepth(): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const near = new Set<HTMLElement>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) near.add(e.target as HTMLElement);
      else near.delete(e.target as HTMLElement);
    }
  }, { rootMargin: "20% 0px" });
  const seen = new WeakSet<Element>();
  const watch = () => document.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
  watch();
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });

  let queued = false;
  const update = () => {
    queued = false;
    const vh = window.innerHeight;
    for (const el of near) {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--p", String(depthProgress(r.top, r.height, vh)));
    }
  };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", ask, { passive: true });
  window.addEventListener("resize", ask);
  setInterval(ask, 500); // the carousel's own scrolling and layout shifts do not fire a page scroll
}
