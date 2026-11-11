/**
 * The "camera" moving through the site. A transition announces it, and the
 * background layers (particles, liquid light) answer by rushing past for a
 * moment, so the whole scene travels with the content rather than just the
 * card in front.
 */
export const WARP_EVENT = "safehubby:warp";

export function emitWarp(direction: 1 | -1 = 1): void {
  window.dispatchEvent(new CustomEvent(WARP_EVENT, { detail: { direction } }));
}

/** 0 → 1 → 0 over the length of one move: a fast rise and a long settle, like braking after a jump. */
export function warpCurve(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return t < 0.25 ? t / 0.25 : Math.pow(1 - (t - 0.25) / 0.75, 2);
}

/**
 * Follows the warps and calls back with the current strength every frame while
 * one is running; returns the strength at any moment through `read`.
 */
export function followWarp(durationMs = 1100): { read: () => { strength: number; direction: number } } {
  let start = -1;
  let direction = 1;
  window.addEventListener(WARP_EVENT, (e) => {
    start = performance.now();
    direction = (e as CustomEvent<{ direction: number }>).detail?.direction ?? 1;
  });
  return {
    read: () => {
      if (start < 0) return { strength: 0, direction };
      const t = (performance.now() - start) / durationMs;
      if (t >= 1) { start = -1; return { strength: 0, direction }; }
      return { strength: warpCurve(t), direction };
    },
  };
}
