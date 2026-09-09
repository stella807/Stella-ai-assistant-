package app.safehubby;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;

/**
 * Creates the notification channel for check-in reminders.
 *
 * The default channel Capacitor would otherwise use has DEFAULT importance,
 * which on most phones means the reminder appears silently in the shade. A
 * check-in nobody notices is a check-in nobody answers, and a missed check-in is
 * what alerts the person waiting up — so this one is HIGH: it makes a sound and
 * shows as a heads-up notification.
 *
 * The channel is declared here rather than at schedule time because Android
 * fixes a channel's importance at creation. A user can still turn it down, and
 * that is their call to make.
 */
public class SafehubbyApplication extends Application {

    /** Must match the channelId used in src/native/notify.ts. */
    public static final String CHECK_IN_CHANNEL = "safehubby-checkins";

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel checkIns = new NotificationChannel(
            CHECK_IN_CHANNEL,
            "Check-in reminders",
            NotificationManager.IMPORTANCE_HIGH
        );
        checkIns.setDescription("Nudges to check in while you are out, so the people watching know you are alright.");
        checkIns.enableVibration(true);
        checkIns.setShowBadge(true);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(checkIns);
    }
}
