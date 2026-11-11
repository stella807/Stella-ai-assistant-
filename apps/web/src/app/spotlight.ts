/** Where, inside a card, the pointer is: the point its soft light follows. */
export function spotlightOffset(rect: { left: number; top: number }, clientX: number, clientY: number) {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

const CARDS = ".landing .card, .app-customer .card";

/**
 * One listener for the whole app: the card under the pointer gets its position
 * in two CSS variables, and the stylesheet draws a faint light there. Nothing is
 * stored and nothing re-renders, so it costs almost nothing.
 */
export function installSpotlight(): void {
  document.addEventListener(
    "pointermove",
    (e) => {
      const card = (e.target as Element | null)?.closest?.(CARDS) as HTMLElement | null;
      if (!card) return;
      const { x, y } = spotlightOffset(card.getBoundingClientRect(), e.clientX, e.clientY);
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);
    },
    { passive: true },
  );
}
