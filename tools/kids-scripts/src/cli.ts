import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { generateWithClaude, ScriptGenerationError } from "./ai.ts";
import { PLATFORM_RULES, reviewScript } from "./method.ts";
import { AGE_RANGES, type AgeRange, type ScriptRequest, validateRequest } from "./request.ts";
import { renderMarkdown } from "./script.ts";
import { buildTemplateScript } from "./template.ts";

const USAGE = `Usage: pnpm gen --topic <topic> --character <name> [options]

  --topic       What the episode teaches, e.g. colors, counting, bedtime
  --character   The recurring star, e.g. "Pip the Puppy"
  --age         ${AGE_RANGES.join(" | ")} (default 2-4)
  --minutes     Target length, 1-8 (default 3)
  --items       Comma-separated things to find, one per loop
  --ai          Have Claude write an original script (needs ANTHROPIC_API_KEY)
  --out         Save the script to this Markdown file instead of printing it
`;

// Read by the error handler: an SDK setup error (e.g. no credentials at all) only means something with --ai.
let usedAi = false;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      topic: { type: "string", default: "" },
      character: { type: "string", default: "" },
      age: { type: "string", default: "2-4" },
      minutes: { type: "string", default: "3" },
      items: { type: "string" },
      ai: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const req: ScriptRequest = {
    topic: values.topic,
    character: values.character,
    ageRange: values.age as AgeRange,
    minutes: Number(values.minutes),
    items: values.items?.split(",").map((item) => item.trim()).filter(Boolean),
  };
  const errors = validateRequest(req);
  if (errors.length) {
    process.stderr.write(`${errors.join("\n")}\n\n${USAGE}`);
    return 1;
  }

  usedAi = values.ai;
  const script = values.ai ? await generateWithClaude(req, new Anthropic()) : buildTemplateScript(req);
  const markdown = [
    renderMarkdown(script, reviewScript(script, req.ageRange)),
    "## Before you upload",
    "",
    ...PLATFORM_RULES.map((rule) => `- ${rule}`),
    "",
  ].join("\n");

  if (values.out) {
    await writeFile(values.out, markdown);
    process.stdout.write(`Saved to ${values.out}\n`);
  } else {
    process.stdout.write(markdown);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ScriptGenerationError) {
      process.stderr.write(`${error.message}\n`);
    } else if (error instanceof Anthropic.AuthenticationError) {
      process.stderr.write("No valid Anthropic API key. Set ANTHROPIC_API_KEY, or drop --ai to use the offline template.\n");
    } else if (error instanceof Anthropic.RateLimitError) {
      process.stderr.write("Rate limited by the Claude API. Wait a minute and try again.\n");
    } else if (error instanceof Anthropic.APIError) {
      process.stderr.write(`Claude API error ${error.status}: ${error.message}\n`);
    } else if (usedAi) {
      process.stderr.write("Couldn't reach Claude. Set ANTHROPIC_API_KEY, or drop --ai to use the offline template.\n");
      process.stderr.write(`(${error instanceof Error ? error.message : String(error)})\n`);
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exit(1);
  },
);
