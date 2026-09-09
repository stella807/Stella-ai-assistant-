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

/**
 * Why the app cannot talk to a server, if it cannot. Returned rather than
 * thrown so the UI can show the actual cause: a native build with no API URL
 * looks exactly like a server outage otherwise, and gets debugged as one.
 */
export const configError = (): string | null => {
  if (!isNative()) return null;
  return import.meta.env.VITE_API_URL
    ? null
    : "This build has no API address. It was compiled without VITE_API_URL — see docs/mobile.md.";
};

/** The API origin. Bundled apps talk to the deployed server; the web build is same-origin. */
export const apiBase = (): string => {
  if (!isNative()) return "";
  const configured = import.meta.env.VITE_API_URL;
  if (!configured) return "";
  return String(configured).replace(/\/$/, "");
};
