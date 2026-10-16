import { useEffect, useRef, type ReactNode, type Ref } from "react";

/**
 * The shell every pop-up card shares: a floating card over a dimmed page,
 * with a header, a body that scrolls, and a footer that stays put.
 *
 * The footer is the point. The old sheet was one long scrolling column with
 * the message box at the very bottom of it, so replying meant scrolling past
 * everything else on the task — and the composer scrolled out of reach just
 * when a conversation was long enough to need it. Here only the middle
 * moves.
 *
 * It also has to behave like the dialog it says it is. Escape closes it,
 * focus moves inside on open so a keyboard or screen-reader user is not left
 * on the page underneath, and whatever was focused before gets it back.
 */
export function PopupCard({ label, onClose, header, footer, bodyRef, children }: {
  label: string;
  onClose: () => void;
  header: ReactNode;
  footer?: ReactNode;
  /** For the owner of a chat to keep its thread scrolled to the newest. */
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup-card" ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()}>
        <div className="popup-head">{header}</div>
        <div className="popup-body" ref={bodyRef}>{children}</div>
        {footer && <div className="popup-foot">{footer}</div>}
      </div>
    </div>
  );
}
