import Anthropic from "@anthropic-ai/sdk";
import { MAX_WORDS_PER_LINE, METHOD_RULES, PLATFORM_RULES } from "./method.ts";
import type { ScriptRequest } from "./request.ts";
import { KIDS_SCRIPT_SCHEMA, type KidsScript } from "./script.ts";

export const MODEL = "claude-opus-5";

/** Stable across requests so the prompt cache holds; everything per-episode goes in the user turn. */
export function buildSystemPrompt(): string {
  return [
    "You write scripts for children's YouTube videos, for a creator building an original series.",
    "Follow this method:",
    ...METHOD_RULES.map((rule, i) => `${i + 1}. ${rule}`),
    "",
    "Platform rules the script must respect:",
    ...PLATFORM_RULES.map((rule) => `- ${rule}`),
    "",
    "Script format:",
    "- beats are in time order; `at` is seconds from the start, and the first beat is at 0.",
    "- Beats: Hook, Setup, three or more repetition loops, a Twist, a Solution, a Sing-along recap, an Ending.",
    "- Set `pause` true on every line where the viewer is asked a question and should answer.",
    "- `cue` is a sound effect or on-screen action for the animator, or an empty string.",
    "- The catchphrase must appear word for word in at least three lines.",
    "- Give three title ideas (searchable: character + topic + 'for kids') and three thumbnail ideas.",
    "Write something original each time — a fresh situation, not a reskin of a common nursery plot.",
  ].join("\n");
}

export function buildUserPrompt(req: ScriptRequest): string {
  const items = req.items?.length ? `Items to feature, one per loop: ${req.items.join(", ")}.` : "";
  return [
    `Topic: ${req.topic.trim()}`,
    `Character: ${req.character.trim()}`,
    `Audience: ages ${req.ageRange}. Keep every line to ${MAX_WORDS_PER_LINE[req.ageRange]} words or fewer.`,
    `Length: about ${req.minutes} minute(s), so the last beat lands near ${req.minutes * 60} seconds.`,
    items,
  ]
    .filter(Boolean)
    .join("\n");
}

export class ScriptGenerationError extends Error {}

/**
 * Asks Claude for a script in the `KidsScript` shape. The client is passed
 * in so tests and callers control credentials; the CLI builds a default one.
 */
export async function generateWithClaude(req: ScriptRequest, client: Anthropic): Promise<KidsScript> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a policy decline the API reruns on Anthropic's recommended fallback model instead of returning nothing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: KIDS_SCRIPT_SCHEMA } },
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(req) }],
  });

  if (response.stop_reason === "refusal") {
    throw new ScriptGenerationError(
      `Claude declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}. Try a different topic.`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ScriptGenerationError("The script was cut off before it finished. Try a shorter length.");
  }

  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  try {
    return JSON.parse(text) as KidsScript;
  } catch {
    throw new ScriptGenerationError("Claude's reply wasn't a readable script. Run it again.");
  }
}
