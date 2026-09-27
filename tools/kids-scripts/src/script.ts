/**
 * The shape both generators produce — the offline template and Claude — so
 * rendering and review never care which one wrote the script.
 */
export interface ScriptLine {
  speaker: string;
  text: string;
  /** A beat of silence after a question so the child can answer out loud. */
  pause: boolean;
  /** Sound effect or on-screen action, e.g. "boing!" or "ball rolls out". Empty when none. */
  cue: string;
}

export interface Beat {
  /** Seconds from the start of the video. */
  at: number;
  label: string;
  lines: ScriptLine[];
}

export interface KidsScript {
  title: string;
  titleIdeas: string[];
  thumbnailIdeas: string[];
  /** The line repeated every loop — the thing kids chant back. */
  catchphrase: string;
  beats: Beat[];
}

/** JSON schema for `KidsScript`, used as Claude's structured output format. */
export const KIDS_SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "titleIdeas", "thumbnailIdeas", "catchphrase", "beats"],
  properties: {
    title: { type: "string" },
    titleIdeas: { type: "array", items: { type: "string" } },
    thumbnailIdeas: { type: "array", items: { type: "string" } },
    catchphrase: { type: "string" },
    beats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["at", "label", "lines"],
        properties: {
          at: { type: "integer" },
          label: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["speaker", "text", "pause", "cue"],
              properties: {
                speaker: { type: "string" },
                text: { type: "string" },
                pause: { type: "boolean" },
                cue: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function renderMarkdown(script: KidsScript, warnings: string[] = []): string {
  const out: string[] = [`# ${script.title}`, "", `**Catchphrase:** "${script.catchphrase}"`, ""];

  for (const beat of script.beats) {
    out.push(`## ${formatTimestamp(beat.at)} — ${beat.label}`, "");
    for (const line of beat.lines) {
      const cue = line.cue ? ` *[${line.cue}]*` : "";
      const pause = line.pause ? " *(pause 2s)*" : "";
      out.push(`**${line.speaker}:** ${line.text}${pause}${cue}  `);
    }
    out.push("");
  }

  if (script.titleIdeas.length) {
    out.push("## Title ideas", "", ...script.titleIdeas.map((t) => `- ${t}`), "");
  }
  if (script.thumbnailIdeas.length) {
    out.push("## Thumbnail ideas", "", ...script.thumbnailIdeas.map((t) => `- ${t}`), "");
  }
  if (warnings.length) {
    out.push("## Review notes", "", ...warnings.map((w) => `- ⚠️ ${w}`), "");
  }

  return out.join("\n");
}
