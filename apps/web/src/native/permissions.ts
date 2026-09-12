import { isNative, platform } from "./platform.ts";

/**
 * Asking for the camera and the microphone, properly.
 *
 * These two were the only permissions in the app with no module of their
 * own. Location, notifications and push each ask deliberately; camera and
 * mic relied on whatever prompt the OS happened to raise at the moment of
 * use. On iOS that is a real defect rather than a rough edge:
 *
 *  - **The prompt arrives cold.** The first time someone taps "record a
 *    voice message" — which is at 1am, on a night that is already going
 *    badly — iOS shows a system dialog with no context. People deny cold
 *    prompts.
 *  - **A denial is permanent.** iOS asks once. After a refusal the API just
 *    fails forever, with no second dialog and no way for the app to re-ask.
 *    The feature is dead until the person finds it in Settings themselves,
 *    and until now nothing told them that.
 *
 * So the rule here: **explain before the OS asks, and have an answer for
 * "no".** `prime` copy is what a UI shows first; `recovery` copy is what it
 * shows once the only remaining fix is Settings.
 *
 * Nothing in here grants anything. It reports state and triggers the real
 * request at a moment the person has already agreed to.
 */

export type PermissionName = "camera" | "microphone";

export type PermissionState =
  /** Never asked. The OS will prompt, so prime first. */
  | "prompt"
  | "granted"
  /** Asked and refused. On iOS this does not come back on its own. */
  | "denied"
  /** No such hardware or API here. Not a refusal, and must not be shown as one. */
  | "unavailable";

export interface PermissionCopy {
  /** Why we are about to ask, shown before the OS dialog. */
  prime: string;
  /** What to do once "denied" is the answer and asking again cannot work. */
  recovery: string;
}

const COPY: Record<PermissionName, PermissionCopy> = {
  camera: {
    prime:
      "Safehubby needs your camera for the photos that keep a task honest — the assistant's selfie when they arrive, what they're about to buy, and the receipt after. Photos are only ever taken when you or your assistant tap to take one.",
    recovery:
      "Camera access is turned off, and iOS only asks once. Open Settings → Safehubby → Camera to turn it back on.",
  },
  microphone: {
    prime:
      "Safehubby needs your microphone so you can send a voice message instead of typing — to the assistant working your task, or to whoever is watching out for you tonight. Nothing is recorded until you hold the record button.",
    recovery:
      "Microphone access is turned off, and iOS only asks once. Open Settings → Safehubby → Microphone to turn it back on.",
  },
};

export function permissionCopy(name: PermissionName): PermissionCopy {
  return COPY[name];
}

/** Where to send someone whose only remaining fix is the OS settings app. */
export function settingsPath(name: PermissionName): string {
  if (platform() === "ios") return `Settings → Safehubby → ${name === "camera" ? "Camera" : "Microphone"}`;
  if (platform() === "android") return "Settings → Apps → Safehubby → Permissions";
  return "your browser's site settings for this page";
}

/**
 * What the OS currently thinks, without asking.
 *
 * Uses the Permissions API where it exists. Safari — which is every iOS
 * webview — does not implement it for camera or microphone, so this answers
 * `"prompt"` there rather than guessing. That is the honest answer: we do
 * not know, and the only way to find out is to ask. It is also why a UI must
 * never render a denial from this alone, only from a refused `request`.
 */
export async function permissionState(name: PermissionName): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unavailable";
  const query = navigator.permissions?.query;
  if (!query) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName & "camera" });
    if (status.state === "granted" || status.state === "denied") return status.state;
    return "prompt";
  } catch {
    // Safari throws for these names rather than returning anything. Not
    // knowing is "prompt", never "denied".
    return "prompt";
  }
}

/**
 * Triggers the real OS prompt, and releases the hardware immediately.
 *
 * Call this from a UI that has already explained why — the prime copy above
 * — and never on app start. A permission asked for at launch, before anyone
 * knows what the app does, is the single most likely one to be refused, and
 * on iOS a refusal cannot be taken back.
 *
 * The stream is stopped the moment it is granted: this asks, it does not
 * record. Leaving it open would light the recording indicator for no reason,
 * which is its own kind of lie about what the app is doing.
 */
export async function requestPermission(name: PermissionName): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unavailable";
  const constraints: MediaStreamConstraints =
    name === "camera" ? { video: true } : { audio: true };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    for (const track of stream.getTracks()) track.stop();
    return "granted";
  } catch (err) {
    // NotFoundError means there is no such device — a laptop with no camera,
    // a simulator with no mic. Reporting that as a refusal would send someone
    // to a Settings screen that cannot help them.
    const name_ = (err as { name?: string })?.name;
    if (name_ === "NotFoundError" || name_ === "OverconstrainedError") return "unavailable";
    return "denied";
  }
}

/**
 * Whether the app should explain itself before asking.
 *
 * True on a native build with an un-asked permission — the case where a cold
 * prompt is both likely to be refused and impossible to re-ask. On the web a
 * refusal is recoverable by reloading, so the browser's own prompt is fine
 * and an extra screen is just a screen.
 */
export function shouldPrime(state: PermissionState): boolean {
  return isNative() && state === "prompt";
}
