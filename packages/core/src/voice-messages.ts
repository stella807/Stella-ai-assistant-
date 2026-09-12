import type { Iso8601 } from "./types.ts";

/**
 * Async voice messages between a traveler and their concierge assistant.
 *
 * Not a live call. A live call needs a telephony provider in the loop
 * (Twilio Voice or similar) with its own real-time infrastructure; a voice
 * clip is a file, and a file fits the same store-and-forward shape as
 * everything else in this app. It also means an assistant mid-task, whose
 * hands may not be free, is never expected to pick up a ringing call.
 *
 * Storage is deliberately small and bounded. This prototype keeps the clip
 * itself (base64) inline in the same JSON document as everything else —
 * `MAX_VOICE_MESSAGE_BYTES` exists because that document is not built to hold
 * media at scale (see SECURITY.md). A real deployment should push clips to
 * object storage (S3, R2) and store a URL here instead; the validation and
 * domain rules below do not change when it does.
 */

export type VoiceMessageSender = "traveler" | "assistant";

export const MAX_VOICE_MESSAGE_SECONDS = 60;
/** Comfortably covers a minute of compressed speech (opus/aac at typical
 *  voice bitrates), with room to spare, while still capping the JSON
 *  document's growth per message. */
export const MAX_VOICE_MESSAGE_BYTES = 1_500_000;

export interface VoiceMessage {
  id: string;
  taskId: string;
  travelerId: string;
  sender: VoiceMessageSender;
  /** Base64-encoded audio. See the module doc for why, and what a real
   *  deployment should do instead. */
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
  createdAt: Iso8601;
}

export interface RecordVoiceMessageInput {
  id: string;
  taskId: string;
  travelerId: string;
  sender: VoiceMessageSender;
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
  now: Date;
}

/** Rough size of the decoded audio from its base64 length, without actually
 *  decoding it — good enough to enforce a ceiling before it is stored. */
/** Exported for reuse wherever else a base64 upload needs a size ceiling
 *  before storage — see identity photos in concierge.ts. */
export function approximateDecodedBytes(base64: string): number {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function recordVoiceMessage(input: RecordVoiceMessageInput): VoiceMessage {
  if (!input.audioBase64.trim()) throw new Error("No audio was recorded.");
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new Error("That clip has no length.");
  }
  if (input.durationSeconds > MAX_VOICE_MESSAGE_SECONDS) {
    throw new Error(`Voice messages are capped at ${MAX_VOICE_MESSAGE_SECONDS} seconds — keep it short.`);
  }
  const bytes = approximateDecodedBytes(input.audioBase64);
  if (bytes > MAX_VOICE_MESSAGE_BYTES) {
    throw new Error("That clip is too large to send. Try a shorter one.");
  }
  if (!input.mimeType.startsWith("audio/")) throw new Error("That doesn't look like an audio clip.");

  return {
    id: input.id,
    taskId: input.taskId,
    travelerId: input.travelerId,
    sender: input.sender,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
    durationSeconds: input.durationSeconds,
    createdAt: input.now.toISOString(),
  };
}

export function voiceMessagesFor(messages: VoiceMessage[], taskId: string): VoiceMessage[] {
  return messages.filter((m) => m.taskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
