/**
 * Which way a finished drag asks the deck to go: 1 forward (a swipe to the
 * left), -1 back, 0 for anything else. A drag has to be long enough and more
 * sideways than up-and-down, or it was somebody scrolling the page.
 */
export function swipeIntent(dx: number, dy: number, threshold = 56): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.3) return 0;
  return dx < 0 ? 1 : -1;
}

/** The slide a move lands on, kept inside the deck. */
export function stepFor(current: number, delta: number, count: number): number {
  return Math.max(0, Math.min(count - 1, current + delta));
}

/** True when a drag starting on this element belongs to something inside the slide, not to the deck. */
export function ownsHorizontalDrag(start: Element | null, stopAt: Element): boolean {
  for (let el = start; el && el !== stopAt; el = el.parentElement) {
    if (el.matches("input, textarea, select, [contenteditable], [role=slider]")) return true;
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
  }
  return false;
}
