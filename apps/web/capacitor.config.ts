import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell for the App Store and Play Store.
 *
 * The web build is bundled into the app, and it talks to the Railway API over
 * HTTPS — so a deploy of the server reaches every installed app immediately,
 * and only UI changes need a store review.
 */
const config: CapacitorConfig = {
  appId: "app.safehubby",
  appName: "Safehubby",
  webDir: "dist",
  server: {
    // Cookies are only sent to https origins from a native webview, and the
    // session is an HttpOnly cookie, so this must stay https in a real build.
    androidScheme: "https",
    iosScheme: "https",
  },
  ios: {
    // The SOS is held, not tapped; the webview must not hijack the gesture.
    contentInset: "always",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_safehubby",
      iconColor: "#000000",
    },
  },
};

export default config;
