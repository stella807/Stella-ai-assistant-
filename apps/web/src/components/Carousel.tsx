import { Children, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ownsHorizontalDrag, stepFor, swipeIntent } from "../app/deck.ts";
import { emitWarp } from "../app/warp.ts";

/**
 * A deck of slides that the reader travels through in depth: moving forward,
 * the slide on screen flies past the camera while the next one comes up out of
 * the distance, its cards swinging in like panels of glass one after another;
 * moving back runs the same flight in reverse. The whole background (particles
 * and liquid light, see app/warp.ts) rushes past with it.
 *
 * Swiping still works: a sideways drag pulls the slide toward the direction it
 * will go and lets go past a threshold. Vertical drags are left to the page, and
 * drags that start on something that scrolls sideways itself (a wide table) or on
 * a form field belong to that thing, not to the deck.
 *
 * Every slide stays mounted, hidden when not on screen, so a half-filled form
 * on the signup slide survives a trip to the prices and back.
 *
 * Used by LandingIntro and the plans screen. A second implementation would drift
 * from this one, which is why both share it.
 */
/** Imperative handle for a parent that needs to jump the carousel itself —
 *  the landing page's "Get started" buttons send the reader to the signup
 *  slide from a slide that is not adjacent to it, which dots and arrows
 *  cannot do on their own. Omit the ref entirely for a carousel nobody
 *  outside it needs to drive, which is every other user of this component. */
export interface CarouselHandle {
  goTo(index: number): void;
}

/** How long a move takes, start to settled; the CSS in deck.css is timed to match. */
const MOVE_MS = 1000;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

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
  /** Told every time the on-screen slide changes, index included — for a
   *  parent that shows its own summary of all the slides (the plan price
   *  ladder) and needs to know which one the carousel is currently on. */
  onIndexChange?: (index: number) => void;
  children: ReactNode;
}>(function Carousel({
  labels, ariaLabel, autoAdvanceMs, prevLabel, nextLabel, showCaption, onEngage, onIndexChange, children,
}, ref) {
  const slides = Children.toArray(children);
  const stage = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const current = useRef(0);
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [move, setMove] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const settle = useRef<number | undefined>(undefined);

  const engage = () => { setEngaged(true); onEngage?.(); };

  /** `towards` overrides the direction of travel: the auto-advance wraps from the last slide to the first and should still fly forward. */
  const travel = (target: number, towards?: 1 | -1) => {
    const from = current.current;
    const to = stepFor(0, target, labels.length);
    if (to === from) return;
    const dir = towards ?? (to > from ? 1 : -1);
    const still = reducedMotion();
    // Hold the stage at its present height so the page does not jump while the
    // two slides change places; the layout effect below eases it to the new one.
    if (stage.current && !still) {
      stage.current.style.height = `${stage.current.offsetHeight}px`;
      // Read it back so the browser registers this height before the new one is
      // set; otherwise both land in the same frame and the height jumps instead of easing.
      void stage.current.offsetHeight;
    }
    current.current = to;
    setDirection(dir);
    setLeaving(still ? null : from);
    setIndex(to);
    setMove((m) => m + 1);
    onIndexChange?.(to);
    if (!still) emitWarp(dir);
    // If the reader was down at the bottom of a long slide, cut straight to the
    // top of the new one so the flight plays where they are looking. Scrolling
    // smoothly here meant the page raced thousands of pixels upward at the same
    // moment as the flight, and the new slide never arrived in the middle of the screen.
    const top = wrap.current?.getBoundingClientRect().top ?? 0;
    // "auto" is an instant jump here (the site sets no smooth scrolling), and unlike "instant" every Safari accepts it.
    if (top < 0) wrap.current?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  const goTo = (next: number) => { engage(); travel(next); };

  // Called from buttons elsewhere on the page (the hero's Get started and
  // Plans): changing slide alone leaves the person staring at the hero, so
  // bring the carousel to the top of the screen as well. The dots and arrows
  // call goTo directly and must not move the page.
  useImperativeHandle(ref, () => ({
    goTo: (next: number) => {
      goTo(next);
      wrap.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    },
  }));

  // Ease the stage from the old slide's height to the new one's, then let it go
  // back to following its content.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || move === 0) return;
    const active = el.querySelector<HTMLElement>(':scope > [data-state="active"]');
    if (active && el.style.height) el.style.height = `${active.offsetHeight}px`;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      el.style.height = "";
      setLeaving(null);
    }, MOVE_MS);
  }, [move]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  useEffect(() => {
    if (!autoAdvanceMs || engaged) return;
    if (reducedMotion()) return;
    const timer = setInterval(() => {
      travel((current.current + 1) % labels.length, 1);
    }, autoAdvanceMs);
    return () => clearInterval(timer);
  }, [autoAdvanceMs, engaged, labels.length]);

  // Sideways drag. Only touch and pen: a mouse dragging across a page is
  // selecting text, and has the arrows and dots.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const setPull = (v: number) => stage.current?.style.setProperty("--pull", v.toFixed(3));
  const endDrag = () => {
    drag.current = null;
    stage.current?.classList.remove("dragging");
    setPull(0);
  };

  return (
    <div className="stack" ref={wrap} style={{ scrollMarginTop: 12 }} onPointerDown={engage} onKeyDown={engage} onFocus={engage}>
      <div
        className={`deck ${direction > 0 ? "fwd" : "back"}${leaving !== null ? " moving" : ""}`}
        ref={stage}
        aria-live="off"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || !stage.current) return;
          if (ownsHorizontalDrag(e.target as Element, stage.current)) return;
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !stage.current) return;
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          // Mostly vertical: the person is scrolling, so stop watching.
          if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.2) { endDrag(); return; }
          if (Math.abs(dx) > 6) stage.current.classList.add("dragging");
          setPull(Math.max(-1, Math.min(1, dx / (stage.current.clientWidth || 1))));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          endDrag();
          if (!d) return;
          const intent = swipeIntent(e.clientX - d.x, e.clientY - d.y);
          if (intent !== 0) goTo(current.current + intent);
        }}
        onPointerCancel={endDrag}
      >
        {slides.map((slide, i) => {
          const state = i === index ? "active" : i === leaving ? "leaving" : "idle";
          return (
            <div key={i} className="deck-slide" data-state={state} aria-hidden={state === "active" ? undefined : true}>
              {slide}
            </div>
          );
        })}
      </div>

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
        <p key={index} className="tiny muted deck-caption" style={{ textAlign: "center", margin: 0 }}>{labels[index]}</p>
      )}
    </div>
  );
});
