import { useRef, useState } from "react";

const HOLD_MS = 1200;

/**
 * Hold-to-send rather than tap-to-send: a pocket tap must not fire an emergency
 * alert, but the gesture still has to be doable one-handed and impaired.
 */
export function SosButton({ onSend }: { onSend: (silent: boolean) => void }) {
  const [progress, setProgress] = useState(0);
  const [silent, setSilent] = useState(false);
  const timer = useRef<number | null>(null);

  const start = () => {
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - began) / HOLD_MS);
      setProgress(pct);
      if (pct >= 1) {
        stop();
        onSend(silent);
      }
    }, 40);
  };

  const stop = () => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };

  return (
    <section className="stack" aria-label="Emergency">
      <button
        className="sos"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        /* The fill tracks the hold. Both stops are tokens, so the button stays
           a real red in dark mode — --danger is tuned for red *type* on black
           and turns the largest control in the app pink when used as a fill. */
        style={{
          background: `linear-gradient(90deg, var(--danger-deep) ${progress * 100}%, var(--danger-solid) ${progress * 100}%)`,
        }}
      >
        {progress > 0 ? "Keep holding…" : silent ? "HOLD FOR SILENT SOS" : "HOLD FOR SOS"}
      </button>

      <label className="row small muted" style={{ gap: 8 }}>
        <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} />
        Silent — send location without a call, in case being on the phone isn't safe
      </label>

      <p className="tiny muted">
        For a medical emergency, call 911. Safehubby alerts the people watching you; it does not contact emergency services.
      </p>
    </section>
  );
}
