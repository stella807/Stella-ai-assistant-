import type { VoiceMessage } from "@safehubby/core";
import type { TaskTextMessage } from "../api.ts";
import { useLanguage } from "../i18n.tsx";
import { taskWords } from "../app/task-copy.ts";
import { localeOf } from "../app/dates.ts";

/**
 * One conversation, in the order it happened.
 *
 * Typed messages and voice notes used to render as two separate lists with
 * the compose box between them, so an exchange that alternated — "which
 * one?", a voice note back, "that one" — could not be read in order at all.
 * They are one thread to the people having it, so they are one thread here.
 *
 * Times are shown on every message rather than only on the first of a run:
 * the person reading is often waiting on somebody to arrive, and "is this
 * from four minutes ago or yesterday" is the actual question they have.
 */

export type ThreadEntry =
  | { kind: "text"; at: string; message: TaskTextMessage }
  | { kind: "voice"; at: string; message: VoiceMessage };

/** Merges both kinds into a single timeline, oldest first. */
export function buildThread(texts: TaskTextMessage[], voices: VoiceMessage[]): ThreadEntry[] {
  const entries: ThreadEntry[] = [
    ...texts.map((m): ThreadEntry => ({ kind: "text", at: m.createdAt, message: m })),
    ...voices.map((m): ThreadEntry => ({ kind: "voice", at: m.createdAt, message: m })),
  ];
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** "2:41 PM" today, "Mar 3, 2:41 PM" before that. */
function when(iso: string, lang: "en" | "es"): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return at.toLocaleTimeString(localeOf(lang), {
    hour: "numeric", minute: "2-digit",
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
  });
}

export function TaskMessageThread({ texts, voices, assistantName }: {
  texts: TaskTextMessage[];
  voices: VoiceMessage[];
  assistantName: string;
}) {
  const { language } = useLanguage();
  const w = taskWords(language).thread;
  const thread = buildThread(texts, voices);

  if (thread.length === 0) {
    return (
      <div className="voice-thread" aria-live="polite">
        <p className="tiny muted">{w.none}</p>
      </div>
    );
  }

  return (
    <div className="voice-thread" aria-live="polite">
      {thread.map((entry) => {
        const mine = entry.message.sender === "traveler";
        return (
          <div key={entry.message.id} className={`voice-bubble${mine ? " voice-bubble-mine" : ""}`}>
            <div className="tiny muted">
              {mine ? w.you : assistantName}
              {" · "}{when(entry.at, language)}
              {entry.kind === "voice" && ` · ${entry.message.durationSeconds}s`}
              {entry.kind === "text" && mine && entry.message.readAt ? w.read : ""}
            </div>
            {entry.kind === "text" ? (
              <p className="small" style={{ margin: 0 }}>{entry.message.body}</p>
            ) : (
              /* eslint-disable-next-line jsx-a11y/media-has-caption -- a
                 transcript isn't available for a voice note recorded on the
                 fly, same tradeoff every voice-message product makes. */
              <audio controls src={`data:${entry.message.mimeType};base64,${entry.message.audioBase64}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
