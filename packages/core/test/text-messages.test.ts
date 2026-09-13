import { describe, expect, it } from "vitest";
import {
  MAX_TEXT_MESSAGE_LENGTH, markRead, messagesForTask, sendTextMessage, unreadCount,
  validateTextMessage, type TextMessage,
} from "../src/text-messages.ts";

const now = new Date("2026-12-05T22:10:00Z");
const send = (over: Partial<Parameters<typeof sendTextMessage>[0]> = {}) => sendTextMessage({
  id: "m1", taskId: "t1", travelerId: "usr1", sender: "traveler",
  body: "The 8ft ones, not the 10ft", now, ...over,
});

describe("what can be sent", () => {
  it("keeps a real message and trims it", () => {
    expect(send({ body: "  the 8ft ones  " }).body).toBe("the 8ft ones");
  });

  it("refuses an empty message rather than sending a blank bubble", () => {
    expect(() => validateTextMessage("")).toThrow(/write something/i);
    expect(() => validateTextMessage("   ")).toThrow(/write something/i);
  });

  it("bounds the length so a thread stays a conversation", () => {
    expect(() => validateTextMessage("x".repeat(MAX_TEXT_MESSAGE_LENGTH + 1))).toThrow(/under 800/i);
    expect(validateTextMessage("x".repeat(MAX_TEXT_MESSAGE_LENGTH))).toHaveLength(MAX_TEXT_MESSAGE_LENGTH);
  });

  it("records which side sent it", () => {
    expect(send().sender).toBe("traveler");
    expect(send({ sender: "assistant" }).sender).toBe("assistant");
  });
});

describe("the thread", () => {
  const thread: TextMessage[] = [
    { id: "b", taskId: "t1", travelerId: "u", sender: "assistant", body: "second", createdAt: "2026-12-05T22:11:00Z" },
    { id: "a", taskId: "t1", travelerId: "u", sender: "traveler", body: "first", createdAt: "2026-12-05T22:10:00Z" },
    { id: "c", taskId: "t2", travelerId: "u", sender: "traveler", body: "other task", createdAt: "2026-12-05T22:12:00Z" },
  ];

  it("reads oldest first, and only this task", () => {
    expect(messagesForTask(thread, "t1").map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("never leaks another task's thread", () => {
    expect(messagesForTask(thread, "t2").map((m) => m.body)).toEqual(["other task"]);
    expect(messagesForTask(thread, "nope")).toEqual([]);
  });
});

describe("read receipts", () => {
  const thread: TextMessage[] = [
    { id: "a", taskId: "t1", travelerId: "u", sender: "traveler", body: "mine", createdAt: "2026-12-05T22:10:00Z" },
    { id: "b", taskId: "t1", travelerId: "u", sender: "assistant", body: "theirs", createdAt: "2026-12-05T22:11:00Z" },
  ];

  it("marks the other side's messages, never your own", () => {
    // The whole value of a receipt is that the person it describes did not
    // set it. Marking your own read would make it say nothing.
    const after = markRead(thread, "t1", "traveler", now);
    expect(after.find((m) => m.id === "b")!.readAt).toBe(now.toISOString());
    expect(after.find((m) => m.id === "a")!.readAt).toBeUndefined();
  });

  it("does not move a receipt that is already set", () => {
    const once = markRead(thread, "t1", "traveler", now);
    const later = new Date(now.getTime() + 60_000);
    const twice = markRead(once, "t1", "traveler", later);
    expect(twice.find((m) => m.id === "b")!.readAt).toBe(now.toISOString());
  });

  it("counts what the reader has not seen, from their own side", () => {
    expect(unreadCount(thread, "t1", "traveler")).toBe(1);
    expect(unreadCount(thread, "t1", "assistant")).toBe(1);
    expect(unreadCount(markRead(thread, "t1", "traveler", now), "t1", "traveler")).toBe(0);
  });

  it("leaves another task's unread count alone", () => {
    expect(unreadCount(thread, "t2", "traveler")).toBe(0);
  });
});
