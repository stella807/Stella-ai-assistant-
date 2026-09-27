/**
 * What a creator asks for. Everything else — the beat structure, the
 * repetition, the pacing — comes from the method in `method.ts`, so two
 * scripts for different topics still feel like the same show.
 */
export type AgeRange = "2-4" | "4-6" | "6-8";

export const AGE_RANGES: readonly AgeRange[] = ["2-4", "4-6", "6-8"];

export interface ScriptRequest {
  /** What the episode teaches, e.g. "colors", "counting to 5", "brushing teeth". */
  topic: string;
  /** The recurring star, e.g. "Pip the Puppy". Same character every episode is what builds a series. */
  character: string;
  ageRange: AgeRange;
  /** Target runtime. Short enough to hold a toddler, long enough for three repetition loops. */
  minutes: number;
  /** Things the character finds or counts, one per loop. Filled from the topic when left empty. */
  items?: string[];
}

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 8;
const MAX_TEXT = 60;
const MAX_ITEMS = 6;

/** Returns every problem with the request, so a CLI user fixes them in one pass rather than one per run. */
export function validateRequest(req: ScriptRequest): string[] {
  const errors: string[] = [];
  const topic = req.topic.trim();
  const character = req.character.trim();

  if (!topic) errors.push("Give the episode a topic, e.g. --topic colors.");
  else if (topic.length > MAX_TEXT) errors.push(`Keep the topic under ${MAX_TEXT} characters.`);

  if (!character) errors.push('Name the character, e.g. --character "Pip the Puppy".');
  else if (character.length > MAX_TEXT) errors.push(`Keep the character name under ${MAX_TEXT} characters.`);

  if (!AGE_RANGES.includes(req.ageRange)) errors.push(`Age range must be one of ${AGE_RANGES.join(", ")}.`);

  if (!Number.isFinite(req.minutes) || req.minutes < MIN_MINUTES || req.minutes > MAX_MINUTES) {
    errors.push(`Length must be between ${MIN_MINUTES} and ${MAX_MINUTES} minutes.`);
  }

  if (req.items) {
    if (req.items.length > MAX_ITEMS) errors.push(`Use at most ${MAX_ITEMS} items.`);
    if (req.items.some((item) => !item.trim() || item.length > MAX_TEXT)) {
      errors.push(`Each item needs a name under ${MAX_TEXT} characters.`);
    }
  }

  return errors;
}
