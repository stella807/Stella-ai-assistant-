/** Where, inside a card, the pointer is: the point its soft light follows. */
export function spotlightOffset(rect: { left: number; top: number }, clientX: number, clientY: number) {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** How far to lean a surface toward the pointer: x and y are the pointer's place inside it, as 0..1 fractions. */
export function tiltFor(fx: number, fy: number, maxDeg: number): { rx: number; ry: number } {
  const c = (v: number) => Math.max(0, Math.min(1, v)) - 0.5;
  // "+ 0" turns a negative zero into a plain one.
  return { rx: Math.round(-c(fy) * 2 * maxDeg * 100) / 100 + 0, ry: Math.round(c(fx) * 2 * maxDeg * 100) / 100 + 0 };
}

const CARDS = ".landing .card, .app-customer .card, .lux-hero";
const MAGNETS = ".lux-btn";

/**
 * One listener for the whole app: the card under the pointer gets its position
 * in two CSS variables, and the stylesheet draws a faint light there. Nothing is
 * stored and nothing re-renders, so it costs almost nothing.
 */
export function installSpotlight(): void {
  // Leaning toward a pointer only makes sense where there is a hovering pointer.
  const hovers = window.matchMedia?.("(hover: hover)").matches;
  document.addEventListener(
    "pointermove",
    (e) => {
      const target = e.target as Element | null;
      const card = target?.closest?.(CARDS) as HTMLElement | null;
      if (card) {
        const r = card.getBoundingClientRect();
        const { x, y } = spotlightOffset(r, e.clientX, e.clientY);
        card.style.setProperty("--mx", `${x}px`);
        card.style.setProperty("--my", `${y}px`);
        if (hovers && r.width > 0) {
          const { rx, ry } = tiltFor(x / r.width, y / r.height, card.classList.contains("lux-hero") ? 3 : 4);
          card.style.setProperty("--rx", `${rx}deg`);
          card.style.setProperty("--ry", `${ry}deg`);
        }
      }
      const magnet = hovers ? (target?.closest?.(MAGNETS) as HTMLElement | null) : null;
      if (magnet) {
        const r = magnet.getBoundingClientRect();
        magnet.style.setProperty("--bx", `${((e.clientX - (r.left + r.width / 2)) * 0.12).toFixed(1)}px`);
        magnet.style.setProperty("--by", `${((e.clientY - (r.top + r.height / 2)) * 0.2).toFixed(1)}px`);
      }
    },
    { passive: true },
  );
  // Let go when the pointer leaves.
  document.addEventListener("pointerout", (e) => {
    const from = (e.target as Element | null)?.closest?.(`${CARDS}, ${MAGNETS}`) as HTMLElement | null;
    if (!from || from.contains(e.relatedTarget as Node | null)) return;
    for (const v of ["--rx", "--ry", "--bx", "--by"]) from.style.removeProperty(v);
  }, { passive: true });
}
