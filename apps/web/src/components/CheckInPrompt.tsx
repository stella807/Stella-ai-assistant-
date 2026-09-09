import { useEffect, useState } from "react";
import type { CheckIn } from "@safehubby/core";

/** Counts down to the next check-in and turns into the prompt when it is due. */
export function CheckInPrompt({ checkIn, onAnswer, busy }: {
  checkIn: CheckIn | null;
  onAnswer: (rating: number) => void;
  busy: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!checkIn) return null;

  const msLeft = new Date(checkIn.dueAt).getTime() - now;
  const due = msLeft <= 0;

  return (
    <section className={due ? "card stack banner-danger" : "card stack"} aria-label="Check-in">
      <div className="row-between">
        <h3>{due ? "Check in now" : "Next check-in"}</h3>
        <span className={due ? "pill pill-danger" : "pill"}>{formatCountdown(msLeft)}</span>
      </div>

      {due ? (
        <>
          <p className="small">How are you doing? Tap one — that's it.</p>
          <div className="row wrap">
            {[
              { rating: 5, label: "Great" },
              { rating: 4, label: "Good" },
              { rating: 3, label: "Okay" },
              { rating: 2, label: "Rough" },
              { rating: 1, label: "Bad" },
            ].map((o) => (
              <button key={o.rating} className="btn btn-sm grow" disabled={busy} onClick={() => onAnswer(o.rating)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="small muted">
          Miss it and whoever is watching gets a heads-up. Check-ins get more frequent as the night goes on.
        </p>
      )}
    </section>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Due";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
