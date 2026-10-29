import { Geolocation, type Position } from "@capacitor/geolocation";
import { isNative } from "./platform.ts";

/**
 * Device location.
 *
 * On the App Store path this is the whole reason for a native shell: iOS gives
 * web apps no background location at all, so a browser build can only report
 * where someone was when the tab was last open — useless for a safety app whose
 * job is to know where someone is while the phone is in their pocket.
 */

export interface Fix {
  lat: number;
  lng: number;
  accuracyMeters: number;
  at: string;
}

export type LocationDenied = "denied" | "unavailable";

const toFix = (p: Position | GeolocationPosition): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracyMeters: Math.round(p.coords.accuracy ?? 0),
  at: new Date(p.timestamp).toISOString(),
});

/**
 * Asks for permission. Returns what happened rather than throwing, because a
 * refusal is a normal answer the UI has to explain, not an error.
 */
export async function requestPermission(): Promise<"granted" | LocationDenied> {
  if (!isNative()) {
    return "geolocation" in navigator ? "granted" : "unavailable";
  }
  try {
    const status = await Geolocation.requestPermissions({ permissions: ["location"] });
    return status.location === "granted" || status.location === "prompt-with-rationale"
      ? "granted"
      : "denied";
  } catch {
    return "unavailable";
  }
}

export async function currentFix(): Promise<Fix | null> {
  try {
    if (isNative()) {
      // Android will not hand out a fix until permission has been asked for; a refusal is a null, not a throw.
      if ((await requestPermission()) !== "granted") return null;
      return toFix(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 }));
    }
    // High accuracy first; if the GPS cannot settle (indoors, or iOS answering "position unavailable"),
    // fall back to the coarse Wi-Fi/cell fix rather than giving up. A refusal is final, so it is not retried.
    const read = (opts: PositionOptions) =>
      new Promise<Fix | "denied" | null>((resolve) => {
        if (!("geolocation" in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(toFix(p)),
          (e) => resolve(e.code === e.PERMISSION_DENIED ? "denied" : null),
          opts,
        );
      });
    const precise = await read({ enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 });
    if (precise === "denied") return null;
    if (precise) return precise;
    const coarse = await read({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 });
    return coarse === "denied" ? null : coarse;
  } catch {
    return null;
  }
}

/**
 * True when the browser has been told never to share location for this site.
 * In that state getCurrentPosition fails at once and never shows a prompt,
 * which looks to the rider like a dead button. Safari before 16 has no
 * Permissions API for this, so "unknown" is reported as not blocked.
 */
export async function locationBlocked(): Promise<boolean> {
  try {
    if (isNative() || !navigator.permissions?.query) return false;
    return (await navigator.permissions.query({ name: "geolocation" })).state === "denied";
  } catch {
    return false;
  }
}

/**
 * True when a fix can be read without showing a prompt. Asking cold on page
 * load, before the rider has tapped anything, is the easiest way to get a
 * reflex "Don't Allow" that Safari then remembers for the site.
 */
export async function locationAlreadyAllowed(): Promise<boolean> {
  try {
    if (isNative()) return true; // the native app asks in its own flow
    if (!navigator.permissions?.query) return false;
    return (await navigator.permissions.query({ name: "geolocation" })).state === "granted";
  } catch {
    return false;
  }
}

export type StopWatching = () => void;

/**
 * Streams fixes. The distance filter is what keeps this off the battery: a
 * phone sitting on a bar does not need a fix every second, and a night out
 * that flattens the handset by midnight is a safety feature that turned itself
 * off.
 */
export async function watchLocation(onFix: (fix: Fix) => void): Promise<StopWatching> {
  if (isNative()) {
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 30_000 },
      (position, err) => { if (!err && position) onFix(toFix(position)); },
    );
    return () => void Geolocation.clearWatch({ id });
  }

  if (!("geolocation" in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(toFix(p)),
    () => {},
    { enableHighAccuracy: true, maximumAge: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
