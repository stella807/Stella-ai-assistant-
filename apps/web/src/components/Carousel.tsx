import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";

/**
 * A scroll-snap carousel: track, dots, arrows, and the two bits of bookkeeping
 * that a naive version always gets wrong.
 *
 * Native scroll-snap rather than a gesture handler — swiping on a phone is the
 * browser's job, and reimplementing it badly is how carousels end up fighting
 * the scroll. The arrows and dots just scroll the same container.
 *
 * Lifted out of LandingIntro, which had the only copy, when the plans screen
 * needed the same thing. Both use it now: a second implementation would have
 * been the money-formatter problem again, where two near-identical helpers
 * drift until one of them is subtly wrong.
 */
/** Imperative handle for a parent that needs to jump the carousel itself —
 *  the landing page's "Get started" buttons send the reader to the signup
 *  slide from a slide that is not adjacent to it, which dots and arrows
 *  cannot do on their own. Omit the ref entirely for a carousel nobody
 *  outside it needs to drive, which is every other user of this component. */
export interface CarouselHandle {
  goTo(index: number): void;
}

export const Carousel = forwardRef<CarouselHandle, {
  /** One per slide, used for the dot's accessible name and the caption. */
  labels: string[];
  ariaLabel: string;
  /** Advance on its own until the reader touches it. Omit for a carousel that
   *  only ever moves when asked — which is what a list of prices wants. */
  autoAdvanceMs?: number;
  prevLabel: string;
  nextLabel: string;
  /** Print the current slide's label under the dots. */
  showCaption?: boolean;
  onEngage?: () => void;
  children: ReactNode;
}>(function Carousel({ labels, ariaLabel, autoAdvanceMs, prevLabel, nextLabel, showCaption, onEngage, children }, ref) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);

  const engage = () => { setEngaged(true); onEngage?.(); };

  const goTo = (next: number) => {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(next, labels.length - 1));
    engage();
    // The slide's own offset, not clientWidth * index: the product drifts a
    // sub-pixel and leaves a sliver of the neighbour showing at the edge.
    const slide = el.children[clamped] as HTMLElement | undefined;
    el.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: "smooth" });
    setIndex(clamped);
  };

  useImperativeHandle(ref, () => ({ goTo }));

  // Which slide is on screen, read from the scroll position rather than
  // tracked separately — a swipe moves the container, not our state.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / (el.clientWidth || 1)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!autoAdvanceMs || engaged) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      const el = track.current;
      if (!el) return;
      const current = Math.round(el.scrollLeft / (el.clientWidth || 1));
      const next = (current + 1) % labels.length;
      const slide = el.children[next] as HTMLElement | undefined;
      el.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: "smooth" });
      setIndex(next);
    }, autoAdvanceMs);
    return () => clearInterval(timer);
  }, [autoAdvanceMs, engaged, labels.length]);

  // The track is a flex row, so its natural height is the tallest slide —
  // which would leave the short ones sitting above a canyon of empty space.
  // Measure whichever slide is on screen and size the track to it.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const fit = () => {
      const slide = el.children[index] as HTMLElement | undefined;
      if (slide) el.style.height = `${slide.offsetHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    for (const child of Array.from(el.children)) observer.observe(child);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, [index, labels.length]);

  return (
    <div className="stack" onPointerDown={engage} onKeyDown={engage} onFocus={engage}>
      <div className="slides" ref={track} aria-live="off">{children}</div>

      <div className="slide-nav">
        <button className="btn btn-sm btn-ghost" disabled={index === 0}
          onClick={() => goTo(index - 1)} aria-label={prevLabel}>
          ←
        </button>

        <div className="slide-dots" role="tablist" aria-label={ariaLabel}>
          {labels.map((label, i) => (
            <button key={label} role="tab" aria-current={index === i} aria-label={label}
              onClick={() => goTo(i)} />
          ))}
        </div>

        <button className="btn btn-sm btn-ghost" disabled={index === labels.length - 1}
          onClick={() => goTo(index + 1)} aria-label={nextLabel}>
          →
        </button>
      </div>

      {showCaption && (
        <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>{labels[index]}</p>
      )}
    </div>
  );
});
