import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_MESSAGE_BYTES, MAX_VOICE_MESSAGE_SECONDS, recordVoiceMessage, voiceMessagesFor,
} from "../src/voice-messages.ts";
import type { RecordVoiceMessageInput } from "../src/voice-messages.ts";

const now = new Date("2026-04-01T20:00:00Z");

// A tiny valid base64 blob — the content doesn't matter to validation, only
// its rough decoded size and whether it decodes as base64 at all.
const CLIP = Buffer.from("a short clip of audio").toString("base64");

const input = (over: Partial<RecordVoiceMessageInput> = {}): RecordVoiceMessageInput => ({
  id: "vm_1",
  taskId: "ct_1",
  travelerId: "t1",
  sender: "traveler",
  audioBase64: CLIP,
  mimeType: "audio/webm",
  durationSeconds: 12,
  now,
  ...over,
});

describe("recordVoiceMessage", () => {
  it("accepts a normal short clip", () => {
    const m = recordVoiceMessage(input());
    expect(m.sender).toBe("traveler");
    expect(m.durationSeconds).toBe(12);
    expect(m.createdAt).toBe(now.toISOString());
  });

  it("rejects an empty recording", () => {
    expect(() => recordVoiceMessage(input({ audioBase64: "" }))).toThrow(/no audio/i);
    expect(() => recordVoiceMessage(input({ audioBase64: "   " }))).toThrow(/no audio/i);
  });

  it("rejects a non-positive or non-finite duration", () => {
    expect(() => recordVoiceMessage(input({ durationSeconds: 0 }))).toThrow(/no length/i);
    expect(() => recordVoiceMessage(input({ durationSeconds: -3 }))).toThrow(/no length/i);
    expect(() => recordVoiceMessage(input({ durationSeconds: Number.NaN }))).toThrow(/no length/i);
  });

  it("caps how long a clip can be", () => {
    expect(() => recordVoiceMessage(input({ durationSeconds: MAX_VOICE_MESSAGE_SECONDS + 1 }))).toThrow(/capped at/i);
    expect(() => recordVoiceMessage(input({ durationSeconds: MAX_VOICE_MESSAGE_SECONDS }))).not.toThrow();
  });

  it("caps how large the encoded clip can be", () => {
    const huge = "A".repeat(MAX_VOICE_MESSAGE_BYTES * 2);
    expect(() => recordVoiceMessage(input({ audioBase64: huge }))).toThrow(/too large/i);
  });

  it("refuses anything that isn't declared as audio", () => {
    expect(() => recordVoiceMessage(input({ mimeType: "video/mp4" }))).toThrow(/doesn't look like an audio clip/i);
    expect(() => recordVoiceMessage(input({ mimeType: "" }))).toThrow();
  });

  it("records who sent it — traveler or assistant", () => {
    expect(recordVoiceMessage(input({ sender: "assistant" })).sender).toBe("assistant");
  });
});

describe("voiceMessagesFor", () => {
  it("returns only one task's messages, oldest first", () => {
    const a = recordVoiceMessage(input({ id: "vm_a", taskId: "ct_1", now: new Date(now.getTime() + 2000) }));
    const b = recordVoiceMessage(input({ id: "vm_b", taskId: "ct_1", now }));
    const other = recordVoiceMessage(input({ id: "vm_c", taskId: "ct_2", now }));

    const thread = voiceMessagesFor([a, b, other], "ct_1");
    expect(thread.map((m) => m.id)).toEqual(["vm_b", "vm_a"]);
  });

  it("is empty for a task with no messages", () => {
    expect(voiceMessagesFor([], "ct_1")).toEqual([]);
  });
});
