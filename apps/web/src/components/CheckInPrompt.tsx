import { useEffect, useState } from "react";
import type { CheckIn } from "@safehubby/core";
import { useLanguage } from "../i18n.tsx";
import { nightWords } from "../app/night-copy.ts";

/** Counts down to the next check-in and turns into the prompt when it is due. */
export function CheckInPrompt({ checkIn, onAnswer, busy }: {
  checkIn: CheckIn | null;
  onAnswer: (rating: number) => void;
  busy: boolean;
}) {
  const w = nightWords(useLanguage().language).checkIn;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!checkIn) return null;

  const msLeft = new Date(checkIn.dueAt).getTime() - now;
  const due = msLeft <= 0;

  return (
    <section className={due ? "card card-hero card-alarm stack" : "card card-hero stack"} aria-label={w.label}>
      <div className="row-between">
        <h3>{due ? w.now : w.next}</h3>
        {/* Tabular figures: the countdown reflows every second, and a pill that
            changes width once a second is a twitch in the corner of the eye. */}
        <span className={due ? "pill pill-danger num" : "pill num"}>{formatCountdown(msLeft, w.due)}</span>
      </div>

      {due ? (
        <>
          <p className="small">{w.how}</p>
          <div className="row wrap">
            {[5, 4, 3, 2, 1].map((rating) => ({ rating, label: w.ratings[rating - 1]! })).map((o) => (
              <button key={o.rating} className="btn btn-sm grow" disabled={busy} onClick={() => onAnswer(o.rating)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="small muted">{w.miss}</p>
      )}
    </section>
  );
}

function formatCountdown(ms: number, dueLabel: string): string {
  if (ms <= 0) return dueLabel;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
