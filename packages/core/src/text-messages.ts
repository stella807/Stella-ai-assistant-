import type { Iso8601 } from "./types.ts";

/**
 * Typed messages between a subscriber and the assistant working their task.
 *
 * The thread already carried voice and photos and had no text at all, which
 * left the most ordinary case unserved: an assistant standing in an aisle
 * needing to ask "the 8ft or the 10ft?" had to record audio to do it. Text
 * is also the accessible option — it works in a loud bar, for someone who is
 * hard of hearing, and for someone who cannot speak freely because of who is
 * standing next to them.
 *
 * Same shape and the same rules as `voice-messages.ts`: scoped to one task,
 * attributed to one side of it, and sealed at rest by the API
 * (`sealTaskMessages` in crypto.ts). What a subscriber types to the person
 * they have let into their evening is not something the operator of this app
 * has any business reading out of a database.
 */

export type MessageSender = "traveler" | "assistant";

/** Long enough for a real question with an address in it; short enough that
 *  the thread stays a conversation rather than a document store. */
export const MAX_TEXT_MESSAGE_LENGTH = 800;

export interface TextMessage {
  id: string;
  taskId: string;
  travelerId: string;
  sender: MessageSender;
  body: string;
  createdAt: Iso8601;
  /** Set when the other side has seen it, so an assistant can tell whether
   *  silence means "not yet read" or "read and thinking". */
  readAt?: Iso8601;
}

export interface SendTextMessageInput {
  id: string;
  taskId: string;
  travelerId: string;
  sender: MessageSender;
  body: string;
  now: Date;
}

export function validateTextMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Write something to send.");
  if (trimmed.length > MAX_TEXT_MESSAGE_LENGTH) {
    throw new Error(`Keep a message under ${MAX_TEXT_MESSAGE_LENGTH} characters.`);
  }
  return trimmed;
}

export function sendTextMessage(input: SendTextMessageInput): TextMessage {
  return {
    id: input.id,
    taskId: input.taskId,
    travelerId: input.travelerId,
    sender: input.sender,
    body: validateTextMessage(input.body),
    createdAt: input.now.toISOString(),
  };
}

/** One task's thread, oldest first — the order a conversation is read in. */
export function messagesForTask(messages: TextMessage[], taskId: string): TextMessage[] {
  return messages
    .filter((m) => m.taskId === taskId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Marks the other side's messages as read. Only theirs: marking your own
 * read would make the receipt meaningless, and it is the one field here
 * whose whole value is that it is not set by the person it describes.
 */
export function markRead(
  messages: TextMessage[], taskId: string, reader: MessageSender, now: Date,
): TextMessage[] {
  return messages.map((m) =>
    m.taskId === taskId && m.sender !== reader && !m.readAt
      ? { ...m, readAt: now.toISOString() }
      : m);
}

export function unreadCount(messages: TextMessage[], taskId: string, reader: MessageSender): number {
  return messages.filter((m) => m.taskId === taskId && m.sender !== reader && !m.readAt).length;
}
