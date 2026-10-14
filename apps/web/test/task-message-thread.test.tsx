import { describe, expect, it } from "vitest";
import type { VoiceMessage } from "@safehubby/core";
import type { TaskTextMessage } from "../src/api.ts";
import { buildThread } from "../src/components/TaskMessageThread.tsx";

const text = (id: string, at: string, sender: "traveler" | "assistant" = "traveler"): TaskTextMessage =>
  ({ id, taskId: "t1", sender, body: `body ${id}`, createdAt: at });

const voice = (id: string, at: string, sender: "traveler" | "assistant" = "assistant"): VoiceMessage =>
  ({
    id, taskId: "t1", travelerId: "tr1", sender,
    audioBase64: "AA", mimeType: "audio/webm", durationSeconds: 3, createdAt: at,
  });

describe("the task message thread", () => {
  it("reads in the order the conversation actually happened", () => {
    // The regression this exists for: typed messages rendered in one list and
    // voice notes in another, with the compose box between them, so an
    // exchange that alternated could not be read in order at all.
    const thread = buildThread(
      [text("t-1", "2026-10-14T18:00:00Z"), text("t-2", "2026-10-14T18:02:00Z")],
      [voice("v-1", "2026-10-14T18:01:00Z")],
    );
    expect(thread.map((e) => e.message.id)).toEqual(["t-1", "v-1", "t-2"]);
  });

  it("keeps each message's kind, so the right thing is rendered", () => {
    const thread = buildThread([text("t-1", "2026-10-14T18:00:00Z")], [voice("v-1", "2026-10-14T18:01:00Z")]);
    expect(thread[0]!.kind).toBe("text");
    expect(thread[1]!.kind).toBe("voice");
  });

  it("handles a thread of only one kind, and of none", () => {
    expect(buildThread([], [])).toEqual([]);
    expect(buildThread([text("t-1", "2026-10-14T18:00:00Z")], []).length).toBe(1);
    expect(buildThread([], [voice("v-1", "2026-10-14T18:00:00Z")]).length).toBe(1);
  });

  it("does not reorder two messages sent in the same second", () => {
    // A stable sort keeps whatever order the server returned rather than
    // shuffling a tie, which would make the thread jump around between polls.
    const same = "2026-10-14T18:00:00Z";
    const thread = buildThread([text("t-1", same), text("t-2", same)], [voice("v-1", same)]);
    expect(thread.map((e) => e.message.id)).toEqual(["t-1", "t-2", "v-1"]);
  });
});
