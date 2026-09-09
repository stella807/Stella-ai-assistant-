import { LocalNotifications } from "@capacitor/local-notifications";
import { isNative } from "./platform.ts";

/**
 * Check-in reminders.
 *
 * Local notifications, not push: the schedule is computed on the device from
 * the check-in due time, so a reminder still fires with no signal in a
 * basement bar — which is exactly where a missed check-in matters most.
 */

export async function requestNotifications(): Promise<boolean> {
  if (!isNative()) {
    if (!("Notification" in window)) return false;
    return (await Notification.requestPermission()) === "granted";
  }
  const status = await LocalNotifications.requestPermissions();
  return status.display === "granted";
}

const CHECK_IN_ID = 1001;

export async function scheduleCheckInReminder(dueAt: string, minutesLate = 0): Promise<void> {
  const at = new Date(new Date(dueAt).getTime() + minutesLate * 60_000);
  if (at.getTime() <= Date.now()) return;

  if (!isNative()) return;

  // A single, replaced notification rather than a queue: firing a stack of
  // stale reminders at someone is how an app gets its notifications turned off.
  await LocalNotifications.cancel({ notifications: [{ id: CHECK_IN_ID }] });
  await LocalNotifications.schedule({
    notifications: [{
      id: CHECK_IN_ID,
      title: "Safehubby check-in",
      body: "Tap to let your people know you're alright.",
      schedule: { at, allowWhileIdle: true },
      // Matches the HIGH-importance channel created in SafehubbyApplication;
      // the default channel would deliver this silently.
      channelId: "safehubby-checkins",
    }],
  });
}

export async function cancelCheckInReminder(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: CHECK_IN_ID }] });
}
