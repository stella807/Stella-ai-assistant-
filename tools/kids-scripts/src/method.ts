import type { AgeRange } from "./request.ts";
import type { KidsScript } from "./script.ts";

/**
 * The method, written once. The template generator is built to satisfy it,
 * Claude is prompted with it, and `reviewScript` checks the result against
 * it — so a rule changed here changes all three.
 */
export const METHOD_RULES: readonly string[] = [
  "Hook in the first 5 seconds: the character and a problem in one line. No intro, no logo.",
  "Repetition: one catchphrase repeated every loop, at least 3 times. Kids love predicting what comes next.",
  "One simple idea per video (colors, counting, sharing, bedtime) — the thing parents search for.",
  "Short present-tense sentences with words a young child knows.",
  "Talk to the viewer: ask questions like \"Can YOU find it?\" and pause so they can answer.",
  "Something new every 5-10 seconds: a sound effect, a color, a silly mistake.",
  "Happy, safe ending that calls back to the hook, then a short sing-along recap.",
  "Series format: same character and same structure every episode so kids come back.",
];

/** Rules that can get a channel demonetized or removed — shown with every script, not buried in docs. */
export const PLATFORM_RULES: readonly string[] = [
  "Mark the video \"Made for Kids\" (COPPA). Comments and personalized ads switch off.",
  "YouTube demonetizes mass-produced, repetitive content. Keep an original character and make each episode different.",
  "No scary or violent twists, and no misleading thumbnails.",
];

/** Longest line, in words, a child in each range follows by ear. */
export const MAX_WORDS_PER_LINE: Record<AgeRange, number> = {
  "2-4": 8,
  "4-6": 10,
  "6-8": 14,
};

const MIN_CATCHPHRASE_REPEATS = 3;
const MIN_VIEWER_QUESTIONS = 3;
const HOOK_DEADLINE_SECONDS = 5;

// Whole-word matches only, so "skill" never trips "kill".
const UNSAFE_WORDS = [
  "kill", "killed", "kills", "blood", "bloody", "die", "dies", "died", "dead", "death",
  "gun", "guns", "knife", "knives", "weapon", "stab", "hate", "stupid", "dumb", "idiot", "shut up",
];
const UNSAFE_PATTERN = new RegExp(`\\b(${UNSAFE_WORDS.join("|")})\\b`, "i");

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Every way the script breaks the method, as notes a creator can act on. Empty means it passes. */
export function reviewScript(script: KidsScript, ageRange: AgeRange): string[] {
  const warnings: string[] = [];
  const lines = script.beats.flatMap((beat) => beat.lines);
  const first = script.beats[0];

  if (!first || first.at > HOOK_DEADLINE_SECONDS || first.lines.length === 0) {
    warnings.push(`Open with a hook in the first ${HOOK_DEADLINE_SECONDS} seconds.`);
  }

  const maxWords = MAX_WORDS_PER_LINE[ageRange];
  const long = lines.filter((line) => wordCount(line.text) > maxWords);
  if (long.length) {
    const sample = long[0]!.text;
    warnings.push(`${long.length} line(s) run over ${maxWords} words for ages ${ageRange}, e.g. "${sample}".`);
  }

  const catchphrase = normalize(script.catchphrase);
  const repeats = catchphrase ? lines.filter((line) => normalize(line.text).includes(catchphrase)).length : 0;
  if (repeats < MIN_CATCHPHRASE_REPEATS) {
    warnings.push(`The catchphrase appears ${repeats} time(s); repeat it at least ${MIN_CATCHPHRASE_REPEATS}.`);
  }

  const questions = lines.filter((line) => line.text.includes("?") && line.pause).length;
  if (questions < MIN_VIEWER_QUESTIONS) {
    warnings.push(`Only ${questions} viewer question(s) with a pause; ask at least ${MIN_VIEWER_QUESTIONS}.`);
  }

  const unsafe = [script.title, ...lines.map((line) => line.text)].find((text) => UNSAFE_PATTERN.test(text));
  if (unsafe) warnings.push(`Unsafe wording for kids: "${unsafe}".`);

  for (let i = 1; i < script.beats.length; i++) {
    if (script.beats[i]!.at <= script.beats[i - 1]!.at) {
      warnings.push(`Beat "${script.beats[i]!.label}" is out of time order.`);
      break;
    }
  }

  return warnings;
}
