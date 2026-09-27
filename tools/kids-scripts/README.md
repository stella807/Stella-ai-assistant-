# Kids script generator

Writes scripts for kids' YouTube videos using a repeatable method: hook in
five seconds, a catchphrase repeated every loop, questions that pause for the
child to answer, a happy ending and a sing-along recap.

This is a standalone tool. It isn't part of the Safehubby app, isn't in the
pnpm workspace, and isn't touched by the app's build, tests or Docker image.

## Setup

```bash
cd tools/kids-scripts
pnpm install --ignore-workspace
```

## Use

```bash
# Offline template, no API key needed
pnpm gen --topic colors --character "Pip the Puppy"

# Original script written by Claude
export ANTHROPIC_API_KEY=sk-ant-...
pnpm gen --topic "sharing toys" --character "Pip the Puppy" --age 4-6 --minutes 4 --ai --out pip-sharing.md
```

| Option | Meaning |
|---|---|
| `--topic` | What the episode teaches: colors, counting, animals, shapes, bedtime and brushing teeth have built-in packs; anything else works too |
| `--character` | The recurring star. Keep it the same every episode to build a series |
| `--age` | `2-4`, `4-6` or `6-8` (sets the max words per line: 8, 10, 14) |
| `--minutes` | 1–8, default 3 |
| `--items` | Comma-separated things to find, one repetition loop each |
| `--ai` | Have Claude write it (Claude Opus 5, with structured output) |
| `--out` | Save to a Markdown file instead of printing |

Every script, template or Claude-written, is checked against the method
(`src/method.ts`): hook timing, line length for the age, catchphrase repeats,
viewer questions, and unsafe words. Anything that fails shows up under
**Review notes** at the bottom of the script.

## Where things live

- `src/method.ts`: the rules, and `reviewScript`, which checks a script against them. Change a rule here and the template, the Claude prompt and the review all follow.
- `src/template.ts`: the offline generator and its topic packs.
- `src/ai.ts`: the Claude prompt and API call.
- `src/cli.ts`: the command line.

```bash
pnpm test
pnpm typecheck
```
