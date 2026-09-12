/**
 * Recording a voice message.
 *
 * Plain `MediaRecorder` rather than a Capacitor plugin: unlike location, this
 * needs no background access and no native permission dance beyond the
 * microphone prompt the browser already handles — the same web API works
 * inside the native shell's webview as it does on the web build.
 */

export type MicrophoneDenied = "denied" | "unavailable";

export interface RecordedClip {
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
}

function pickMimeType(): string {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "audio/webm";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // "data:audio/webm;base64,AAAA..." — only the part after the comma is
      // the payload the domain layer validates and stores.
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

/**
 * A recording in progress. `stop()` resolves with the clip; `cancel()` throws
 * it away. Auto-stops at `maxSeconds` so a caller cannot silently exceed the
 * server's own cap (`MAX_VOICE_MESSAGE_SECONDS` in voice-messages.ts) by
 * holding the button down too long.
 */
export interface ActiveRecording {
  stop(): Promise<RecordedClip>;
  cancel(): void;
}

export async function startRecording(maxSeconds: number): Promise<ActiveRecording | MicrophoneDenied> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unavailable";

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return "denied";
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());

  const finish = (): Promise<RecordedClip> =>
    new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        stopTracks();
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const audioBase64 = await blobToBase64(blob);
          const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
          resolve({ audioBase64, mimeType, durationSeconds });
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Could not process the recording."));
        }
      };
      recorder.stop();
    });

  recorder.start();
  const autoStop = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, maxSeconds * 1000);

  return {
    stop: () => { clearTimeout(autoStop); return finish(); },
    cancel: () => {
      clearTimeout(autoStop);
      recorder.onstop = () => stopTracks();
      if (recorder.state !== "inactive") recorder.stop();
      else stopTracks();
    },
  };
}
