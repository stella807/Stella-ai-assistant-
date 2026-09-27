import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt, buildUserPrompt, generateWithClaude, MODEL, ScriptGenerationError } from "../src/ai.ts";
import { METHOD_RULES, reviewScript } from "../src/method.ts";
import { AGE_RANGES, type ScriptRequest, validateRequest } from "../src/request.ts";
import { formatTimestamp, type KidsScript, renderMarkdown } from "../src/script.ts";
import { buildTemplateScript, pickPack } from "../src/template.ts";

const base: ScriptRequest = { topic: "colors", character: "Pip the Puppy", ageRange: "2-4", minutes: 3 };

describe("validateRequest", () => {
  it("accepts a normal request", () => {
    expect(validateRequest(base)).toEqual([]);
  });

  it("reports every problem at once", () => {
    const errors = validateRequest({ topic: " ", character: "", ageRange: "9-12" as never, minutes: 20 });
    expect(errors).toHaveLength(4);
  });

  it("rejects blank or too many items", () => {
    expect(validateRequest({ ...base, items: ["ball", " "] })).toHaveLength(1);
    expect(validateRequest({ ...base, items: Array(7).fill("ball") })).toHaveLength(1);
  });
});

describe("buildTemplateScript", () => {
  const topics = ["colors", "counting", "farm animals", "shapes", "bedtime", "brushing teeth", "dinosaurs"];

  it.each(topics)("passes its own review for %s at every age and length", (topic) => {
    for (const ageRange of AGE_RANGES) {
      for (const minutes of [1, 3, 8]) {
        const script = buildTemplateScript({ ...base, topic, ageRange, minutes });
        expect(reviewScript(script, ageRange)).toEqual([]);
      }
    }
  });

  it("opens on the hook and ends before the target length", () => {
    const script = buildTemplateScript(base);
    expect(script.beats[0]).toMatchObject({ at: 0, label: "Hook" });
    expect(script.beats.at(-1)!.at).toBeLessThanOrEqual(180);
  });

  it("gives one loop per custom item", () => {
    const script = buildTemplateScript({ ...base, items: ["pink shoe", "orange cup", "purple kite", "white cloud"] });
    expect(script.beats.filter((b) => b.label.startsWith("Loop"))).toHaveLength(4);
    expect(renderMarkdown(script)).toContain("Purple kite, purple kite!");
  });

  it("falls back to a generic pack for an unknown topic", () => {
    expect(pickPack("dinosaurs").finale).toBe("dinosaurs surprise");
    expect(pickPack("Learn COLOURS").goal).toBe("ball");
  });
});

describe("reviewScript", () => {
  const good = buildTemplateScript(base);

  it("flags long lines, missing repetition, missing questions and unsafe words", () => {
    const bad: KidsScript = {
      ...good,
      catchphrase: "Never said anywhere",
      beats: [
        {
          at: 10,
          label: "Hook",
          lines: [
            { speaker: "PIP", text: "This line is far too long for a two year old to follow", pause: false, cue: "" },
            { speaker: "PIP", text: "The monster wants to kill us", pause: false, cue: "" },
          ],
        },
      ],
    };
    const warnings = reviewScript(bad, "2-4").join("\n");
    expect(warnings).toMatch(/hook/i);
    expect(warnings).toMatch(/over 8 words/);
    expect(warnings).toMatch(/catchphrase appears 0/);
    expect(warnings).toMatch(/viewer question/);
    expect(warnings).toMatch(/unsafe/i);
  });

  it("matches unsafe words whole, not inside other words", () => {
    const skill: KidsScript = { ...good, title: "Skill builders: undead-free fun" };
    expect(reviewScript(skill, "2-4")).toEqual([]);
  });

  it("flags beats out of time order", () => {
    const shuffled = { ...good, beats: [good.beats[0]!, good.beats[3]!, good.beats[2]!] };
    expect(reviewScript(shuffled, "2-4").join()).toMatch(/out of time order/);
  });
});

describe("renderMarkdown", () => {
  it("renders beats, pauses, cues and review notes", () => {
    const md = renderMarkdown(buildTemplateScript(base), ["Something to fix"]);
    expect(md).toMatch(/^# Pip the Puppy Finds the Yellow Ball!/);
    expect(md).toContain("## 0:00 — Hook");
    expect(md).toContain("*(pause 2s)*");
    expect(md).toContain("*[boing!]*");
    expect(md).toContain("⚠️ Something to fix");
  });

  it("formats timestamps as m:ss", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(479.6)).toBe("8:00");
  });
});

describe("Claude mode", () => {
  it("puts the whole method in the system prompt and the episode in the user turn", () => {
    const system = buildSystemPrompt();
    for (const rule of METHOD_RULES) expect(system).toContain(rule);
    const user = buildUserPrompt({ ...base, ageRange: "4-6", items: ["kite"] });
    expect(user).toContain("Pip the Puppy");
    expect(user).toContain("10 words or fewer");
    expect(user).toContain("kite");
  });

  function fakeClient(response: object) {
    const create = vi.fn().mockResolvedValue(response);
    return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
  }

  it("requests structured output with fallbacks and parses the script", async () => {
    const script = buildTemplateScript(base);
    const { client, create } = fakeClient({
      stop_reason: "end_turn",
      stop_details: null,
      content: [{ type: "text", text: JSON.stringify(script) }],
    });
    await expect(generateWithClaude(base, client)).resolves.toEqual(script);
    const params = create.mock.calls[0]![0];
    expect(params).toMatchObject({ model: MODEL, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(params.output_config.format.type).toBe("json_schema");
  });

  it("turns a refusal, a cut-off and unreadable output into clear errors", async () => {
    const refusal = fakeClient({ stop_reason: "refusal", stop_details: { explanation: "nope" }, content: [] });
    await expect(generateWithClaude(base, refusal.client)).rejects.toThrow(/declined.*nope/);

    const cutOff = fakeClient({ stop_reason: "max_tokens", stop_details: null, content: [] });
    await expect(generateWithClaude(base, cutOff.client)).rejects.toThrow(ScriptGenerationError);

    const garbled = fakeClient({ stop_reason: "end_turn", stop_details: null, content: [{ type: "text", text: "{" }] });
    await expect(generateWithClaude(base, garbled.client)).rejects.toThrow(/readable/);
  });
});
