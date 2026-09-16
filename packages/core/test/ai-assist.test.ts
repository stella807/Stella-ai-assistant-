import { describe, expect, it } from "vitest";
import { MAX_AI_DRAFT_INSTRUCTION, validateAiDraftInstruction } from "../src/ai-assist.ts";

describe("validateAiDraftInstruction", () => {
  it("rejects an empty instruction", () => {
    expect(validateAiDraftInstruction("")).toMatch(/say what/i);
    expect(validateAiDraftInstruction("   ")).toMatch(/say what/i);
  });

  it("rejects one over the length cap", () => {
    const tooLong = "x".repeat(MAX_AI_DRAFT_INSTRUCTION + 1);
    expect(validateAiDraftInstruction(tooLong)).toMatch(/under/i);
  });

  it("accepts anything reasonable in between", () => {
    expect(validateAiDraftInstruction("they were out of the 2lb bag, got the 1lb")).toBeNull();
    expect(validateAiDraftInstruction("x".repeat(MAX_AI_DRAFT_INSTRUCTION))).toBeNull();
  });
});
