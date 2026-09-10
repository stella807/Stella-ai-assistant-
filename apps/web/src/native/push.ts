import { PushNotifications } from "@capacitor/push-notifications";
import { isNative } from "./platform.ts";

/**
 * Registering the guardian's device for push.
 *
 * The traveler's own check-in reminders are local notifications — they fire
 * with no signal, which is where a miss matters most. This is the other side:
 * the guardian's app is closed and their phone is in a pocket, and only a real
 * push from a server reaches them.
 *
 * Browsers get nothing here. Web push needs a service worker and VAPID keys,
 * a different integration entirely, so the web build reports `unsupported`
 * rather than pretending — see docs/push.md.
 */

export type PushState = "unsupported" | "denied" | "registered";

export interface PushRegistration {
  state: PushState;
  token?: string;
  platform?: "ios" | "android";
}

/**
 * Asks for permission and waits for the provider's token.
 *
 * The token arrives on an event rather than from the call, so this wraps the
 * listener in a promise with a timeout: a registration that never resolves
 * would hang the caller, and the honest answer after a few seconds of silence
 * is that push is not working rather than that it is still trying.
 */
export async function registerForPush(timeoutMs = 10_000): Promise<PushRegistration> {
  if (!isNative()) return { state: "unsupported" };

  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== "granted") return { state: "denied" };

    const token = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      void PushNotifications.addListener("registration", (t) => {
        clearTimeout(timer);
        resolve(t.value);
      });
      void PushNotifications.addListener("registrationError", () => {
        clearTimeout(timer);
        resolve(null);
      });
      void PushNotifications.register();
    });

    if (!token) return { state: "denied" };
    return {
      state: "registered",
      token,
      platform: navigator.userAgent.includes("Android") ? "android" : "ios",
    };
  } catch {
    return { state: "unsupported" };
  }
}
