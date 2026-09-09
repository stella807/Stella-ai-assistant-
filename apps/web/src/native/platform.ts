import { Capacitor } from "@capacitor/core";

/**
 * One place that knows whether we are inside the native shell.
 *
 * Everything else asks this rather than sniffing the user agent, so the web
 * build and the app build run the same code paths and only the capabilities
 * differ.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platform = (): string => Capacitor.getPlatform();

/** The API origin. Bundled apps talk to the deployed server; the web build is same-origin. */
export const apiBase = (): string => {
  if (!isNative()) return "";
  const configured = import.meta.env.VITE_API_URL;
  if (!configured) {
    throw new Error("VITE_API_URL must be set for native builds — see docs/mobile.md");
  }
  return String(configured).replace(/\/$/, "");
};
